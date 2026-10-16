import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CircleDollarSign,
  Download,
  Gauge,
  Pencil,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  BadgeSituacao,
  CampoInfo,
  CartaoIndicador,
  Carregando,
  EstadoVazio,
  MensagemErro,
} from "@/components/app/comuns";
import {
  CartaoGrafico,
  COR_CONSUMO,
  COR_CUSTO,
  COR_SOLAR,
  GraficoMensal,
  SemDadosGrafico,
} from "@/components/app/graficos";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { colunasFatura, type FaturaLista } from "@/components/faturas/lista";
import { FormularioUc } from "@/components/ucs/formulario-uc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ROTULOS_TIPO_ALERTA, type TipoAlerta } from "@/lib/analise/alertas";
import {
  creditosDaFatura,
  custoDaFatura,
  faturaValida,
  type BaseCusto,
} from "@/lib/analise/calculos";
import { chaveMes, somarMeses, variacaoPercentual } from "@/lib/analise/periodos";
import { ehAmbienteEdicao } from "@/lib/ambiente";
import { useAuth } from "@/lib/auth";
import { buscarTodos, comGrupoBc } from "@/lib/consulta-paginada";
import { CHAVES, mensagemErro, useConfiguracoes, useUcs } from "@/lib/consultas";
import {
  formatarCnpj,
  formatarCustoKwh,
  formatarDataHora,
  formatarKwh,
  formatarMoeda,
  formatarMoedaCompacta,
  formatarNumero,
  formatarPercentual,
  rotuloMes,
} from "@/lib/formatacao";
import { exportarXlsx } from "@/lib/planilha/arquivos";
import type { Alerta } from "@/lib/tipos";

export const Route = createFileRoute("/_app/unidades/$id")({
  head: () => ({ meta: [{ title: "Análise da UC — Controle Energia" }] }),
  component: DetalheUc,
});

const CAMPOS = [
  "id",
  "unidade_consumidora_id",
  "numero_uc_extraido",
  "chave_acesso",
  "tipo_documento",
  "finalidade",
  "numero_documento",
  "serie",
  "data_emissao",
  "periodo_referencia",
  "data_vencimento",
  "dias_faturados",
  "nome_fornecedor",
  "consumo_kwh",
  "energia_injetada_kwh",
  "energia_compensada_kwh",
  "demanda_contratada_kw",
  "demanda_medida_kw",
  "demanda_faturada_kw",
  "energia_reativa_kvarh",
  "valor_total",
  "valor_energia",
  "valor_tusd",
  "valor_te",
  "valor_demanda",
  "valor_reativo",
  "valor_bandeira",
  "valor_icms",
  "valor_pis",
  "valor_cofins",
  "valor_cip",
  "valor_multas",
  "valor_juros",
  "valor_encargos",
  "valor_descontos",
  "valor_compensacao",
  "valor_outros",
  "status_documento",
  "status_processamento",
  "divergencias",
  "pagamento_confirmado",
  "data_pagamento",
  "valor_pago",
  "nome_arquivo",
  "excluida",
  "created_at",
].join(",");

type FaturaUc = FaturaLista & {
  energia_reativa_kvarh: number | null;
  demanda_faturada_kw: number | null;
};

interface Mes {
  mes: string;
  /** Custo da energia antes dos créditos (ou valor faturado, conforme a base). */
  custo: number;
  valorFaturado: number;
  creditos: number;
  consumo: number | null;
  custoKwh: number | null;
  dias: number | null;
  consumoDia: number | null;
  varCustoMes: number | null;
  varConsumoMes: number | null;
  varCustoAno: number | null;
  varConsumoAno: number | null;
  tusd: number | null;
  te: number | null;
  icms: number | null;
  pisCofins: number | null;
  cip: number | null;
  bandeira: number | null;
  demandaValor: number | null;
  reativo: number | null;
  multasJuros: number | null;
  demandaContratada: number | null;
  demandaMedida: number | null;
  injetada: number | null;
  compensada: number | null;
  faturas: number;
}

