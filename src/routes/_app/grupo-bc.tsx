import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Handshake, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina, Carregando, MensagemErro } from "@/components/app/comuns";
import { CartaoGrafico } from "@/components/app/graficos";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  FATOR_GRUPO_BC,
  classificarUsina,
  geradorasEncontradas,
  type MotivoUsina,
  normalizarNumeroUc,
  ROTULOS_SITUACAO_GRUPO_BC,
  type ResultadoGrupoBc,
} from "@/lib/analise/grupo-bc";
import { useAuth } from "@/lib/auth";
import {
  buscarInjecoesScee,
  buscarRegraGrupoBc,
  buscarTodos,
  comGrupoBc,
} from "@/lib/consulta-paginada";
import { CHAVES, invalidarDados, mensagemErro, useUcs } from "@/lib/consultas";
import { formatarKwh, formatarMoeda, formatarNumero } from "@/lib/formatacao";
import type { UnidadeConsumidora } from "@/lib/tipos";

export const Route = createFileRoute("/_app/grupo-bc")({
  head: () => ({ meta: [{ title: "Grupo BC — Controle Energia" }] }),
  component: PaginaGrupoBc,
});

interface FaturaBc {
  id: string;
  unidade_consumidora_id: string | null;
  periodo_referencia: string | null;
  numero_documento: string | null;
  serie: string | null;
}

type LinhaCalculo = FaturaBc & ResultadoGrupoBc & { uc: UnidadeConsumidora | undefined };

interface LinhaUsina {
  numero: string;
  numeroOriginal: string;
  grupoBc: boolean;
  /** Classificação automática (true = terceiro, Grupo BC). */
  automatico: boolean;
  motivo: MotivoUsina;
  /** UC cadastrada correspondente (energia própria). */
  ucPropria: UnidadeConsumidora | undefined;
  kwhInjetados: number;
  faturas: number;
  ucsRecebem: string[];
}

const CHAVE_CONFIG = "grupo_bc";

interface Excecoes {
  incluir: string[];
  excluir: string[];
}

/** Exceções manuais (o cadastro manual antigo "geradoras" é ignorado e some ao salvar). */
async function lerExcecoes(): Promise<Excecoes> {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", CHAVE_CONFIG)
    .maybeSingle();
  if (error) throw error;
  const v = (data?.valor ?? {}) as Record<string, unknown>;
  const lista = (k: string) => (Array.isArray(v[k]) ? (v[k] as unknown[]).map(String) : []);
  return { incluir: lista("incluir"), excluir: lista("excluir") };
}

async function salvarExcecoes(e: Excecoes) {
  const { data, error } = await supabase
    .from("configuracoes")
    .update({ valor: { incluir: e.incluir, excluir: e.excluir } })
    .eq("chave", CHAVE_CONFIG)
    .select("chave");
  if (error) throw error;
  if (!data?.length) {
    throw new Error(
      "Exceções do Grupo BC ainda não disponíveis no banco. Aplique a migração mais recente.",
    );
  }
}

const ROTULOS_MOTIVO: Record<MotivoUsina, string> = {
  terceiro: "Terceiro → Grupo BC (automático)",
  propria: "UC própria → fora do Grupo BC",
  incluida_manual: "Incluída manualmente",
  excluida_manual: "Excluída manualmente",
};

