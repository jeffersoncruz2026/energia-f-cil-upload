import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Building,
  CalendarRange,
  FileText,
  History,
  Inbox,
  Layers,
  Tractor,
  ListOrdered,
  PieChart,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { CabecalhoPagina, Carregando, MensagemErro } from "@/components/app/comuns";
import { BarraFiltros } from "@/components/app/filtros";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { colunasFatura, useFaturasLista, type FaturaLista } from "@/components/faturas/lista";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ROTULOS_TIPO_ALERTA, type TipoAlerta } from "@/lib/analise/alertas";
import {
  agruparPor,
  custoDaFatura,
  COMPONENTES,
  filtrarFaturas,
  serieMensal,
  somarCampo,
  TRIBUTOS,
  ucAtendeFiltros,
  type FaturaAnalise,
} from "@/lib/analise/calculos";
import { variacaoPercentual } from "@/lib/analise/periodos";
import { useFiltrosAnalise } from "@/lib/analise/use-filtros";
import { buscarTodos } from "@/lib/consulta-paginada";
import { CHAVES, mensagemErro, useConfiguracoes, useUcs } from "@/lib/consultas";
import { formatarCnpj, rotuloMes } from "@/lib/formatacao";
import type { Alerta, HistoricoImportacao, UnidadeConsumidora } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Controle Energia" }] }),
  component: PaginaRelatorios,
});

type TipoRelatorio =
  | "faturas"
  | "fazenda"
  | "filial"
  | "area"
  | "uc"
  | "mensal"
  | "composicao"
  | "ranking"
  | "pendentes"
  | "importacoes"
  | "anomalias";

const RELATORIOS: { id: TipoRelatorio; titulo: string; descricao: string; icone: LucideIcon }[] = [
  {
    id: "faturas",
    titulo: "Faturas por período",
    descricao: "Lista detalhada das faturas válidas",
    icone: FileText,
  },
  {
    id: "fazenda",
    titulo: "Custo por fazenda",
    descricao: "Custo, consumo e R$/kWh por fazenda",
    icone: Building,
  },
  {
    id: "filial",
    titulo: "Custo por filial",
    descricao: "Custo e participação por filial",
    icone: PieChart,
  },
  {
    id: "area",
    titulo: "Custo por área",
    descricao: "Agrícola, pecuária, seringal… por fazenda",
    icone: Tractor,
  },
  { id: "uc", titulo: "Consumo por UC", descricao: "Consumo e custo de cada UC", icone: Layers },
  {
    id: "mensal",
    titulo: "Comparativo mensal",
    descricao: "Consumo e custo mês a mês",
    icone: CalendarRange,
  },
  {
    id: "composicao",
    titulo: "Composição dos valores",
    descricao: "Componentes e tributos por UC",
    icone: BarChart3,
  },
  {
    id: "ranking",
    titulo: "Ranking de custos",
    descricao: "UCs ordenadas pelo custo",
    icone: ListOrdered,
  },
  { id: "pendentes", titulo: "Faturas pendentes", descricao: "Sem UC identificada", icone: Inbox },
  {
    id: "importacoes",
    titulo: "Histórico de importações",
    descricao: "Arquivos e resultados",
    icone: History,
  },
  {
    id: "anomalias",
    titulo: "Relatório de anomalias",
    descricao: "Alertas e possíveis anomalias",
    icone: ShieldAlert,
  },
];

interface LinhaGrupo {
  chave: string;
  rotulo: string;
  fazenda?: string | undefined;
  filial?: string | null | undefined;
  area?: string | null | undefined;
  cnpj?: string | undefined;
  custo: number;
  valorFaturado: number;
  creditos: number;
  grupoBc: number;
  descontoGrupoBc: number;
  custoCheioGrupoBc: number;
  consumo: number;
  custoKwh: number | null;
  faturas: number;
  ucs: number;
  participacao: number | null;
  posicao?: number;
  [componente: string]: unknown;
}