function somaN(a: number | null, b: number | null | undefined): number | null {
  if (b == null) return a;
  return (a ?? 0) + b;
}

function consolidarMeses(faturas: FaturaUc[], base: BaseCusto): Mes[] {
  const mapa = new Map<string, Mes>();
  for (const f of faturas.filter((x) => faturaValida(x))) {
    const mes = chaveMes(f.periodo_referencia);
    if (!mes) continue;
    const m: Mes = mapa.get(mes) ?? {
      mes,
      custo: 0,
      valorFaturado: 0,
      creditos: 0,
      consumo: null,
      custoKwh: null,
      dias: null,
      consumoDia: null,
      varCustoMes: null,
      varConsumoMes: null,
      varCustoAno: null,
      varConsumoAno: null,
      tusd: null,
      te: null,
      icms: null,
      pisCofins: null,
      cip: null,
      bandeira: null,
      demandaValor: null,
      reativo: null,
      multasJuros: null,
      demandaContratada: null,
      demandaMedida: null,
      injetada: null,
      compensada: null,
      faturas: 0,
    };
    m.faturas++;
    m.custo += custoDaFatura(f, base) ?? 0;
    m.valorFaturado += f.valor_total ?? 0;
    m.creditos += creditosDaFatura(f);
    m.consumo = somaN(m.consumo, f.consumo_kwh);
    if (f.dias_faturados != null) m.dias = Math.max(m.dias ?? 0, f.dias_faturados);
    m.tusd = somaN(m.tusd, f.valor_tusd);
    m.te = somaN(m.te, f.valor_te);
    m.icms = somaN(m.icms, f.valor_icms);
    m.pisCofins = somaN(somaN(m.pisCofins, f.valor_pis), f.valor_cofins);
    m.cip = somaN(m.cip, f.valor_cip);
    m.bandeira = somaN(m.bandeira, f.valor_bandeira);
    m.demandaValor = somaN(m.demandaValor, f.valor_demanda);
    m.reativo = somaN(m.reativo, f.valor_reativo);
    m.multasJuros = somaN(somaN(m.multasJuros, f.valor_multas), f.valor_juros);
    if (f.demanda_contratada_kw != null)
      m.demandaContratada = Math.max(m.demandaContratada ?? 0, f.demanda_contratada_kw);
    if (f.demanda_medida_kw != null)
      m.demandaMedida = Math.max(m.demandaMedida ?? 0, f.demanda_medida_kw);
    m.injetada = somaN(m.injetada, f.energia_injetada_kwh);
    m.compensada = somaN(m.compensada, f.energia_compensada_kwh);
    mapa.set(mes, m);
  }
  const meses = [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  for (const m of meses) {
    m.custoKwh = m.consumo && m.consumo > 0 ? m.custo / m.consumo : null;
    m.consumoDia = m.consumo != null && m.dias ? m.consumo / m.dias : null;
    const ant = mapa.get(somarMeses(m.mes, -1));
    const ano = mapa.get(somarMeses(m.mes, -12));
    m.varCustoMes = ant ? variacaoPercentual(m.custo, ant.custo) : null;
    m.varConsumoMes = ant ? variacaoPercentual(m.consumo, ant.consumo) : null;
    m.varCustoAno = ano ? variacaoPercentual(m.custo, ano.custo) : null;
    m.varConsumoAno = ano ? variacaoPercentual(m.consumo, ano.consumo) : null;
  }
  return meses;
}

const eixo = { fontSize: 11, fill: "var(--muted-foreground)" };

function DetalheUc() {
  const { id } = Route.useParams();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const { data: ucs, isLoading: carregandoUcs } = useUcs();
  const [editando, setEditando] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  const faturasQ = useQuery({
    queryKey: [...CHAVES.faturas, "uc", id],
    queryFn: async () => {
      const faturas = await buscarTodos<FaturaUc>(supabase, "faturas", CAMPOS, {
        unidade_consumidora_id: id,
        excluida: false,
      });
      return (await comGrupoBc(supabase, faturas)).faturas;
    },
  });
  const alertasQ = useQuery({
    queryKey: [...CHAVES.alertas, "uc", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas")
        .select("*")
        .eq("unidade_consumidora_id", id)
        .eq("ativo", true)
        .order("periodo", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Alerta[];
    },
  });

  const uc = ucs?.find((u) => u.id === id);
  const todasFaturas = useMemo(() => faturasQ.data ?? [], [faturasQ.data]);
  const { data: cfg } = useConfiguracoes();
  const baseCusto: BaseCusto = cfg?.baseCusto ?? "energia";
  const mesesTodos = useMemo(
    () => consolidarMeses(todasFaturas, baseCusto),
    [todasFaturas, baseCusto],
  );
  const meses = useMemo(
    () => mesesTodos.filter((m) => (!inicio || m.mes >= inicio) && (!fim || m.mes <= fim)),
    [mesesTodos, inicio, fim],
  );
  const faturasPeriodo = useMemo(
    () =>
      todasFaturas.filter((f) => {
        const m = chaveMes(f.periodo_referencia);
        if (!inicio && !fim) return true;
        return !!m && (!inicio || m >= inicio) && (!fim || m <= fim);
      }),
    [todasFaturas, inicio, fim],
  );

  if (carregandoUcs || faturasQ.isLoading) return <Carregando />;
  if (faturasQ.error) return <MensagemErro erro={mensagemErro(faturasQ.error)} />;
  if (!uc) return <MensagemErro erro="Unidade consumidora não encontrada." />;

  const custoTotal = meses.reduce((s, m) => s + m.custo, 0);
  const comConsumo = meses.filter((m) => m.consumo != null && m.consumo > 0);
  const consumoTotal = meses.reduce((s, m) => s + (m.consumo ?? 0), 0);
  const custoKwh = comConsumo.length
    ? comConsumo.reduce((s, m) => s + m.custo, 0) /
      comConsumo.reduce((s, m) => s + (m.consumo ?? 0), 0)
    : null;
  const ultimo = meses[meses.length - 1];
  const temDemanda = meses.some((m) => m.demandaContratada != null || m.demandaMedida != null);
  const temGd = meses.some((m) => m.injetada != null || m.compensada != null);

  const colunasMes: Coluna<Mes>[] = [
    { id: "mes", titulo: "Competência", valor: (m) => rotuloMes(m.mes) },
    {
      id: "custo",
      titulo: baseCusto === "energia" ? "Custo da energia" : "Valor faturado",
      tipo: "moeda",
      valor: (m) => m.custo,
    },
    { id: "faturado", titulo: "Valor faturado", tipo: "moeda", valor: (m) => m.valorFaturado },
    { id: "creditos", titulo: "Créditos abatidos", tipo: "moeda", valor: (m) => m.creditos },
    { id: "consumo", titulo: "Consumo (kWh)", tipo: "kwh", valor: (m) => m.consumo },
    { id: "custoKwh", titulo: "R$/kWh", tipo: "decimal4", valor: (m) => m.custoKwh },
    { id: "dias", titulo: "Dias", tipo: "numero", valor: (m) => m.dias },
    { id: "consumoDia", titulo: "kWh/dia", tipo: "numero", valor: (m) => m.consumoDia },
    {
      id: "varCustoMes",
      titulo: "Custo vs mês ant.",
      tipo: "percentual",
      valor: (m) => m.varCustoMes,
    },
    {
      id: "varConsumoMes",
      titulo: "Consumo vs mês ant.",
      tipo: "percentual",
      valor: (m) => m.varConsumoMes,
    },
    {
      id: "varCustoAno",
      titulo: "Custo vs ano ant.",
      tipo: "percentual",
      valor: (m) => m.varCustoAno,
    },
    {
      id: "varConsumoAno",
      titulo: "Consumo vs ano ant.",
      tipo: "percentual",
      valor: (m) => m.varConsumoAno,
    },
    { id: "faturas", titulo: "Faturas", tipo: "numero", valor: (m) => m.faturas, oculta: true },
  ];
  const colunasComp: Coluna<Mes>[] = [
    { id: "mes", titulo: "Competência", valor: (m) => rotuloMes(m.mes) },
    { id: "tusd", titulo: "TUSD", tipo: "moeda", valor: (m) => m.tusd },
    { id: "te", titulo: "TE", tipo: "moeda", valor: (m) => m.te },
    { id: "demanda", titulo: "Demanda", tipo: "moeda", valor: (m) => m.demandaValor },
    { id: "bandeira", titulo: "Bandeira", tipo: "moeda", valor: (m) => m.bandeira },
    { id: "reativo", titulo: "Reativo", tipo: "moeda", valor: (m) => m.reativo },
    { id: "cip", titulo: "CIP/COSIP", tipo: "moeda", valor: (m) => m.cip },
    { id: "multas", titulo: "Multas e juros", tipo: "moeda", valor: (m) => m.multasJuros },
    { id: "icms", titulo: "ICMS", tipo: "moeda", valor: (m) => m.icms },
    { id: "piscofins", titulo: "PIS/COFINS", tipo: "moeda", valor: (m) => m.pisCofins },
    { id: "creditosComp", titulo: "Créditos abatidos", tipo: "moeda", valor: (m) => -m.creditos },
    { id: "total", titulo: "Valor faturado", tipo: "moeda", valor: (m) => m.valorFaturado },
    {
      id: "custoEnergia",
      titulo: "Custo da energia",
      tipo: "moeda",
      valor: (m) => m.valorFaturado + m.creditos,
    },
  ];

  const exportarTudo = () =>
    exportarXlsx(
      `uc-${uc.numero_uc}-mensal`,
      [...colunasMes, ...colunasComp.slice(1, -1)].map((c) => ({
        id: c.id,
        titulo: c.titulo,
        tipo: c.tipo === "competencia" || c.tipo === "datahora" || !c.tipo ? "texto" : c.tipo,
        valor: c.valor,
      })),
      meses,
      `UC ${uc.numero_uc}`,
    );

  return (
    <div className="space-y-5">
      <div>
        {ehAmbienteEdicao() && (
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link to="/unidades">
              <ArrowLeft className="mr-1 h-4 w-4" /> Unidades consumidoras
            </Link>
          </Button>
        )}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">UC {uc.numero_uc}</h1>
              <BadgeSituacao situacao={uc.situacao} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {uc.fazenda}
              {uc.area && ` · ${uc.area}`}
              {uc.filial && ` · Filial ${uc.filial}`} · {formatarCnpj(uc.cnpj)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Input
                type="month"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="h-9 w-[150px]"
                aria-label="Competência inicial"
              />
              a
              <Input
                type="month"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="h-9 w-[150px]"
                aria-label="Competência final"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportarTudo()}
              disabled={!meses.length}
            >
              <Download className="mr-1.5 h-4 w-4" /> Exportar dados
            </Button>
            {pode("editar") && (
              <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Editar
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <CampoInfo rotulo="Fazenda" valor={uc.fazenda} />
          <CampoInfo rotulo="CNPJ" valor={formatarCnpj(uc.cnpj)} />
          <CampoInfo rotulo="Filial" valor={uc.filial ?? "—"} />
          <CampoInfo rotulo="Área" valor={uc.area ?? "—"} />
          <CampoInfo rotulo="Endereço" valor={uc.endereco ?? "—"} />
          <CampoInfo
            rotulo="Observações"
            valor={uc.observacoes ?? "—"}
            className="sm:col-span-2 lg:col-span-4"
          />
          <CampoInfo rotulo="Atualizado em" valor={formatarDataHora(uc.updated_at)} />
        </CardContent>
      </Card>

      {!todasFaturas.length ? (
        <EstadoVazio
          icone={Zap}
          titulo="Nenhuma fatura associada a esta UC"
          descricao="As faturas importadas com este número de UC serão associadas automaticamente."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoIndicador
              titulo={
                baseCusto === "energia"
                  ? "Custo da energia no período"
                  : "Valor faturado no período"
              }
              icone={CircleDollarSign}
              valor={formatarMoeda(custoTotal)}
              detalhe={`faturado ${formatarMoedaCompacta(
                meses.reduce((t, m) => t + m.valorFaturado, 0),
              )} · créditos ${formatarMoedaCompacta(meses.reduce((t, m) => t + m.creditos, 0))}`}
              ajuda="Custo da energia antes da compensação de créditos = valor faturado + créditos abatidos."
            />
            <CartaoIndicador
              titulo="Consumo no período"
              icone={Zap}
              valor={formatarKwh(consumoTotal)}
            />
            <CartaoIndicador
              titulo="Custo médio por kWh"
              icone={Gauge}
              valor={formatarCustoKwh(custoKwh)}
              detalhe={`${comConsumo.length} mês(es) com consumo`}
            />
            <CartaoIndicador
              titulo={ultimo ? `Último mês (${rotuloMes(ultimo.mes)})` : "Último mês"}
              icone={CircleDollarSign}
              valor={formatarMoeda(ultimo?.custo)}
              variacao={ultimo?.varCustoMes ?? null}
              detalhe={
                ultimo?.varCustoAno != null
                  ? `vs. mês anterior · ${formatarPercentual(ultimo.varCustoAno)} vs. ano anterior`
                  : "vs. mês anterior"
              }
            />
          </div>

          {(alertasQ.data?.length ?? 0) > 0 && (
            <Card className="border-warning/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-warning-foreground" /> Alertas desta UC
                  </div>
                  <Button variant="link" size="sm" asChild>
                    <Link to="/alertas">Ver todos</Link>
                  </Button>
                </div>
                <ul className="space-y-1.5">
                  {alertasQ
                    .data!.filter((a) => a.status !== "resolvido")
                    .slice(0, 6)
                    .map((a) => (
                      <li key={a.id} className="flex flex-wrap items-start gap-2 text-sm">
                        <Badge
                          variant="outline"
                          className={
                            a.classificacao === "confirmado"
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : "border-warning/40 bg-warning/15 text-warning-foreground"
                          }
                        >
                          {a.classificacao === "confirmado" ? "Alerta" : "Possível anomalia"}
                        </Badge>
                        <span className="font-medium">
                          {ROTULOS_TIPO_ALERTA[a.tipo_alerta as TipoAlerta] ?? a.tipo_alerta}
                        </span>
                        <span className="text-muted-foreground">{a.descricao}</span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <CartaoGrafico titulo="Consumo mensal (kWh)">
              <GraficoMensal
                dados={meses}
                campo="consumo"
                cor={COR_CONSUMO}
                rotulo="Consumo"
                formatar={(v) => `${formatarNumero(v)} kWh`}
                formatarEixo={(v) => formatarNumero(v)}
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Custo mensal (R$)"
              descricao={
                baseCusto === "energia" ? "Custo da energia antes dos créditos." : "Valor faturado."
              }
            >
              <GraficoMensal
                dados={meses}
                campo="custo"
                cor={COR_CUSTO}
                rotulo="Custo"
                formatar={formatarMoedaCompacta}
              />
            </CartaoGrafico>
            <CartaoGrafico titulo="Custo por kWh" descricao="Valor total ÷ consumo do mês.">
              <GraficoLinhas
                dados={meses}
                series={[{ campo: "custoKwh", rotulo: "R$/kWh", cor: COR_CUSTO }]}
                formatar={(v) => `R$ ${formatarNumero(v, 4)}`}
                formatarEixo={(v) => formatarNumero(v, 2)}
              />
            </CartaoGrafico>
            {temDemanda ? (
              <CartaoGrafico titulo="Histórico de demanda (kW)">
                <GraficoLinhas
                  dados={meses}
                  series={[
                    { campo: "demandaContratada", rotulo: "Contratada", cor: COR_CUSTO },
                    { campo: "demandaMedida", rotulo: "Medida", cor: COR_CONSUMO },
                  ]}
                  formatar={(v) => `${formatarNumero(v, 0, 1)} kW`}
                  formatarEixo={(v) => formatarNumero(v)}
                />
              </CartaoGrafico>
            ) : (
              <CartaoGrafico
                titulo="Histórico de demanda"
                descricao="Demanda não informada nos documentos desta UC."
              >
                <SemDadosGrafico altura={120} />
              </CartaoGrafico>
            )}
            {temGd && (
              <CartaoGrafico titulo="Energia injetada e compensada (kWh)" className="lg:col-span-2">
                <GraficoLinhas
                  dados={meses}
                  series={[
                    { campo: "injetada", rotulo: "Injetada", cor: COR_SOLAR },
                    { campo: "compensada", rotulo: "Compensada", cor: COR_CUSTO },
                  ]}
                  formatar={(v) => `${formatarNumero(v)} kWh`}
                />
              </CartaoGrafico>
            )}
          </div>

          <Tabs defaultValue="mensal">
            <TabsList className="flex-wrap">
              <TabsTrigger value="mensal">Comparativo mensal</TabsTrigger>
              <TabsTrigger value="componentes">Tributos e componentes</TabsTrigger>
              <TabsTrigger value="faturas">Faturas ({faturasPeriodo.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="mensal">
              <TabelaDados
                dados={[...meses].reverse()}
                colunas={colunasMes}
                chave={(m) => m.mes}
                busca={false}
                nomeExportacao={`uc-${uc.numero_uc}-comparativo`}
              />
            </TabsContent>
            <TabsContent value="componentes">
              <TabelaDados
                dados={[...meses].reverse()}
                colunas={colunasComp}
                chave={(m) => m.mes}
                busca={false}
                nomeExportacao={`uc-${uc.numero_uc}-componentes`}
              />
            </TabsContent>
            <TabsContent value="faturas">
              <TabelaDados
                dados={faturasPeriodo}
                colunas={colunasFatura()}
                chave={(f) => f.id}
                nomeExportacao={`uc-${uc.numero_uc}-faturas`}
                ordenacaoInicial={{ id: "competencia", direcao: "desc" }}
                aoClicarLinha={(f) => navigate({ to: "/faturas/$id", params: { id: f.id } })}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      <FormularioUc
        aberto={editando}
        aoFechar={() => setEditando(false)}
        uc={uc}
        existentes={ucs ?? []}
      />
    </div>
  );
}

function GraficoLinhas({
  dados,
  series,
  formatar,
  formatarEixo = formatar,
}: {
  dados: Mes[];
  series: { campo: keyof Mes; rotulo: string; cor: string }[];
  formatar: (v: number) => string;
  formatarEixo?: (v: number) => string;
}) {
  if (!dados.some((d) => series.some((s) => d[s.campo] != null))) return <SemDadosGrafico />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="mes"
          tickFormatter={rotuloMes}
          tick={eixo}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={eixo}
          axisLine={false}
          tickLine={false}
          width={72}
          tickFormatter={(v: number) => formatarEixo(v)}
        />
        {series.length > 1 && (
          <Legend
            verticalAlign="top"
            height={24}
            iconType="plainline"
            formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>}
          />
        )}
        <Tooltip
          formatter={(v: number, nome: string) => [formatar(v), nome]}
          labelFormatter={(l: string) => rotuloMes(l)}
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            background: "var(--popover)",
            border: "1px solid var(--border)",
          }}
        />
        {series.map((s) => (
          <Line
            key={s.campo}
            type="monotone"
            dataKey={s.campo}
            name={s.rotulo}
            stroke={s.cor}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