function PaginaGrupoBc() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const ucsQ = useUcs();
  const [salvando, setSalvando] = useState<string | null>(null);
  const [nova, setNova] = useState("");

  const dados = useQuery({
    queryKey: [...CHAVES.faturas, "grupo-bc"],
    queryFn: async () => {
      const [faturas, injecoes, regra] = await Promise.all([
        buscarTodos<FaturaBc>(
          supabase,
          "faturas",
          "id, unidade_consumidora_id, periodo_referencia, numero_documento, serie",
          { excluida: false },
        ),
        buscarInjecoesScee(supabase),
        buscarRegraGrupoBc(supabase),
      ]);
      const ids = new Set(faturas.map((f) => f.id));
      const { resultados } = await comGrupoBc(supabase, faturas);
      return {
        faturas,
        regra,
        encontradas: geradorasEncontradas(injecoes.filter((i) => ids.has(i.fatura_id))),
        calculo: faturas
          .filter((f) => resultados.has(f.id))
          .map((f) => ({ ...f, ...resultados.get(f.id)! })),
      };
    },
  });

  const ucsPorId = useMemo(() => new Map((ucsQ.data ?? []).map((u) => [u.id, u])), [ucsQ.data]);
  const usinas: LinhaUsina[] = useMemo(() => {
    const regra = dados.data?.regra;
    if (!regra) return [];
    const ucPorNumero = new Map((ucsQ.data ?? []).map((u) => [normalizarNumeroUc(u.numero_uc), u]));
    const ucDaFatura = new Map(
      (dados.data?.faturas ?? []).map((f) => [
        f.id,
        f.unidade_consumidora_id ? ucsPorId.get(f.unidade_consumidora_id)?.numero_uc : undefined,
      ]),
    );
    const linha = (
      numero: string,
      numeroOriginal: string,
      extra: Pick<LinhaUsina, "kwhInjetados" | "faturas" | "ucsRecebem">,
    ): LinhaUsina => {
      const c = classificarUsina(numero, regra);
      return {
        numero,
        numeroOriginal,
        grupoBc: c.grupoBc,
        automatico: c.automatico,
        motivo: c.motivo,
        ucPropria: ucPorNumero.get(numero),
        ...extra,
      };
    };
    const linhas = (dados.data?.encontradas ?? []).map((g) =>
      linha(g.numero, g.numeroOriginal, {
        kwhInjetados: g.kwhInjetados,
        faturas: g.faturas,
        ucsRecebem: [
          ...new Set(g.faturaIds.map((id) => ucDaFatura.get(id)).filter((u): u is string => !!u)),
        ],
      }),
    );
    // Usinas incluídas manualmente que ainda não aparecem em faturas importadas
    for (const n of regra.incluir) {
      if (!linhas.some((l) => l.numero === n)) {
        linhas.push(linha(n, n, { kwhInjetados: 0, faturas: 0, ucsRecebem: [] }));
      }
    }
    return linhas;
  }, [dados.data, ucsQ.data, ucsPorId]);

  const linhasCalculo: LinhaCalculo[] = useMemo(
    () =>
      (dados.data?.calculo ?? []).map((l) => ({
        ...l,
        uc: l.unidade_consumidora_id ? ucsPorId.get(l.unidade_consumidora_id) : undefined,
      })),
    [dados.data, ucsPorId],
  );

  /**
   * Define se a usina entra no Grupo BC. Só grava exceção quando difere do
   * automático; voltar ao automático remove a exceção.
   */
  const alterarUsina = async (numeroOriginal: string, grupoBc: boolean, automatico: boolean) => {
    const n = normalizarNumeroUc(numeroOriginal);
    if (!n) {
      toast.error("Informe o número da UC geradora (somente dígitos).");
      return;
    }
    setSalvando(n);
    try {
      const atual = await lerExcecoes();
      const sem = (l: string[]) => l.filter((g) => normalizarNumeroUc(g) !== n);
      const novo: Excecoes = { incluir: sem(atual.incluir), excluir: sem(atual.excluir) };
      if (grupoBc !== automatico)
        (grupoBc ? novo.incluir : novo.excluir).push(numeroOriginal.trim());
      await salvarExcecoes(novo);
      toast.success(
        grupoBc
          ? `Usina ${numeroOriginal} incluída no Grupo BC.`
          : `Usina ${numeroOriginal} fora do Grupo BC.`,
      );
      setNova("");
      await invalidarDados(qc);
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível atualizar o Grupo BC."));
    } finally {
      setSalvando(null);
    }
  };

  const podeEditar = pode("configurar");

  const colunasUsinas: Coluna<LinhaUsina>[] = [
    {
      id: "grupoBc",
      titulo: "Grupo BC",
      valor: (u) => (u.grupoBc ? "Sim" : "Não"),
      celula: (u) => (
        <Switch
          checked={u.grupoBc}
          disabled={!podeEditar || salvando === u.numero}
          onCheckedChange={(v) => void alterarUsina(u.numeroOriginal, v, u.automatico)}
          aria-label={`Grupo BC — usina ${u.numeroOriginal}`}
        />
      ),
    },
    {
      id: "usina",
      titulo: "UC geradora (usina)",
      valor: (u) => u.numeroOriginal,
      celula: (u) => <span className="font-medium">{u.numeroOriginal}</span>,
    },
    {
      id: "classificacao",
      titulo: "Classificação",
      valor: (u) => ROTULOS_MOTIVO[u.motivo],
      celula: (u) => (
        <div className="flex flex-col">
          <Badge
            variant="outline"
            className={
              u.grupoBc
                ? "w-fit border-success/30 bg-success/10 text-success"
                : "w-fit text-muted-foreground"
            }
          >
            {ROTULOS_MOTIVO[u.motivo]}
          </Badge>
          {u.ucPropria && (
            <span className="mt-0.5 text-xs text-muted-foreground">
              UC cadastrada: {u.ucPropria.fazenda}
            </span>
          )}
        </div>
      ),
    },
    { id: "kwh", titulo: "kWh injetados (total)", tipo: "kwh", valor: (u) => u.kwhInjetados },
    { id: "faturas", titulo: "Faturas", tipo: "numero", valor: (u) => u.faturas },
    {
      id: "ucs",
      titulo: "UCs que recebem",
      valor: (u) => u.ucsRecebem.join(", "),
      classe: "max-w-[320px] truncate",
    },
  ];

  const colunasCalculo: Coluna<LinhaCalculo>[] = [
    {
      id: "competencia",
      titulo: "Competência",
      tipo: "competencia",
      valor: (l) => l.periodo_referencia,
    },
    { id: "uc", titulo: "UC", valor: (l) => l.uc?.numero_uc },
    { id: "fazenda", titulo: "Fazenda", valor: (l) => l.uc?.fazenda },
    {
      id: "documento",
      titulo: "Nº documento",
      valor: (l) => l.numero_documento,
      celula: (l) => (
        <Link to="/faturas/$id" params={{ id: l.id }} className="hover:underline">
          {l.numero_documento ?? "—"}
          {l.serie && <span className="text-muted-foreground">/{l.serie}</span>}
        </Link>
      ),
    },
    {
      id: "kwh",
      titulo: "kWh injetados (Grupo BC)",
      tipo: "kwh",
      valor: (l) => l.kwhInjetados,
    },
    {
      id: "tarifa",
      titulo: "Tarifa consumo não compensado (R$/kWh)",
      valor: (l) => l.tarifa,
      celula: (l) => (l.tarifa != null ? formatarNumero(l.tarifa, 6) : "—"),
      alinhar: "direita",
    },
    {
      id: "tarifaBandeira",
      titulo: "Tarifa ADC bandeira (R$/kWh)",
      valor: (l) => l.tarifaBandeira,
      celula: (l) => formatarNumero(l.tarifaBandeira, 6),
      alinhar: "direita",
    },
    { id: "valor", titulo: "Valor Grupo BC", tipo: "moeda", valor: (l) => l.valor },
    { id: "desconto", titulo: "Desconto", tipo: "moeda", valor: (l) => l.desconto },
    { id: "custoCheio", titulo: "Custo cheio", tipo: "moeda", valor: (l) => l.custoCheio },
    {
      id: "situacao",
      titulo: "Situação",
      valor: (l) => ROTULOS_SITUACAO_GRUPO_BC[l.situacao],
      celula: (l) => (
        <Badge
          variant="outline"
          className={
            l.situacao === "tarifa_indisponivel"
              ? "border-warning/40 bg-warning/15 text-warning-foreground"
              : l.situacao === "calculado"
                ? "border-success/30 bg-success/10 text-success"
                : "text-muted-foreground"
          }
        >
          {ROTULOS_SITUACAO_GRUPO_BC[l.situacao]}
        </Badge>
      ),
    },
  ];

  const erro = ucsQ.error ?? dados.error;
  const soma = (c: "valor" | "desconto" | "custoCheio") =>
    linhasCalculo.reduce((s, l) => s + (l[c] ?? 0), 0);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Grupo BC"
        descricao={
          <>
            Energia injetada por terceiros. Automático: em cada fatura entram as linhas “INJEÇÃO
            SCEE – UC &lt;geradora&gt;” cuja geradora não é UC cadastrada no sistema (usina de
            terceiro); injeções de UCs cadastradas (energia própria) ficam de fora. Valor Grupo BC =
            kWh injetados × tarifa do CONSUMO NÃO COMPENSADO (com tributos) ×{" "}
            {formatarNumero(FATOR_GRUPO_BC, 2)}. Desconto = kWh injetados × (tarifa do CONSUMO NÃO
            COMPENSADO + tarifa ADC BANDEIRA) − Valor Grupo BC. Custo cheio = Valor + Desconto — é o
            valor somado ao custo da energia.
          </>
        }
      />
      {erro ? (
        <MensagemErro erro={mensagemErro(erro, "Não foi possível carregar o Grupo BC.")} />
      ) : ucsQ.isLoading || dados.isLoading ? (
        <Carregando />
      ) : (
        <>
          <CartaoGrafico
            titulo="Usinas (UCs geradoras) encontradas nas faturas"
            descricao="Classificação automática: usina que não é UC cadastrada = terceiro (Grupo BC); UC cadastrada = energia própria. Use a chave só para exceções. Vale para todas as faturas, inclusive as já importadas."
          >
            <TabelaDados
              dados={usinas}
              colunas={colunasUsinas}
              chave={(u) => u.numero}
              nomeExportacao="grupo-bc-usinas"
              placeholderBusca="Buscar usina ou UC…"
              ordenacaoInicial={{ id: "grupoBc", direcao: "desc" }}
              barraExtra={
                podeEditar && (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void alterarUsina(nova, true, false);
                    }}
                  >
                    <Input
                      value={nova}
                      onChange={(e) => setNova(e.target.value)}
                      placeholder="Nº da UC geradora"
                      inputMode="numeric"
                      className="h-8 w-48"
                      aria-label="Número da UC geradora do Grupo BC"
                    />
                    <Button type="submit" size="sm" variant="outline" disabled={!nova.trim()}>
                      <Plus className="mr-1 h-4 w-4" /> Incluir usina
                    </Button>
                  </form>
                )
              }
              vazio={
                <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Handshake className="h-6 w-6" />
                  Nenhuma linha “INJEÇÃO SCEE” com UC geradora nas faturas importadas.
                </div>
              }
            />
          </CartaoGrafico>
          <CartaoGrafico
            titulo="Cálculo por fatura"
            descricao={`Faturas com injeção de usina do Grupo BC · Valor ${formatarMoeda(soma("valor"))} · Desconto ${formatarMoeda(soma("desconto"))} · Custo cheio ${formatarMoeda(soma("custoCheio"))} · ${formatarKwh(linhasCalculo.reduce((s, l) => s + l.kwhInjetados, 0))} injetados.`}
          >
            <TabelaDados
              dados={linhasCalculo}
              colunas={colunasCalculo}
              chave={(l) => l.id}
              nomeExportacao="grupo-bc-calculo"
              ordenacaoInicial={{ id: "competencia", direcao: "desc" }}
              vazio={
                <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Handshake className="h-6 w-6" />
                  Nenhuma fatura com injeção de usina do Grupo BC.
                </div>
              }
            />
          </CartaoGrafico>
        </>
      )}
    </div>
  );
}