function PaginaRelatorios() {
  const [tipo, setTipo] = useState<TipoRelatorio>("faturas");
  const faturasQ = useFaturasLista();
  const ucsQ = useUcs();
  const { data: cfg } = useConfiguracoes();
  const [filtros, setFiltros] = useFiltrosAnalise(
    faturasQ.data as FaturaAnalise[] | undefined,
    cfg?.criterio ?? (cfg ? "competencia" : undefined),
  );

  const historicoQ = useQuery({
    queryKey: [...CHAVES.historico, "relatorio"],
    enabled: tipo === "importacoes",
    queryFn: () =>
      buscarTodos<HistoricoImportacao>(
        supabase,
        "historico_importacoes",
        "*",
        {},
        "data_importacao",
      ),
  });
  const alertasQ = useQuery({
    queryKey: [...CHAVES.alertas, "relatorio"],
    enabled: tipo === "anomalias",
    queryFn: () => buscarTodos<Alerta>(supabase, "alertas", "*", { ativo: true }),
  });

  const ucs = useMemo(() => ucsQ.data ?? [], [ucsQ.data]);
  const ucsPorId = useMemo(() => new Map(ucs.map((u) => [u.id, u])), [ucs]);
  const faturasPeriodo = useMemo(
    () =>
      filtrarFaturas((faturasQ.data ?? []) as (FaturaLista & FaturaAnalise)[], ucsPorId, filtros),
    [faturasQ.data, ucsPorId, filtros],
  );

  const grupos = useMemo(() => {
    const total = faturasPeriodo.reduce(
      (s, f) => s + (custoDaFatura(f, filtros.baseCusto) ?? 0),
      0,
    );
    const montar = (chave: (u: UnidadeConsumidora) => { chave: string; rotulo: string }) =>
      agruparPor(
        faturasPeriodo,
        ucsPorId,
        (u) => chave(u as UnidadeConsumidora),
        filtros.baseCusto,
      ).map((g) => {
        const fats = faturasPeriodo.filter((f) => {
          const u = ucsPorId.get(f.unidade_consumidora_id!);
          return u && chave(u).chave === g.chave;
        });
        // UC representativa do grupo (para fazenda/área/filial nas colunas)
        const uc = ucsPorId.get(g.chave) ?? ucsPorId.get(fats[0]?.unidade_consumidora_id ?? "");
        const linha: LinhaGrupo = {
          ...g,
          fazenda: uc?.fazenda,
          filial: uc?.filial,
          area: uc?.area,
          cnpj: uc?.cnpj,
          participacao: total ? (g.custo / total) * 100 : null,
        };
        for (const c of [...COMPONENTES, ...TRIBUTOS])
          linha[String(c.campo)] = somarCampo(fats, c.campo);
        return linha;
      });
    return {
      fazenda: montar((u) => ({ chave: u.fazenda, rotulo: u.fazenda })),
      filial: montar((u) => ({ chave: u.filial ?? "—", rotulo: u.filial ?? "Sem filial" })),
      area: montar((u) => ({
        chave: `${u.fazenda}|${u.area ?? ""}`,
        rotulo: u.area ?? "Sem área definida",
      })),
      uc: montar((u) => ({ chave: u.id, rotulo: u.numero_uc })).map((l, i) => ({
        ...l,
        posicao: i + 1,
      })),
    };
  }, [faturasPeriodo, ucsPorId, filtros.baseCusto]);

  const mensal = useMemo(() => {
    const serie = serieMensal(
      faturasPeriodo,
      filtros.criterio,
      filtros.inicio && filtros.fim ? { inicio: filtros.inicio, fim: filtros.fim } : null,
      filtros.baseCusto,
    );
    return serie.map((p, i) => ({
      ...p,
      varCusto: i > 0 ? variacaoPercentual(p.custo, serie[i - 1]!.custo) : null,
      varConsumo: i > 0 ? variacaoPercentual(p.consumo, serie[i - 1]!.consumo) : null,
    }));
  }, [faturasPeriodo, filtros]);

  if (faturasQ.error || ucsQ.error)
    return <MensagemErro erro={mensagemErro(faturasQ.error ?? ucsQ.error)} />;
  if (faturasQ.isLoading || ucsQ.isLoading) return <Carregando />;

  const colunasGrupo = (titulo: string, extra: Coluna<LinhaGrupo>[] = []): Coluna<LinhaGrupo>[] => [
    ...extra,
    {
      id: "rotulo",
      titulo,
      valor: (l) => l.rotulo,
      celula: (l) => <span className="font-medium">{l.rotulo}</span>,
    },
    {
      id: "custo",
      titulo: filtros.baseCusto === "energia" ? "Custo da energia" : "Valor faturado",
      tipo: "moeda",
      valor: (l) => l.custo,
    },
    { id: "faturado", titulo: "Valor faturado", tipo: "moeda", valor: (l) => l.valorFaturado },
    { id: "creditos", titulo: "Créditos abatidos", tipo: "moeda", valor: (l) => l.creditos },
    { id: "grupoBc", titulo: "Grupo BC", tipo: "moeda", valor: (l) => l.grupoBc },
    {
      id: "descontoGrupoBc",
      titulo: "Desconto Grupo BC",
      tipo: "moeda",
      valor: (l) => l.descontoGrupoBc,
    },
    {
      id: "custoCheioGrupoBc",
      titulo: "Custo cheio Grupo BC",
      tipo: "moeda",
      valor: (l) => l.custoCheioGrupoBc,
    },
    {
      id: "participacao",
      titulo: "Participação",
      tipo: "percentual",
      valor: (l) => l.participacao,
    },
    { id: "consumo", titulo: "Consumo (kWh)", tipo: "kwh", valor: (l) => l.consumo },
    { id: "custoKwh", titulo: "R$/kWh", tipo: "decimal4", valor: (l) => l.custoKwh },
    { id: "faturas", titulo: "Faturas", tipo: "numero", valor: (l) => l.faturas },
    { id: "ucs", titulo: "UCs", tipo: "numero", valor: (l) => l.ucs },
  ];
  const colunasUc: Coluna<LinhaGrupo>[] = [
    {
      id: "rotulo",
      titulo: "UC",
      valor: (l) => l.rotulo,
      celula: (l) => <span className="font-medium">{l.rotulo}</span>,
    },
    { id: "fazenda", titulo: "Fazenda", valor: (l) => l.fazenda },
    { id: "filial", titulo: "Filial", valor: (l) => l.filial },
    { id: "area", titulo: "Área", valor: (l) => l.area },
    {
      id: "cnpj",
      titulo: "CNPJ",
      valor: (l) => (l.cnpj ? formatarCnpj(l.cnpj) : null),
      oculta: true,
    },
  ];

  let conteudo: React.ReactNode = null;
  switch (tipo) {
    case "faturas":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={faturasPeriodo as FaturaLista[]}
          colunas={colunasFatura()}
          chave={(f) => f.id}
          nomeExportacao="relatorio-faturas"
          ordenacaoInicial={{ id: "competencia", direcao: "asc" }}
        />
      );
      break;
    case "fazenda":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={grupos.fazenda}
          colunas={colunasGrupo("Fazenda")}
          chave={(l) => l.chave}
          nomeExportacao="relatorio-custo-fazenda"
        />
      );
      break;
    case "filial":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={grupos.filial}
          colunas={colunasGrupo("Filial")}
          chave={(l) => l.chave}
          nomeExportacao="relatorio-custo-filial"
        />
      );
      break;
    case "area":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={grupos.area}
          colunas={colunasGrupo("Área", [
            { id: "fazenda", titulo: "Fazenda", valor: (l) => l.fazenda },
          ])}
          chave={(l) => l.chave}
          nomeExportacao="relatorio-custo-area"
          ordenacaoInicial={{ id: "fazenda", direcao: "asc" }}
        />
      );
      break;
    case "uc":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={grupos.uc}
          colunas={[
            ...colunasUc,
            ...colunasGrupo("UC")
              .slice(1)
              .filter((c) => c.id !== "ucs"),
          ]}
          chave={(l) => l.chave}
          nomeExportacao="relatorio-consumo-uc"
          ordenacaoInicial={{ id: "consumo", direcao: "desc" }}
        />
      );
      break;
    case "ranking":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={grupos.uc}
          colunas={[
            { id: "posicao", titulo: "Posição", tipo: "numero", valor: (l) => l.posicao },
            ...colunasUc,
            ...colunasGrupo("UC")
              .slice(1)
              .filter((c) => c.id !== "ucs"),
          ]}
          chave={(l) => l.chave}
          nomeExportacao="relatorio-ranking-custos"
          ordenacaoInicial={{ id: "posicao", direcao: "asc" }}
        />
      );
      break;
    case "composicao":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={grupos.uc}
          colunas={[
            ...colunasUc,
            ...[...COMPONENTES, ...TRIBUTOS].map((c): Coluna<LinhaGrupo> => ({
              id: String(c.campo),
              titulo: c.rotulo,
              tipo: "moeda",
              valor: (l) => l[String(c.campo)] as number | null,
            })),
            {
              id: "faturado",
              titulo: "Valor faturado",
              tipo: "moeda",
              valor: (l) => l.valorFaturado,
            },
            {
              id: "creditos",
              titulo: "Créditos abatidos",
              tipo: "moeda",
              valor: (l) => l.creditos,
            },
            { id: "grupoBc", titulo: "Grupo BC", tipo: "moeda", valor: (l) => l.grupoBc },
            {
              id: "descontoGrupoBc",
              titulo: "Desconto Grupo BC",
              tipo: "moeda",
              valor: (l) => l.descontoGrupoBc,
            },
            {
              id: "custoCheioGrupoBc",
              titulo: "Custo cheio Grupo BC",
              tipo: "moeda",
              valor: (l) => l.custoCheioGrupoBc,
            },
            {
              id: "custo",
              titulo: filtros.baseCusto === "energia" ? "Custo da energia" : "Valor faturado",
              tipo: "moeda",
              valor: (l) => l.custo,
            },
          ]}
          chave={(l) => l.chave}
          nomeExportacao="relatorio-composicao-valores"
          rodape={
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Componentes conforme discriminados nos itens dos documentos. Tributos são, em geral,
              cobrados “por dentro” dos itens; por isso componentes e tributos não devem ser somados
              ao valor total.
            </p>
          }
        />
      );
      break;
    case "mensal":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={mensal}
          chave={(p) => p.mes}
          nomeExportacao="relatorio-comparativo-mensal"
          colunas={[
            { id: "mes", titulo: "Mês", valor: (p) => rotuloMes(p.mes) },
            {
              id: "custo",
              titulo: filtros.baseCusto === "energia" ? "Custo da energia" : "Valor faturado",
              tipo: "moeda",
              valor: (p) => p.custo,
            },
            {
              id: "faturado",
              titulo: "Valor faturado",
              tipo: "moeda",
              valor: (p) => p.valorFaturado,
            },
            {
              id: "creditos",
              titulo: "Créditos abatidos",
              tipo: "moeda",
              valor: (p) => p.creditos,
            },
            { id: "grupoBc", titulo: "Grupo BC", tipo: "moeda", valor: (p) => p.grupoBc },
            {
              id: "descontoGrupoBc",
              titulo: "Desconto Grupo BC",
              tipo: "moeda",
              valor: (p) => p.descontoGrupoBc,
            },
            {
              id: "custoCheioGrupoBc",
              titulo: "Custo cheio Grupo BC",
              tipo: "moeda",
              valor: (p) => p.custoCheioGrupoBc,
            },
            { id: "varCusto", titulo: "Var. custo", tipo: "percentual", valor: (p) => p.varCusto },
            { id: "consumo", titulo: "Consumo (kWh)", tipo: "kwh", valor: (p) => p.consumo },
            {
              id: "varConsumo",
              titulo: "Var. consumo",
              tipo: "percentual",
              valor: (p) => p.varConsumo,
            },
            { id: "custoKwh", titulo: "R$/kWh", tipo: "decimal4", valor: (p) => p.custoKwh },
            { id: "faturas", titulo: "Faturas", tipo: "numero", valor: (p) => p.faturas },
            { id: "ucs", titulo: "UCs", tipo: "numero", valor: (p) => p.ucs },
          ]}
        />
      );
      break;
    case "pendentes":
      conteudo = (
        <TabelaDados
          key={tipo}
          dados={(faturasQ.data ?? []).filter(
            (f) => f.status_processamento === "pendente_identificacao" && !f.excluida,
          )}
          colunas={colunasFatura()}
          chave={(f) => f.id}
          nomeExportacao="relatorio-faturas-pendentes"
        />
      );
      break;
    case "importacoes":
      conteudo = historicoQ.isLoading ? (
        <Carregando />
      ) : (
        <TabelaDados
          key={tipo}
          dados={historicoQ.data ?? []}
          chave={(h) => h.id}
          nomeExportacao="relatorio-historico-importacoes"
          ordenacaoInicial={{ id: "data", direcao: "desc" }}
          colunas={[
            { id: "data", titulo: "Data", tipo: "datahora", valor: (h) => h.data_importacao },
            { id: "arquivo", titulo: "Arquivo", valor: (h) => h.nome_arquivo },
            { id: "tipo", titulo: "Tipo", valor: (h) => h.tipo_importacao },
            { id: "status", titulo: "Status", valor: (h) => h.status },
            {
              id: "proc",
              titulo: "Processados",
              tipo: "numero",
              valor: (h) => h.quantidade_processada,
            },
            {
              id: "imp",
              titulo: "Importados",
              tipo: "numero",
              valor: (h) => h.quantidade_importada,
            },
            {
              id: "atu",
              titulo: "Atualizados",
              tipo: "numero",
              valor: (h) => h.quantidade_atualizada,
            },
            {
              id: "rej",
              titulo: "Rejeitados",
              tipo: "numero",
              valor: (h) => h.quantidade_rejeitada,
            },
            { id: "res", titulo: "Resultado", valor: (h) => h.resultado },
          ]}
        />
      );
      break;
    case "anomalias":
      conteudo = alertasQ.isLoading ? (
        <Carregando />
      ) : (
        <TabelaDados
          key={tipo}
          dados={(alertasQ.data ?? []).filter((a) => {
            const uc = a.unidade_consumidora_id
              ? ucsPorId.get(a.unidade_consumidora_id)
              : undefined;
            if (!uc || !ucAtendeFiltros(uc, filtros)) return false;
            const mes = a.periodo?.slice(0, 7);
            return (
              (!filtros.inicio || (mes && mes >= filtros.inicio)) &&
              (!filtros.fim || (mes && mes <= filtros.fim))
            );
          })}
          chave={(a) => a.id}
          nomeExportacao="relatorio-anomalias"
          ordenacaoInicial={{ id: "periodo", direcao: "desc" }}
          colunas={[
            { id: "periodo", titulo: "Período", tipo: "competencia", valor: (a) => a.periodo },
            {
              id: "uc",
              titulo: "UC",
              valor: (a) => ucsPorId.get(a.unidade_consumidora_id ?? "")?.numero_uc,
            },
            {
              id: "fazenda",
              titulo: "Fazenda",
              valor: (a) => ucsPorId.get(a.unidade_consumidora_id ?? "")?.fazenda,
            },
            {
              id: "tipo",
              titulo: "Tipo",
              valor: (a) => ROTULOS_TIPO_ALERTA[a.tipo_alerta as TipoAlerta] ?? a.tipo_alerta,
            },
            {
              id: "class",
              titulo: "Classificação",
              valor: (a) =>
                a.classificacao === "confirmado" ? "Alerta confirmado" : "Possível anomalia",
            },
            { id: "indicador", titulo: "Indicador", valor: (a) => a.indicador },
            { id: "atual", titulo: "Valor atual", tipo: "numero", valor: (a) => a.valor_atual },
            {
              id: "comp",
              titulo: "Valor de comparação",
              tipo: "numero",
              valor: (a) => a.valor_comparacao,
            },
            {
              id: "var",
              titulo: "Variação",
              tipo: "percentual",
              valor: (a) => a.variacao_percentual,
            },
            {
              id: "motivo",
              titulo: "Motivo",
              valor: (a) => a.descricao,
              classe: "min-w-[300px] whitespace-normal text-xs",
            },
            { id: "status", titulo: "Status", valor: (a) => a.status },
          ]}
        />
      );
      break;
  }

  const semFiltro = tipo === "pendentes" || tipo === "importacoes";

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Selecione o relatório, aplique filtros, escolha as colunas e ordene. A exportação (Excel ou CSV) contém apenas os registros filtrados e as colunas visíveis."
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {RELATORIOS.map((r) => (
          <button key={r.id} type="button" onClick={() => setTipo(r.id)} className="text-left">
            <Card
              className={cn(
                "h-full transition-colors hover:border-primary/50",
                tipo === r.id && "border-primary bg-primary/5",
              )}
            >
              <CardContent className="flex items-start gap-2 p-3">
                <r.icone
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    tipo === r.id ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{r.titulo}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{r.descricao}</div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      {!semFiltro && <BarraFiltros filtros={filtros} aoMudar={setFiltros} ucs={ucs} />}
      {conteudo}
    </div>
  );
}
