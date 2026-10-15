// Server functions de processamento de XMLs, reprocessamento e análise de alertas.
// A leitura do XML acontece no servidor (não se confia em dados interpretados pelo
// navegador); a gravação é feita por funções do banco que validam permissões,
// duplicidade e consistência em uma única transação.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { gerarAlertas } from "@/lib/analise/alertas";
import {
  CAMPOS_FATURA_SOLAR,
  gerarAlertasSolar,
  montarDadosGd,
  type FaturaSolarEntrada,
} from "@/lib/analise/solar";
import type { FaturaAnalise, UcAnalise } from "@/lib/analise/calculos";
import { buscarItensGd, buscarTodos, CAMPOS_FATURA_ANALISE } from "@/lib/consulta-paginada";
import { normalizarUc } from "@/lib/documentos";
import { CONFIG_ALERTAS_PADRAO, type ConfigAlertas } from "@/lib/tipos";
import {
  hashConteudo,
  lerXml,
  prepararParaGravacao,
  TAMANHO_MAXIMO_XML,
  type ResultadoLeitura,
} from "@/lib/xml/leitor-fatura";
import { BUCKET_XML } from "@/lib/configuracao-backend";

import { comAutenticacao, ErroNegocio, exigirPermissao, mensagemSegura } from "./autenticacao";

const esquemaArquivo = z.object({
  nomeArquivo: z.string().min(1).max(255),
  conteudo: z.string().min(1).max(TAMANHO_MAXIMO_XML),
});

export interface ResumoDocumento {
  tipo: "fatura" | "evento";
  tipoDocumento: string | null;
  chaveAcesso: string | null;
  numeroDocumento: string | null;
  numeroUc: string | null;
  competencia: string | null;
  dataEmissao: string | null;
  valorTotal: number | null;
  consumoKwh: number | null;
  fornecedor: string | null;
  statusDocumento: string | null;
  descricaoEvento?: string | null;
}

export interface ResultadoAnalise {
  nomeArquivo: string;
  situacao: "pronto" | "duplicado" | "uc_nao_cadastrada" | "invalido" | "evento";
  mensagem: string;
  avisos: string[];
  resumo: ResumoDocumento | null;
  uc: {
    id: string;
    numero_uc: string;
    fazenda: string;
    filial: string | null;
    cnpj: string;
  } | null;
  divergencias: string[];
}

function resumir(r: Exclude<ResultadoLeitura, { tipo: "erro" }>): ResumoDocumento {
  if (r.tipo === "evento") {
    return {
      tipo: "evento",
      tipoDocumento: "Evento",
      chaveAcesso: r.evento.chave_acesso,
      numeroDocumento: null,
      numeroUc: null,
      competencia: null,
      dataEmissao: r.evento.data_evento?.slice(0, 10) ?? null,
      valorTotal: null,
      consumoKwh: null,
      fornecedor: null,
      statusDocumento: null,
      descricaoEvento:
        r.evento.tipo_evento === "cancelamento" ? "Cancelamento" : r.evento.descricao,
    };
  }
  const f = r.fatura;
  return {
    tipo: "fatura",
    tipoDocumento: f.tipo_documento,
    chaveAcesso: f.chave_acesso,
    numeroDocumento: f.numero_documento,
    numeroUc: f.numero_uc_extraido,
    competencia: f.periodo_referencia,
    dataEmissao: f.data_emissao,
    valorTotal: f.valor_total,
    consumoKwh: f.consumo_kwh,
    fornecedor: f.nome_fornecedor,
    statusDocumento: f.status_documento,
  };
}

