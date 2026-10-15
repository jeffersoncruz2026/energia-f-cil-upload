// Leitura e interpretação de XMLs de documentos fiscais de energia elétrica.
//
// Suporta:
//  - NF3e (modelo 66), com ou sem protocolo de autorização (nf3eProc / NF3e);
//  - Eventos da NF3e (procEventoNF3e / eventoNF3e), ex.: cancelamento;
//  - NF-e (modelo 55) de energia elétrica (ex.: comercializadoras), com extração
//    da UC a partir das informações complementares, quando presente;
//  - Eventos de cancelamento da NF-e.
//
// Regra fundamental: campos ausentes no XML ficam null ("indisponível") — nada é
// presumido ou inventado. Os grupos originais são preservados em
// dados_extraidos_json para auditoria.

import { XMLParser, XMLValidator } from "fast-xml-parser";

import { chaveAcessoValida, normalizarCnpj } from "../documentos";
import type { CamposValoresFatura } from "../tipos";
import {
  ajustarTipoPeloValor,
  classificarItem,
  identificarComponente,
  identificarPosto,
  identificarUnidade,
  normalizarTexto,
  type TipoItem,
} from "./classificacao-itens";
import {
  atributo,
  buscarPrimeiroTexto,
  buscarTodos,
  filho,
  lista,
  num,
  semAssinatura,
  txt,
  type No,
} from "./no-xml";

export const TAMANHO_MAXIMO_XML = 5 * 1024 * 1024; // 5 MB

export interface ItemExtraido {
  numero_item: number | null;
  codigo_produto: string | null;
  codigo_classificacao: string | null;
  descricao: string | null;
  quantidade: number | null;
  unidade_medida: string | null;
  valor_unitario: number | null;
  valor_total: number | null;
  tipo_item: TipoItem;
  componente: string | null;
  posto_tarifario: string | null;
  valor_icms: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  dados_adicionais_json: Record<string, unknown>;
}

export interface FaturaExtraida extends CamposValoresFatura {
  numero_uc_extraido: string | null;
  chave_acesso: string | null;
  modelo_documento: string | null;
  tipo_documento: string;
  finalidade: string | null;
  numero_documento: string | null;
  serie: string | null;
  data_emissao: string | null;
  periodo_referencia: string | null;
  data_vencimento: string | null;
  data_leitura_anterior: string | null;
  data_leitura_atual: string | null;
  dias_faturados: number | null;
  cnpj_emitente: string | null;
  nome_fornecedor: string | null;
  cnpj_destinatario: string | null;
  nome_destinatario: string | null;
  endereco_destinatario: string | null;
  municipio: string | null;
  uf: string | null;
  classe_consumo: string | null;
  protocolo_autorizacao: string | null;
  chave_substituida: string | null;
  status_documento: "autorizada" | "sem_protocolo";
  dados_extraidos_json: Record<string, unknown>;
}

export interface EventoExtraido {
  chave_acesso: string;
  tipo_evento: string;
  codigo_evento: string | null;
  descricao: string | null;
  data_evento: string | null;
  protocolo: string | null;
  dados_json: Record<string, unknown>;
}

export type ResultadoLeitura =
  | { tipo: "fatura"; fatura: FaturaExtraida; itens: ItemExtraido[]; avisos: string[] }
  | { tipo: "evento"; evento: EventoExtraido; avisos: string[] }
  | { tipo: "erro"; erro: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: true,
});

// ---------------------------------------------------------------------------
// Utilitários de datas e valores
// ---------------------------------------------------------------------------

function data(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Competência "AAAAMM" (ou "AAAA-MM", "MM/AAAA") → "AAAA-MM-01". */
export function competencia(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  let ano: number | null = null;
  let mes: number | null = null;
  let m = /^(\d{4})-?(\d{2})$/.exec(s);
  if (m) {
    ano = Number(m[1]);
    mes = Number(m[2]);
  } else {
    m = /^(\d{2})\/(\d{4})$/.exec(s);
    if (m) {
      mes = Number(m[1]);
      ano = Number(m[2]);
    }
  }
  if (ano == null || mes == null || mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

function diasEntre(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fim}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000);
}

function arred(v: number | null, casas = 2): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}

function somar(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v != null && Number.isFinite(v));
  if (!validos.length) return null;
  return validos.reduce((a, b) => a + b, 0);
}

function enderecoTexto(end: No | undefined): string | null {
  if (!end) return null;
  const partes = [
    [txt(end, "xLgr"), txt(end, "nro")].filter(Boolean).join(", "),
    txt(end, "xCpl"),
    txt(end, "xBairro"),
    [txt(end, "xMun"), txt(end, "UF")].filter(Boolean).join("/"),
    txt(end, "CEP") ? `CEP ${txt(end, "CEP")}` : null,
  ].filter((p): p is string => !!p && p.length > 0);
  return partes.length ? partes.join(" - ") : null;
}