/** Pré-análise sem gravação: valida, extrai e verifica duplicidade e UC. */
export const analisarXml = createServerFn({ method: "POST" })
  .middleware([comAutenticacao])
  .validator((d: unknown) => esquemaArquivo.parse(d))
  .handler(async ({ data, context }): Promise<ResultadoAnalise> => {
    const { supabase } = context;
    await exigirPermissao(supabase, "importar");
    const leitura = lerXml(data.conteudo);
    if (leitura.tipo === "erro") {
      return {
        nomeArquivo: data.nomeArquivo,
        situacao: "invalido",
        mensagem: leitura.erro,
        avisos: [],
        resumo: null,
        uc: null,
        divergencias: [],
      };
    }
    const hash = await hashConteudo(data.conteudo);
    const resumo = resumir(leitura);

    if (leitura.tipo === "evento") {
      const { data: ev } = await supabase
        .from("eventos_fiscais")
        .select("id")
        .eq("hash_arquivo", hash)
        .limit(1);
      const { data: alvo } = await supabase
        .from("faturas")
        .select("id, numero_documento")
        .eq("chave_acesso", leitura.evento.chave_acesso)
        .limit(1);
      return {
        nomeArquivo: data.nomeArquivo,
        situacao: ev?.length ? "duplicado" : "evento",
        mensagem: ev?.length
          ? "Evento já registrado anteriormente."
          : alvo?.length
            ? `Evento (${resumo.descricaoEvento ?? "fiscal"}) da fatura nº ${alvo[0]!.numero_documento ?? "?"} já importada.`
            : `Evento (${resumo.descricaoEvento ?? "fiscal"}) de documento ainda não importado; será aplicado quando a fatura chegar.`,
        avisos: leitura.avisos,
        resumo,
        uc: null,
        divergencias: [],
      };
    }

    const f = leitura.fatura;
    let duplicada = false;
    {
      let q = supabase.from("faturas").select("id").limit(1);
      q = f.chave_acesso
        ? q.or(`chave_acesso.eq.${f.chave_acesso},hash_arquivo.eq.${hash}`)
        : q.eq("hash_arquivo", hash);
      const { data: dup, error } = await q;
      if (error) throw new ErroNegocio("Falha ao verificar duplicidade.");
      duplicada = !!dup?.length;
    }

    const norm = normalizarUc(f.numero_uc_extraido);
    let uc: ResultadoAnalise["uc"] = null;
    if (norm) {
      const { data: ucs } = await supabase
        .from("unidades_consumidoras")
        .select("id, numero_uc, fazenda, filial, cnpj, situacao")
        .eq("numero_uc_normalizado", norm)
        .limit(1);
      uc = ucs?.[0] ?? null;
    }
    const divergencias: string[] = [];
    if (
      uc &&
      f.cnpj_destinatario &&
      f.cnpj_destinatario.replace(/\W/g, "").toUpperCase() !== uc.cnpj
    ) {
      divergencias.push(
        `CNPJ/CPF do destinatário (${f.cnpj_destinatario}) difere do CNPJ cadastrado na UC (${uc.cnpj}).`,
      );
    }

    return {
      nomeArquivo: data.nomeArquivo,
      situacao: duplicada ? "duplicado" : uc ? "pronto" : "uc_nao_cadastrada",
      mensagem: duplicada
        ? "Documento já importado. Não será somado novamente."
        : uc
          ? `UC ${uc.numero_uc} — ${uc.fazenda}`
          : f.numero_uc_extraido
            ? `UC ${f.numero_uc_extraido} não cadastrada: irá para Pendências de Identificação.`
            : "UC não identificada no XML: irá para Pendências de Identificação.",
      avisos: leitura.avisos,
      resumo,
      uc,
      divergencias,
    };
  });

export interface ResultadoImportacao {
  nomeArquivo: string;
  status: "importada" | "pendente_identificacao" | "duplicada" | "evento_registrado" | "erro";
  mensagem: string;
  faturaId: string | null;
  avisos: string[];
}