/** Hash SHA-256 (hex) do conteúdo do arquivo, usado como identificador de último recurso. */
export async function hashConteudo(conteudo: string): Promise<string> {
  const bytes = new TextEncoder().encode(conteudo);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export function lerXml(conteudo: string): ResultadoLeitura {
  if (!conteudo || !conteudo.trim()) return { tipo: "erro", erro: "Arquivo vazio." };
  if (conteudo.length > TAMANHO_MAXIMO_XML) {
    return { tipo: "erro", erro: "Arquivo excede o limite de 5 MB." };
  }
  // Bloqueia DTD/entidades externas (XXE e expansão de entidades)
  if (/<!DOCTYPE|<!ENTITY/i.test(conteudo)) {
    return { tipo: "erro", erro: "XML com declaração DOCTYPE/ENTITY não é aceito por segurança." };
  }
  const texto = conteudo.replace(/^\uFEFF/, "");
  const validacao = XMLValidator.validate(texto);
  if (validacao !== true) {
    return {
      tipo: "erro",
      erro: `XML inválido ou corrompido (linha ${validacao.err.line}): ${validacao.err.msg}`,
    };
  }

  let raiz: No;
  try {
    raiz = parser.parse(texto) as No;
  } catch {
    return { tipo: "erro", erro: "Não foi possível interpretar o conteúdo do XML." };
  }

  const infNF3e = buscarTodos(raiz, "infNF3e", 1)[0];
  if (infNF3e) return lerNF3e(raiz, infNF3e);

  const infEventos = buscarTodos(raiz, "infEvento", 10);
  const infEvento = infEventos.find((n) => filho(n, "detEvento")) ?? infEventos[0];
  if (
    infEvento &&
    (buscarPrimeiroTexto(infEvento, "chNF3e") || buscarPrimeiroTexto(infEvento, "chNFe"))
  ) {
    return lerEvento(raiz, infEvento);
  }

  const infNFe = buscarTodos(raiz, "infNFe", 1)[0];
  if (infNFe) return lerNFe(raiz, infNFe);

  const nomeRaiz = Object.keys(raiz).find((k) => !k.startsWith("?")) ?? "desconhecida";
  return {
    tipo: "erro",
    erro: `Leiaute não suportado (elemento raiz "${nomeRaiz}"). São aceitos NF3e (modelo 66), NF-e (modelo 55) de energia e seus eventos de cancelamento.`,
  };
}

// ---------------------------------------------------------------------------
// NF3e — modelo 66
// ---------------------------------------------------------------------------

interface Medicao {
  chave: string;
  tpGrMed: string | null;
  posto: string | null;
  unidade: string | null;
  valor: number | null;
  injecao: boolean;
  bruto: No;
}

function unidadeMedida(codigo: string | null): string | null {
  switch (codigo) {
    case "1":
      return "kW";
    case "2":
      return "kWh";
    case "3":
      return "kVAr";
    case "4":
      return "kVArh";
    default:
      return codigo;
  }
}

function lerMedida(m: No, injecaoPorContexto: boolean, nMed: string | null): Medicao {
  const vMedAnt = num(txt(m, "vMedAnt"));
  const vMedAtu = num(txt(m, "vMedAtu"));
  const vConst = num(txt(m, "vConst")) ?? 1;
  const vMed = num(txt(m, "vMed"));
  let valor: number | null = vMed;
  if (valor == null && vMedAnt != null && vMedAtu != null) valor = (vMedAtu - vMedAnt) * vConst;
  const tpGrMed = txt(m, "tpGrMed");
  return {
    chave: [
      nMed,
      tpGrMed,
      txt(m, "cPosTarif"),
      txt(m, "vMedAnt"),
      txt(m, "vMedAtu"),
      txt(m, "vMed"),
    ].join("|"),
    tpGrMed,
    posto: identificarPosto(txt(m, "cPosTarif"), null),
    unidade: unidadeMedida(txt(m, "uMed")),
    valor,
    injecao: injecaoPorContexto,
    bruto: m,
  };
}

function valorImposto(imposto: No | undefined, campo: string): number | null {
  if (!imposto) return null;
  return somar(buscarTodos(imposto, campo).map((n) => num(txt(n))));
}

/** Soma kWh evitando duplicar a mesma energia faturada em TUSD e em TE. */
function somarEnergiaSemDuplicar(itens: ItemExtraido[]): number | null {
  // Quantidades em MWh (comum em NF-e de comercializadoras) são convertidas para kWh
  const kwh = itens
    .filter(
      (i) => (i.unidade_medida === "kWh" || i.unidade_medida === "MWh") && i.quantidade != null,
    )
    .map((i) => (i.unidade_medida === "MWh" ? { ...i, quantidade: i.quantidade! * 1000 } : i));
  if (!kwh.length) return null;
  const tusd = somar(kwh.filter((i) => i.componente === "TUSD").map((i) => i.quantidade)) ?? 0;
  const te = somar(kwh.filter((i) => i.componente === "TE").map((i) => i.quantidade)) ?? 0;
  const outros = somar(kwh.filter((i) => i.componente == null).map((i) => i.quantidade)) ?? 0;
  const temTusd = kwh.some((i) => i.componente === "TUSD");
  const temTe = kwh.some((i) => i.componente === "TE");
  if (temTusd && temTe) {
    return (Math.abs(tusd) >= Math.abs(te) ? tusd : te) + outros;
  }
  return tusd + te + outros;
}

function lerNF3e(raiz: No, inf: No): ResultadoLeitura {
  const avisos: string[] = [];
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const dest = filho(inf, "dest");
  const acessante = filho(inf, "acessante");
  const gFat = filho(inf, "gFat");
  const total = filho(inf, "total");
  const gSub = filho(inf, "gSub");
  const infProt = buscarTodos(raiz, "infProt", 1)[0];

  const mod = txt(ide, "mod");
  if (mod && mod !== "66") avisos.push(`Modelo informado (${mod}) difere do modelo 66 da NF3e.`);
  if (txt(ide, "tpAmb") === "2") {
    avisos.push("Documento emitido em ambiente de homologação (sem valor fiscal).");
  }

  // Chave de acesso
  const idAttr = atributo(inf, "Id");
  let chave = txt(infProt, "chNF3e") ?? (idAttr ? idAttr.replace(/^\D+/, "") : null);
  if (chave && !/^\d{44}$/.test(chave)) {
    avisos.push(`Chave de acesso em formato inesperado (${chave}).`);
    chave = null;
  } else if (chave && !chaveAcessoValida(chave)) {
    avisos.push(
      "Dígito verificador da chave de acesso não confere. Verifique a integridade do documento.",
    );
  }
  if (!chave)
    avisos.push(
      "Chave de acesso indisponível: a duplicidade será controlada pelo conteúdo do arquivo.",
    );

  // Situação do documento (protocolo de autorização)
  const cStat = txt(infProt, "cStat");
  let statusDocumento: "autorizada" | "sem_protocolo" = "sem_protocolo";
  if (cStat === "100" || cStat === "150") statusDocumento = "autorizada";
  else if (infProt) {
    avisos.push(
      `Protocolo com situação ${cStat ?? "?"} (${txt(infProt, "xMotivo") ?? "sem descrição"}).`,
    );
  } else {
    avisos.push("XML sem protocolo de autorização (nf3eProc): situação na SEFAZ não verificada.");
  }

  const finNF3e = txt(ide, "finNF3e");
  const finalidade =
    finNF3e === "1"
      ? "normal"
      : finNF3e === "2"
        ? "substituicao"
        : finNF3e === "3"
          ? "ajuste"
          : finNF3e;
  const chaveSubstituida = txt(gSub, "chNF3e");
  if (finalidade === "substituicao" && !chaveSubstituida) {
    avisos.push("Documento de substituição sem a chave do documento substituído.");
  }
  if (finalidade === "ajuste") {
    avisos.push("Documento de ajuste: os valores complementam/ajustam faturamento anterior.");
  }

  // Unidade consumidora
  const numeroUc = txt(acessante, "idAcesso");
  if (!numeroUc) avisos.push("Número da unidade consumidora (idAcesso) não encontrado no XML.");

  // Datas e período
  const dataEmissao = data(txt(ide, "dhEmi"));
  const competenciaTexto = txt(gFat, "CompetFat");
  const periodo = competencia(competenciaTexto);
  if (!periodo) avisos.push("Competência (CompetFat) indisponível ou inválida.");

  const gMeds = lista(inf, "gMed");
  const leiturasAnt = gMeds
    .map((g) => data(txt(g, "dMedAnt")))
    .filter((d): d is string => !!d)
    .sort();
  const leiturasAtu = gMeds
    .map((g) => data(txt(g, "dMedAtu")))
    .filter((d): d is string => !!d)
    .sort();
  const leituraAnterior = leiturasAnt[0] ?? null;
  const leituraAtual = leiturasAtu[leiturasAtu.length - 1] ?? null;
  const dias = diasEntre(leituraAnterior, leituraAtual);

  // Itens
  const itens: ItemExtraido[] = [];
  const medicoes = new Map<string, Medicao>();
  const comScee = !!filho(inf, "gSCEE");
  for (const nfdet of lista(inf, "NFdet")) {
    const chaveAnterior = atributo(nfdet, "chNF3eAnt");
    for (const det of lista(nfdet, "det")) {
      const nItem = num(atributo(det, "nItem"));
      const detItem = filho(det, "detItem") ?? filho(det, "detItemAnt");
      if (!detItem) continue;
      const anterior = !filho(det, "detItem");
      const prod = filho(detItem, "prod");
      const descricao = txt(prod, "xProd");
      const gTarif = filho(detItem, "gTarif");
      const devolucao = txt(prod, "indDevolucao") === "1";
      const sinal = devolucao ? -1 : 1;
      const qtd = num(txt(prod, "qFaturada"));
      const vProd = num(txt(prod, "vProd"));
      const valorItem = vProd == null ? null : vProd < 0 ? vProd : vProd * sinal;
      const tipo = ajustarTipoPeloValor(classificarItem(descricao), descricao, valorItem, comScee);
      const imposto = filho(detItem, "imposto");
      const codigoPosto = txt(gTarif, "cPosTarif") ?? buscarPrimeiroTexto(prod, "cPosTarif");

      const item: ItemExtraido = {
        numero_item: nItem,
        codigo_produto: txt(prod, "cProd"),
        codigo_classificacao: txt(prod, "cClass"),
        descricao,
        quantidade: qtd == null ? null : qtd < 0 ? qtd : qtd * sinal,
        unidade_medida: identificarUnidade(txt(prod, "uMed"), descricao, tipo),
        valor_unitario: num(txt(prod, "vItem")),
        valor_total: valorItem,
        tipo_item: tipo,
        componente: identificarComponente(descricao),
        posto_tarifario: identificarPosto(codigoPosto, descricao),
        valor_icms: valorImposto(imposto, "vICMS"),
        valor_pis: valorImposto(imposto, "vPIS"),
        valor_cofins: valorImposto(imposto, "vCOFINS"),
        dados_adicionais_json: {
          cfop: txt(prod, "CFOP"),
          indDevolucao: txt(prod, "indDevolucao"),
          indOrigemQtd: txt(prod, "indOrigemQtd"),
          uMed: txt(prod, "uMed"),
          tarifa: gTarif ? semAssinatura(gTarif) : null,
          adicionalBandeira: filho(detItem, "gAdBand")
            ? semAssinatura(filho(detItem, "gAdBand"))
            : null,
          infAdProd: txt(detItem, "infAdProd"),
          itemDocumentoAnterior: anterior || undefined,
          chaveDocumentoAnterior: chaveAnterior ?? undefined,
        },
      };
      // Itens de documento anterior (detItemAnt) são informativos: não compõem o total atual
      if (anterior) item.tipo_item = "outros";
      itens.push(item);

      // Medições vinculadas ao item
      for (const gMedicao of buscarTodos(prod ?? detItem, "gMedicao")) {
        const nMed = txt(gMedicao, "nMed");
        for (const gMedida of lista(gMedicao, "gMedida")) {
          const med = lerMedida(gMedida, tipo === "injecao", nMed);
          if (!medicoes.has(med.chave)) medicoes.set(med.chave, med);
        }
      }
    }
  }
  if (!itens.length) avisos.push("Nenhum item faturado encontrado (grupo NFdet/det).");

  const itensAtuais = itens.filter((i) => !i.dados_adicionais_json["itemDocumentoAnterior"]);
  const porTipo = (t: TipoItem) => itensAtuais.filter((i) => i.tipo_item === t);
  const somaValor = (l: ItemExtraido[]) => arred(somar(l.map((i) => i.valor_total)));

  // Consumo
  const consumoItens = porTipo("consumo");
  const consumoFaturado = arred(somarEnergiaSemDuplicar(consumoItens), 3);
  const medidasKwh = [...medicoes.values()].filter((m) => m.unidade === "kWh" && m.valor != null);
  const medidasConsumo = medidasKwh.filter(
    (m) => !m.injecao && m.tpGrMed !== "04" && m.tpGrMed !== "4",
  );
  const consumoMedido = arred(somar(medidasConsumo.map((m) => m.valor)), 3);
  const injetadaMedida = arred(
    somar(
      medidasKwh
        .filter((m) => m.injecao || m.tpGrMed === "04" || m.tpGrMed === "4")
        .map((m) => m.valor),
    ),
    3,
  );
  let consumo: number | null = null;
  let origemConsumo: string | null = null;
  if (consumoFaturado != null) {
    consumo = consumoFaturado;
    origemConsumo = "faturado";
  } else if (consumoMedido != null) {
    consumo = consumoMedido;
    origemConsumo = "medido";
  } else {
    avisos.push("Consumo em kWh indisponível no documento.");
  }

  const injetadaItens = somarEnergiaSemDuplicar(porTipo("injecao"));
  const compensadaItens = somarEnergiaSemDuplicar(porTipo("compensacao"));

  // Demanda
  const medidasKw = [...medicoes.values()].filter((m) => m.unidade === "kW" && m.valor != null);
  const demandaMedida = medidasKw.length ? Math.max(...medidasKw.map((m) => m.valor!)) : null;
  const demandaItensKw = porTipo("demanda").filter(
    (i) => i.quantidade != null && i.unidade_medida === "kW",
  );
  const demandaFaturada = demandaItensKw.length
    ? Math.max(...demandaItensKw.map((i) => Math.abs(i.quantidade!)))
    : null;
  const contratos = lista(inf, "gGrContrat");
  const contratosDemanda = contratos.filter((c) => {
    const tp = txt(c, "tpGrContrat");
    return tp == null || tp === "1";
  });
  const valoresContratados = contratosDemanda
    .map((c) => num(txt(c, "qUnidContrat") ?? txt(c, "vContrat") ?? txt(c, "qContrat")))
    .filter((v): v is number => v != null);
  const demandaContratada = valoresContratados.length ? Math.max(...valoresContratados) : null;

  // Reativo
  const reativoKvarh = somar(
    porTipo("reativo")
      .filter((i) => i.unidade_medida === "kVArh")
      .map((i) => i.quantidade),
  );

  // Valores
  const valorTotal = num(txt(total, "vNF"));
  if (valorTotal == null) avisos.push("Valor total do documento (vNF) indisponível.");
  const icmsTotal = num(txt(total, "ICMSTot", "vICMS"));
  const pisTotal = num(txt(total, "vPIS"));
  const cofinsTotal = num(txt(total, "vCOFINS"));

  const valorTusd = somaValor(consumoItens.filter((i) => i.componente === "TUSD"));
  const valorTe = somaValor(consumoItens.filter((i) => i.componente === "TE"));
  const descontos = somaValor(porTipo("desconto"));
  const somaItens = somaValor(itensAtuais);
  if (valorTotal != null && somaItens != null && Math.abs(somaItens - valorTotal) > 0.05) {
    avisos.push(
      `A soma dos itens (${somaItens.toFixed(2)}) difere do valor total do documento (${valorTotal.toFixed(
        2,
      )}). Diferenças podem decorrer de tributos/retenções destacados fora dos itens. O valor total do documento foi mantido como referência.`,
    );
  }

  const valores: CamposValoresFatura = {
    consumo_kwh: consumo,
    consumo_medido_kwh: consumoMedido,
    consumo_faturado_kwh: consumoFaturado,
    origem_consumo: origemConsumo,
    energia_injetada_kwh: arred(
      injetadaItens != null ? Math.abs(injetadaItens) : injetadaMedida,
      3,
    ),
    energia_compensada_kwh: arred(compensadaItens != null ? Math.abs(compensadaItens) : null, 3),
    demanda_contratada_kw: arred(demandaContratada, 3),
    demanda_medida_kw: arred(demandaMedida, 3),
    demanda_faturada_kw: arred(demandaFaturada, 3),
    energia_reativa_kvarh: arred(reativoKvarh, 3),
    valor_total: arred(valorTotal),
    valor_energia: somaValor(consumoItens),
    valor_tusd: valorTusd,
    valor_te: valorTe,
    valor_demanda: somaValor(porTipo("demanda")),
    valor_reativo: somaValor(porTipo("reativo")),
    valor_bandeira: somaValor(porTipo("bandeira")),
    valor_icms: arred(icmsTotal ?? somar(itensAtuais.map((i) => i.valor_icms))),
    valor_pis: arred(pisTotal ?? somar(itensAtuais.map((i) => i.valor_pis))),
    valor_cofins: arred(cofinsTotal ?? somar(itensAtuais.map((i) => i.valor_cofins))),
    valor_cip: somaValor(porTipo("cip")),
    valor_multas: somaValor(porTipo("multa")),
    valor_juros: somaValor(porTipo("juros")),
    valor_encargos: somaValor(porTipo("encargo")),
    valor_descontos: descontos == null ? null : Math.abs(descontos),
    // Créditos abatidos = apenas os lançamentos negativos de injeção/compensação.
    valor_compensacao: somaValor(
      [...porTipo("injecao"), ...porTipo("compensacao")].filter((i) => (i.valor_total ?? 0) < 0),
    ),
    valor_outros: somaValor([...porTipo("outros"), ...porTipo("tributo")]),
  };

  const enderDest = filho(dest, "enderDest");
  const classe = txt(acessante, "tpClasse");
  const CLASSES: Record<string, string> = {
    "01": "Comercial",
    "02": "Consumo próprio",
    "03": "Iluminação pública",
    "04": "Industrial",
    "05": "Poder público",
    "06": "Residencial",
    "07": "Rural",
    "08": "Serviço público",
    "1": "Comercial",
    "2": "Consumo próprio",
    "3": "Iluminação pública",
    "4": "Industrial",
    "5": "Poder público",
    "6": "Residencial",
    "7": "Rural",
    "8": "Serviço público",
  };

  const fatura: FaturaExtraida = {
    ...valores,
    numero_uc_extraido: numeroUc,
    chave_acesso: chave,
    modelo_documento: mod ?? "66",
    tipo_documento: "NF3e",
    finalidade,
    numero_documento: txt(ide, "nNF"),
    serie: txt(ide, "serie"),
    data_emissao: dataEmissao,
    periodo_referencia: periodo,
    data_vencimento: data(txt(gFat, "dVencFat")),
    data_leitura_anterior: leituraAnterior,
    data_leitura_atual: leituraAtual,
    dias_faturados: dias,
    cnpj_emitente: txt(emit, "CNPJ"),
    nome_fornecedor: txt(emit, "xNome"),
    cnpj_destinatario: txt(dest, "CNPJ") ?? txt(dest, "CPF") ?? txt(dest, "idOutros"),
    nome_destinatario: txt(dest, "xNome"),
    endereco_destinatario: enderecoTexto(enderDest),
    municipio: txt(enderDest, "xMun"),
    uf: txt(enderDest, "UF"),
    classe_consumo: classe ? (CLASSES[classe] ?? classe) : null,
    protocolo_autorizacao: txt(infProt, "nProt"),
    chave_substituida: chaveSubstituida,
    status_documento: statusDocumento,
    dados_extraidos_json: {
      leiaute: "NF3e",
      versao: atributo(inf, "versao"),
      ide: semAssinatura(ide),
      emitente: semAssinatura(emit),
      destinatario: semAssinatura(dest),
      acessante: semAssinatura(acessante),
      substituicao: gSub ? semAssinatura(gSub) : null,
      contratos: contratos.map(semAssinatura),
      medidores: gMeds.map(semAssinatura),
      medicoes: [...medicoes.values()].map((m) => ({
        tpGrMed: m.tpGrMed,
        posto: m.posto,
        unidade: m.unidade,
        valor: m.valor,
        injecao: m.injecao,
        bruto: semAssinatura(m.bruto),
      })),
      compensacao: filho(inf, "gSCEE") ? semAssinatura(filho(inf, "gSCEE")) : null,
      faturamento: gFat ? semAssinatura(gFat) : null,
      historicoAneel: filho(inf, "gANEEL") ? semAssinatura(filho(inf, "gANEEL")) : null,
      totais: total ? semAssinatura(total) : null,
      infAdic: filho(inf, "infAdic") ? semAssinatura(filho(inf, "infAdic")) : null,
      protocolo: infProt ? semAssinatura(infProt) : null,
      somaItens,
      avisos,
    },
  };

  return { tipo: "fatura", fatura, itens, avisos };
}

// ---------------------------------------------------------------------------
// Eventos (cancelamento etc.)
// ---------------------------------------------------------------------------

function lerEvento(raiz: No, infEvento: No): ResultadoLeitura {
  const avisos: string[] = [];
  const chave = txt(infEvento, "chNF3e") ?? txt(infEvento, "chNFe");
  const tpEvento = txt(infEvento, "tpEvento");
  const descEvento = buscarPrimeiroTexto(infEvento, "descEvento");
  const retornos = buscarTodos(raiz, "infEvento").filter((n) => n !== infEvento);
  const ret = retornos.find((r) => txt(r, "cStat") != null);
  const cStat = ret ? txt(ret, "cStat") : null;

  if (!chave) return { tipo: "erro", erro: "Evento sem chave de acesso do documento." };
  if (!ret) {
    avisos.push("Evento sem retorno de registro da SEFAZ: registrado apenas como informativo.");
  } else if (cStat !== "135" && cStat !== "136" && cStat !== "155") {
    return {
      tipo: "erro",
      erro: `Evento não homologado pela SEFAZ (cStat ${cStat ?? "?"}: ${txt(ret, "xMotivo") ?? ""}).`,
    };
  }

  const cancelamento = tpEvento === "110111" || /CANCELAMENTO/.test(normalizarTexto(descEvento));
  if (cancelamento && !ret) {
    return {
      tipo: "erro",
      erro: "Evento de cancelamento sem protocolo de registro: não é possível confirmar o cancelamento.",
    };
  }

  return {
    tipo: "evento",
    avisos,
    evento: {
      chave_acesso: chave,
      tipo_evento: cancelamento ? "cancelamento" : `evento_${tpEvento ?? "desconhecido"}`,
      codigo_evento: tpEvento,
      descricao: descEvento,
      data_evento: txt(infEvento, "dhEvento"),
      protocolo: ret ? txt(ret, "nProt") : null,
      dados_json: semAssinatura(raiz) as Record<string, unknown>,
    },
  };
}

// ---------------------------------------------------------------------------
// NF-e — modelo 55 (energia elétrica comercializada, quando aplicável)
// ---------------------------------------------------------------------------

const REGEX_UC =
  /(?:UNIDADE CONSUMIDORA|\bUC\b|INSTALACAO|COD(?:IGO)?\.? (?:DO )?CLIENTE|CONTA CONTRATO)\s*(?:N[O0º°.]*\s*)?[:\-–]?\s*([0-9][0-9.\-/]{2,20}[0-9])/;
const REGEX_REF = /(?:REFERENCIA|REF\.?|COMPETENCIA|MES REF\.?)\s*[:-]?\s*(\d{2}\/\d{4})/;

function lerNFe(raiz: No, inf: No): ResultadoLeitura {
  const avisos: string[] = [];
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const dest = filho(inf, "dest");
  const total = filho(inf, "total", "ICMSTot");
  const infAdic = filho(inf, "infAdic");
  const infProt = buscarTodos(raiz, "infProt", 1)[0];

  const idAttr = atributo(inf, "Id");
  let chave = txt(infProt, "chNFe") ?? (idAttr ? idAttr.replace(/^\D+/, "") : null);
  if (chave && !/^\d{44}$/.test(chave)) chave = null;
  else if (chave && !chaveAcessoValida(chave)) {
    avisos.push("Dígito verificador da chave de acesso não confere.");
  }

  const cStat = txt(infProt, "cStat");
  const status: "autorizada" | "sem_protocolo" =
    cStat === "100" || cStat === "150" ? "autorizada" : "sem_protocolo";
  if (status !== "autorizada") avisos.push("XML sem protocolo de autorização válido.");

  const itens: ItemExtraido[] = lista(inf, "det").map((det) => {
    const prod = filho(det, "prod");
    const imposto = filho(det, "imposto");
    const descricao = txt(prod, "xProd");
    let tipo = classificarItem(descricao);
    const cfop = txt(prod, "CFOP") ?? "";
    if (tipo === "outros" && /^[567]25[1-8]$/.test(cfop)) tipo = "consumo";
    const unidade = txt(prod, "uCom");
    return {
      numero_item: num(atributo(det, "nItem")),
      codigo_produto: txt(prod, "cProd"),
      codigo_classificacao: txt(prod, "NCM"),
      descricao,
      quantidade: num(txt(prod, "qCom")),
      unidade_medida: identificarUnidade(
        unidade ? normalizarTexto(unidade) : null,
        descricao,
        tipo,
      ),
      valor_unitario: num(txt(prod, "vUnCom")),
      valor_total: num(txt(prod, "vProd")),
      tipo_item: tipo,
      componente: identificarComponente(descricao),
      posto_tarifario: identificarPosto(null, descricao),
      valor_icms: valorImposto(imposto, "vICMS"),
      valor_pis: valorImposto(imposto, "vPIS"),
      valor_cofins: valorImposto(imposto, "vCOFINS"),
      dados_adicionais_json: { cfop, uCom: unidade },
    };
  });

  const energiaEletrica = itens.some((i) =>
    /^[567]25[1-8]$/.test(String(i.dados_adicionais_json["cfop"])),
  );
  if (!energiaEletrica) {
    avisos.push(
      "Nenhum item com CFOP de energia elétrica (x251–x258): confira se o documento é de energia.",
    );
  }

  const complementar = normalizarTexto(
    [txt(infAdic, "infCpl"), txt(infAdic, "infAdFisco")].filter(Boolean).join(" "),
  );
  const ucMatch = REGEX_UC.exec(complementar);
  const numeroUc = ucMatch?.[1] ?? null;
  if (!numeroUc) {
    avisos.push(
      "NF-e não traz a UC em campo estruturado e ela não foi localizada nas informações complementares.",
    );
  }
  const refMatch = REGEX_REF.exec(complementar);
  const periodo = competencia(refMatch?.[1] ?? null);
  if (!periodo) avisos.push("Competência não identificada no documento.");

  const consumoItens = itens.filter((i) => i.tipo_item === "consumo");
  const consumo = arred(somarEnergiaSemDuplicar(consumoItens), 3);
  if (consumo == null) avisos.push("Consumo em kWh indisponível no documento.");
  const dup = buscarTodos(filho(inf, "cobr"), "dup")[0];
  const enderDest = filho(dest, "enderDest");
  const somaValor = (l: ItemExtraido[]) => arred(somar(l.map((i) => i.valor_total)));
  const porTipo = (t: TipoItem) => itens.filter((i) => i.tipo_item === t);
  const descontoNota = num(txt(total, "vDesc"));

  const fatura: FaturaExtraida = {
    consumo_kwh: consumo,
    consumo_medido_kwh: null,
    consumo_faturado_kwh: consumo,
    origem_consumo: consumo != null ? "faturado" : null,
    energia_injetada_kwh: null,
    energia_compensada_kwh: null,
    demanda_contratada_kw: null,
    demanda_medida_kw: null,
    demanda_faturada_kw: null,
    energia_reativa_kvarh: null,
    valor_total: arred(num(txt(total, "vNF"))),
    valor_energia: somaValor(consumoItens),
    valor_tusd: somaValor(consumoItens.filter((i) => i.componente === "TUSD")),
    valor_te: somaValor(consumoItens.filter((i) => i.componente === "TE")),
    valor_demanda: somaValor(porTipo("demanda")),
    valor_reativo: somaValor(porTipo("reativo")),
    valor_bandeira: somaValor(porTipo("bandeira")),
    valor_icms: arred(num(txt(total, "vICMS"))),
    valor_pis: arred(num(txt(total, "vPIS"))),
    valor_cofins: arred(num(txt(total, "vCOFINS"))),
    valor_cip: somaValor(porTipo("cip")),
    valor_multas: somaValor(porTipo("multa")),
    valor_juros: somaValor(porTipo("juros")),
    valor_encargos: somaValor(porTipo("encargo")),
    valor_descontos: descontoNota && descontoNota > 0 ? descontoNota : null,
    valor_compensacao: null,
    valor_outros: somaValor(porTipo("outros")),
    numero_uc_extraido: numeroUc,
    chave_acesso: chave,
    modelo_documento: txt(ide, "mod") ?? "55",
    tipo_documento: "NF-e",
    finalidade:
      txt(ide, "finNFe") === "2"
        ? "complementar"
        : txt(ide, "finNFe") === "3"
          ? "ajuste"
          : "normal",
    numero_documento: txt(ide, "nNF"),
    serie: txt(ide, "serie"),
    data_emissao: data(txt(ide, "dhEmi") ?? txt(ide, "dEmi")),
    periodo_referencia: periodo,
    data_vencimento: data(dup ? txt(dup, "dVenc") : null),
    data_leitura_anterior: null,
    data_leitura_atual: null,
    dias_faturados: null,
    cnpj_emitente: txt(emit, "CNPJ"),
    nome_fornecedor: txt(emit, "xNome"),
    cnpj_destinatario: txt(dest, "CNPJ") ?? txt(dest, "CPF"),
    nome_destinatario: txt(dest, "xNome"),
    endereco_destinatario: enderecoTexto(enderDest),
    municipio: txt(enderDest, "xMun"),
    uf: txt(enderDest, "UF"),
    classe_consumo: null,
    protocolo_autorizacao: txt(infProt, "nProt"),
    chave_substituida: null,
    status_documento: status,
    dados_extraidos_json: {
      leiaute: "NF-e",
      versao: atributo(inf, "versao"),
      ide: semAssinatura(ide),
      emitente: semAssinatura(emit),
      destinatario: semAssinatura(dest),
      totais: semAssinatura(filho(inf, "total")),
      cobranca: semAssinatura(filho(inf, "cobr")),
      infAdic: semAssinatura(infAdic),
      protocolo: infProt ? semAssinatura(infProt) : null,
      avisos,
    },
  };
  return { tipo: "fatura", fatura, itens, avisos };
}

/** Dados normalizados prontos para gravação (CNPJs sem máscara). */
export function prepararParaGravacao(f: FaturaExtraida): FaturaExtraida {
  return {
    ...f,
    cnpj_emitente: f.cnpj_emitente ? normalizarCnpj(f.cnpj_emitente) : null,
    cnpj_destinatario: f.cnpj_destinatario ? normalizarCnpj(f.cnpj_destinatario) : null,
  };
}