/** Importa um XML: lê no servidor, guarda o original no armazenamento privado e grava. */
export const importarXml = createServerFn({ method: "POST" })
  .middleware([comAutenticacao])
  .validator((d: unknown) => esquemaArquivo.extend({ loteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ResultadoImportacao> => {
    const { supabase, usuario } = context;
    await exigirPermissao(supabase, "importar");

    const { data: hist, error: errHist } = await supabase
      .from("historico_importacoes")
      .insert({
        lote_id: data.loteId,
        nome_arquivo: data.nomeArquivo,
        tipo_importacao: "xml_fatura",
        quantidade_processada: 1,
        status: "pendente",
        resultado: "Processando…",
        usuario_id: usuario.id,
      })
      .select("id")
      .single();
    if (errHist || !hist)
      throw new ErroNegocio(mensagemSegura(errHist, "Não foi possível registrar a importação."));

    const finalizar = async (r: ResultadoImportacao) => {
      const status =
        r.status === "importada" || r.status === "evento_registrado"
          ? "sucesso"
          : r.status === "pendente_identificacao"
            ? "pendente"
            : r.status === "duplicada"
              ? "duplicado"
              : "falha";
      await supabase
        .from("historico_importacoes")
        .update({
          status,
          resultado: r.mensagem,
          quantidade_importada:
            r.status === "importada" ||
            r.status === "pendente_identificacao" ||
            r.status === "evento_registrado"
              ? 1
              : 0,
          quantidade_rejeitada: r.status === "erro" || r.status === "duplicada" ? 1 : 0,
          detalhes_erros_json: [
            ...(r.status === "erro" ? [{ tipo: "erro", mensagem: r.mensagem }] : []),
            ...r.avisos.map((a) => ({ tipo: "aviso", mensagem: a })),
          ],
        })
        .eq("id", hist.id);
      return r;
    };

    try {
      const leitura = lerXml(data.conteudo);
      if (leitura.tipo === "erro") {
        return await finalizar({
          nomeArquivo: data.nomeArquivo,
          status: "erro",
          mensagem: leitura.erro,
          faturaId: null,
          avisos: [],
        });
      }

      const hash = await hashConteudo(data.conteudo);
      const caminho = `xml/${hash.slice(0, 2)}/${hash}.xml`;
      const { error: errUpload } = await supabase.storage
        .from(BUCKET_XML)
        .upload(caminho, new Blob([data.conteudo], { type: "application/xml" }), {
          contentType: "application/xml",
          upsert: false,
        });
      if (errUpload && !/exist|duplicate/i.test(errUpload.message)) {
        console.error(errUpload);
        return await finalizar({
          nomeArquivo: data.nomeArquivo,
          status: "erro",
          mensagem:
            "Não foi possível armazenar o XML original com segurança. Nenhum dado foi gravado.",
          faturaId: null,
          avisos: leitura.avisos,
        });
      }

      if (leitura.tipo === "evento") {
        const { data: res, error } = await supabase.rpc("registrar_evento_fiscal", {
          p_evento: {
            ...leitura.evento,
            hash_arquivo: hash,
            arquivo_xml_path: caminho,
          },
        });
        if (error) throw error;
        const r = res as { resultado: string; mensagem: string };
        return await finalizar({
          nomeArquivo: data.nomeArquivo,
          status: r.resultado === "duplicada" ? "duplicada" : "evento_registrado",
          mensagem: r.mensagem,
          faturaId: null,
          avisos: leitura.avisos,
        });
      }

      const fatura = prepararParaGravacao(leitura.fatura);
      const { data: res, error } = await supabase.rpc("registrar_fatura", {
        p_fatura: {
          ...fatura,
          hash_arquivo: hash,
          arquivo_xml_path: caminho,
          nome_arquivo: data.nomeArquivo,
        },
        p_itens: leitura.itens,
        p_importacao_id: hist.id,
        p_reprocessar_id: null,
      });
      if (error) throw error;
      const r = res as {
        resultado: ResultadoImportacao["status"];
        mensagem: string;
        fatura_id: string;
      };
      return await finalizar({
        nomeArquivo: data.nomeArquivo,
        status: r.resultado,
        mensagem: r.mensagem,
        faturaId: r.fatura_id ?? null,
        avisos: leitura.avisos,
      });
    } catch (erro) {
      return await finalizar({
        nomeArquivo: data.nomeArquivo,
        status: "erro",
        mensagem: mensagemSegura(
          erro,
          "Erro inesperado ao gravar a fatura. Tente reprocessar o arquivo.",
        ),
        faturaId: null,
        avisos: [],
      });
    }
  });

/** Reprocessa uma fatura a partir do XML original armazenado (sem duplicar). */
export const reprocessarFatura = createServerFn({ method: "POST" })
  .middleware([comAutenticacao])
  .validator((d: unknown) => z.object({ faturaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, usuario } = context;
    await exigirPermissao(supabase, "importar");
    const { data: fatura, error } = await supabase
      .from("faturas")
      .select("id, arquivo_xml_path, nome_arquivo, hash_arquivo")
      .eq("id", data.faturaId)
      .single();
    if (error || !fatura) throw new ErroNegocio("Fatura não encontrada.");
    if (!fatura.arquivo_xml_path)
      throw new ErroNegocio("XML original não disponível para reprocessamento.");

    const { data: arquivo, error: errDown } = await supabase.storage
      .from(BUCKET_XML)
      .download(fatura.arquivo_xml_path);
    if (errDown || !arquivo) throw new ErroNegocio("Não foi possível obter o XML original.");
    const conteudo = await arquivo.text();
    const hash = await hashConteudo(conteudo);
    if (hash !== fatura.hash_arquivo)
      throw new ErroNegocio("O XML armazenado não confere com o hash registrado.");
    const leitura = lerXml(conteudo);
    if (leitura.tipo !== "fatura") {
      throw new ErroNegocio(leitura.tipo === "erro" ? leitura.erro : "O arquivo não é uma fatura.");
    }

    const { data: res, error: errRpc } = await supabase.rpc("registrar_fatura", {
      p_fatura: {
        ...prepararParaGravacao(leitura.fatura),
        hash_arquivo: hash,
        arquivo_xml_path: fatura.arquivo_xml_path,
        nome_arquivo: fatura.nome_arquivo,
      },
      p_itens: leitura.itens,
      p_importacao_id: null,
      p_reprocessar_id: fatura.id,
    });
    const sucesso = !errRpc;
    await supabase.from("historico_importacoes").insert({
      nome_arquivo: fatura.nome_arquivo ?? fatura.arquivo_xml_path,
      tipo_importacao: "reprocessamento",
      quantidade_processada: 1,
      quantidade_atualizada: sucesso ? 1 : 0,
      quantidade_rejeitada: sucesso ? 0 : 1,
      status: sucesso ? "sucesso" : "falha",
      resultado: sucesso
        ? "Fatura reprocessada a partir do XML original."
        : "Falha no reprocessamento.",
      detalhes_erros_json: leitura.avisos.map((a) => ({ tipo: "aviso", mensagem: a })),
      usuario_id: usuario.id,
    });
    if (errRpc) throw new ErroNegocio(mensagemSegura(errRpc, "Falha ao reprocessar a fatura."));
    return res as { resultado: string; mensagem: string; fatura_id: string };
  });

/** Recalcula os alertas de toda a base e grava preservando as análises já feitas. */
export const recalcularAlertas = createServerFn({ method: "POST" })
  .middleware([comAutenticacao])
  .handler(async ({ context }) => {
    const { supabase } = context;
    await exigirPermissao(supabase, "importar");
    try {
      const [faturas, ucs, cfgRes, faturasSolar, itensGd] = await Promise.all([
        buscarTodos<FaturaAnalise>(supabase, "faturas", CAMPOS_FATURA_ANALISE, { excluida: false }),
        buscarTodos<UcAnalise>(
          supabase,
          "unidades_consumidoras",
          "id, numero_uc, fazenda, cnpj, filial, situacao, area",
        ),
        supabase.from("configuracoes").select("valor").eq("chave", "alertas").maybeSingle(),
        buscarTodos<FaturaSolarEntrada>(supabase, "faturas", CAMPOS_FATURA_SOLAR, {
          excluida: false,
        }),
        buscarItensGd(supabase),
      ]);
      const cfg: ConfigAlertas = {
        ...CONFIG_ALERTAS_PADRAO,
        ...((cfgRes.data?.valor as Partial<ConfigAlertas>) ?? {}),
      };
      const alertas = [
        ...gerarAlertas(faturas, ucs, cfg),
        ...gerarAlertasSolar(montarDadosGd(faturasSolar, itensGd), ucs, cfg),
      ];
      const { data, error } = await supabase.rpc("salvar_alertas", { p_alertas: alertas });
      if (error) throw error;
      return data as { novos: number; desativados: number; total: number };
    } catch (erro) {
      throw new ErroNegocio(mensagemSegura(erro, "Falha ao recalcular os alertas."));
    }
  });
