import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BatteryCharging,
  CalendarClock,
  CircleDollarSign,
  Gauge,
  Info,
  Percent,
  PiggyBank,
  PlugZap,
  Sun,
  TriangleAlert,
  Upload,
  Zap,
} from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
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
  CabecalhoPagina,
  CartaoIndicador,
  Carregando,
  EstadoVazio,
  MensagemErro,
} from "@/components/app/comuns";
import { BarraFiltros } from "@/components/app/filtros";
import {
  CartaoGrafico,
  COR_CONSUMO,
  COR_CUSTO,
  COR_SOLAR,
  GraficoBarrasHorizontais,
  GraficoMensal,
  SemDadosGrafico,
} from "@/components/app/graficos";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ROTULOS_TIPO_ALERTA, type TipoAlerta } from "@/lib/analise/alertas";
import type { FaturaAnalise } from "@/lib/analise/calculos";
import {
  calcularIndicadoresSolar,
  CAMPOS_FATURA_SOLAR,
  filtrarDadosGd,
  montarDadosGd,
  resumirPorUc,
  serieMensalSolar,
  type FaturaSolarEntrada,
  type ResumoUcSolar,
} from "@/lib/analise/solar";
import { useFiltrosAnalise } from "@/lib/analise/use-filtros";
import { useAuth } from "@/lib/auth";
import { buscarItensGd, buscarTodos } from "@/lib/consulta-paginada";
import { CHAVES, mensagemErro, useUcs } from "@/lib/consultas";
import {
  formatarCompetencia,
  formatarKwh,
  formatarMoeda,
  formatarMoedaCompacta,
  formatarNumero,
  rotuloMes,
} from "@/lib/formatacao";
import type { Alerta } from "@/lib/tipos";

export const Route = createFileRoute("/_app/solar")({
  head: () => ({ meta: [{ title: "Energia Solar (GD) — Controle Energia" }] }),
  component: PaginaSolar,
});

const TIPOS_ALERTA_SOLAR: TipoAlerta[] = [
  "queda_injecao_solar",
  "creditos_expirados",
  "creditos_a_expirar",
  "saldo_creditos_elevado",
];

const eixo = { fontSize: 11, fill: "var(--muted-foreground)" };
const kwh = (v: number) => `${formatarNumero(v)} kWh`;

function useDadosSolar() {
  return useQuery({
    queryKey: [...CHAVES.faturas, "solar"],
    queryFn: async () => {
      const [faturas, itens] = await Promise.all([
        buscarTodos<FaturaSolarEntrada>(supabase, "faturas", CAMPOS_FATURA_SOLAR, {
          excluida: false,
        }),
        buscarItensGd(supabase),
      ]);
      return { faturas, dados: montarDadosGd(faturas, itens) };
    },
  });
}

function PaginaSolar() {
  const solarQ = useDadosSolar();
  const ucsQ = useUcs();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [filtros, setFiltros] = useFiltrosAnalise(
    solarQ.data?.faturas as FaturaAnalise[] | undefined,
    "competencia",
  );
  const alertasQ = useQuery({
    queryKey: [...CHAVES.alertas, "solar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alertas")
        .select("*")
        .eq("ativo", true)
        .neq("status", "resolvido")
        .in("tipo_alerta", TIPOS_ALERTA_SOLAR)
        .order("periodo", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as Alerta[];
    },
  });

  const ucs = useMemo(() => ucsQ.data ?? [], [ucsQ.data]);
  const ucsPorId = useMemo(() => new Map(ucs.map((u) => [u.id, u])), [ucs]);

  const analise = useMemo(() => {
    const dados = filtrarDadosGd(solarQ.data?.dados ?? [], ucsPorId, filtros);
    const intervalo =
      filtros.inicio && filtros.fim ? { inicio: filtros.inicio, fim: filtros.fim } : null;
    return {
      dados,
      ind: calcularIndicadoresSolar(dados),
      serie: serieMensalSolar(dados, intervalo),
      porUc: resumirPorUc(dados),
    };
  }, [solarQ.data, ucsPorId, filtros]);

  if (solarQ.error || ucsQ.error) {
    return (
      <MensagemErro
        erro={mensagemErro(solarQ.error ?? ucsQ.error, "Não foi possível carregar os dados.")}
      />
    );
  }
  if (solarQ.isLoading || ucsQ.isLoading) return <Carregando />;

  const semGd = (solarQ.data?.dados.length ?? 0) === 0;
  const { ind } = analise;
  const nomeUc = (id: string) => {
    const u = ucsPorId.get(id);
    return u ? `UC ${u.numero_uc}` : "UC";
  };

  const colunas: Coluna<ResumoUcSolar>[] = [
    {
      id: "uc",
      titulo: "UC",
      valor: (r) => ucsPorId.get(r.ucId)?.numero_uc,
      celula: (r) => <span className="font-medium">{ucsPorId.get(r.ucId)?.numero_uc ?? "—"}</span>,
    },
    { id: "fazenda", titulo: "Fazenda", valor: (r) => ucsPorId.get(r.ucId)?.fazenda },
    { id: "area", titulo: "Área", valor: (r) => ucsPorId.get(r.ucId)?.area },
    { id: "papel", titulo: "Papel na GD", valor: (r) => r.papel },
    { id: "participacao", titulo: "Modalidade", valor: (r) => r.participacao, oculta: true },
    { id: "fonte", titulo: "Fonte", valor: (r) => r.fonte, oculta: true },
    { id: "geradora", titulo: "UC geradora", valor: (r) => r.ucGeradora, oculta: true },
    {
      id: "potencia",
      titulo: "Potência da geradora (kW)",
      tipo: "numero",
      valor: (r) => r.potenciaKw,
    },
    { id: "injetada", titulo: "Injetada (kWh)", tipo: "kwh", valor: (r) => r.injetadaKwh },
    { id: "kwp", titulo: "Injeção kWh/kWp/mês", tipo: "numero", valor: (r) => r.injecaoPorKwpMes },
    { id: "creditos", titulo: "Créditos usados (kWh)", tipo: "kwh", valor: (r) => r.creditosKwh },
    {
      id: "consumo",
      titulo: "Consumo (kWh)",
      tipo: "kwh",
      valor: (r) => r.consumoKwh,
      oculta: true,
    },
    {
      id: "pct",
      titulo: "% consumo compensado",
      tipo: "numero",
      valor: (r) => r.percentualCompensado,
      celula: (r) =>
        r.percentualCompensado != null ? `${formatarNumero(r.percentualCompensado, 1)}%` : "—",
    },
    { id: "economia", titulo: "Economia (R$)", tipo: "moeda", valor: (r) => r.economia },
    { id: "custo", titulo: "Custo faturado", tipo: "moeda", valor: (r) => r.custo, oculta: true },
    { id: "saldo", titulo: "Saldo de créditos (kWh)", tipo: "kwh", valor: (r) => r.saldoAtualKwh },
    { id: "expirar", titulo: "A expirar (kWh)", tipo: "kwh", valor: (r) => r.creditosExpirarKwh },
    {
      id: "competExpirar",
      titulo: "Expira em",
      tipo: "competencia",
      valor: (r) => (r.competenciaExpirar ? `${r.competenciaExpirar}-01` : null),
    },
    {
      id: "expirados",
      titulo: "Expirados (kWh)",
      tipo: "kwh",
      valor: (r) => r.creditosExpiradosKwh,
    },
    { id: "meses", titulo: "Meses", tipo: "numero", valor: (r) => r.meses, oculta: true },
  ];

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Energia Solar (Geração Distribuída)"
        descricao="Energia injetada na rede, créditos compensados nas faturas, economia, saldo e validade dos créditos, a partir dos XMLs importados."
      />

      {semGd ? (
        <EstadoVazio
          icone={Sun}
          titulo="Nenhuma fatura com geração distribuída"
          descricao="Quando forem importadas faturas com energia injetada, créditos compensados ou informações do sistema de compensação (grupo gSCEE da NF3e), as análises de energia solar aparecem aqui."
          acao={
            pode("importar") && (
              <Button asChild>
                <Link to="/importar">
                  <Upload className="mr-2 h-4 w-4" /> Importar XML
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <BarraFiltros filtros={filtros} aoMudar={setFiltros} ucs={ucs} ocultar={["criterio"]} />

          <Card>
            <CardContent className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                A fatura não mostra a <strong>geração total</strong> do sistema: mostra a energia{" "}
                <strong>injetada</strong> (excedente enviado à rede, lido no medidor bidirecional) e
                os <strong>créditos compensados</strong> (kWh abatidos na fatura). A energia gerada
                e consumida na hora pela própria UC não passa pelo medidor. Valores por competência;
                campos ausentes no XML ficam indisponíveis.
              </span>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <CartaoIndicador
              titulo="Energia injetada"
              icone={Sun}
              valor={formatarKwh(ind.injetadaKwh)}
              detalhe={`${ind.ucsGeradoras} UC(s) geradora(s)`}
              ajuda="Excedente injetado na rede, segundo as medições de injeção informadas nas faturas."
            />
            <CartaoIndicador
              titulo="Créditos compensados"
              icone={BatteryCharging}
              valor={formatarKwh(ind.creditosKwh)}
              detalhe={`${ind.ucsComGd} UC(s) com GD`}
              ajuda="kWh abatidos nas faturas pelos itens de energia injetada/compensada (sem somar TUSD e TE em dobro)."
            />
            <CartaoIndicador
              titulo="Economia com créditos"
              icone={PiggyBank}
              valor={formatarMoeda(ind.economia)}
              detalhe="valor abatido nas faturas"
              ajuda="Soma dos valores (R$) dos itens de crédito de energia nas faturas do período."
            />
            <CartaoIndicador
              titulo="% do consumo compensado"
              icone={Percent}
              valor={
                ind.percentualCompensado != null
                  ? `${formatarNumero(ind.percentualCompensado, 1)}%`
                  : "—"
              }
              detalhe="créditos ÷ consumo faturado"
              ajuda="Créditos compensados ÷ consumo das mesmas faturas (somente faturas com as duas informações)."
            />
            <CartaoIndicador
              titulo="Valor médio do kWh compensado"
              icone={CircleDollarSign}
              valor={
                ind.valorMedioKwhCompensado != null
                  ? `R$ ${formatarNumero(ind.valorMedioKwhCompensado, 4)}`
                  : "—"
              }
              detalhe="por kWh de crédito"
            />
            <CartaoIndicador
              titulo="Saldo de créditos"
              icone={PlugZap}
              valor={formatarKwh(ind.saldoAtualKwh)}
              detalhe="última posição de cada UC"
              ajuda="Saldo informado no grupo gSCEE da fatura mais recente de cada UC (posição, não acumulado no tempo)."
            />
            <CartaoIndicador
              titulo="Créditos a expirar"
              icone={CalendarClock}
              valor={formatarKwh(ind.creditosExpirarKwh)}
              detalhe={
                ind.competenciaExpirar
                  ? `primeiro vencimento: ${formatarCompetencia(`${ind.competenciaExpirar}-01`)}`
                  : "sem informação"
              }
            />
            <CartaoIndicador
              titulo="Créditos expirados"
              icone={TriangleAlert}
              valor={formatarKwh(ind.creditosExpiradosKwh)}
              detalhe="perdidos no período"
            />
            <CartaoIndicador
              titulo="Potência instalada"
              icone={Gauge}
              valor={ind.potenciaKw != null ? `${formatarNumero(ind.potenciaKw, 0, 2)} kW` : "—"}
              detalhe="informada no gSCEE"
            />
            <CartaoIndicador
              titulo="Custo sem os créditos (estimado)"
              icone={Zap}
              valor={formatarMoeda(ind.custoSemCreditos)}
              detalhe={`faturado: ${formatarMoedaCompacta(ind.custo)}`}
              ajuda="Custo faturado + valor abatido pelos créditos. Estimativa simples: não considera mudanças de tributos ou bandeira sem a compensação."
            />
          </div>

          {(alertasQ.data?.length ?? 0) > 0 && (
            <Card className="border-warning/40">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <TriangleAlert className="h-4 w-4 text-warning-foreground" /> Alertas de energia
                    solar
                  </div>
                  <Button variant="link" size="sm" asChild>
                    <Link to="/alertas">Analisar alertas</Link>
                  </Button>
                </div>
                <ul className="space-y-1.5">
                  {alertasQ.data!.slice(0, 8).map((a) => (
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
                        {a.unidade_consumidora_id ? nomeUc(a.unidade_consumidora_id) : ""} ·{" "}
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
            <CartaoGrafico
              titulo="Injetada × créditos compensados × consumo"
              descricao="kWh por competência."
              className="lg:col-span-2"
            >
              <GraficoEnergiaGd dados={analise.serie} />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Economia mensal com créditos"
              descricao="R$ abatidos nas faturas."
            >
              <GraficoMensal
                dados={analise.serie}
                campo="economia"
                cor={COR_SOLAR}
                rotulo="Economia"
                formatar={formatarMoedaCompacta}
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Custo faturado × custo estimado sem créditos"
              descricao="A diferença entre as linhas é a economia com a geração distribuída."
            >
              <GraficoCustos dados={analise.serie} />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Saldo de créditos (kWh)"
              descricao="Soma dos saldos informados no mês."
            >
              <GraficoMensal
                dados={analise.serie.map((m) => ({ ...m, saldoKwh: m.saldoKwh ?? 0 }))}
                campo="saldoKwh"
                cor={COR_CONSUMO}
                rotulo="Saldo"
                formatar={kwh}
                formatarEixo={(v) => formatarNumero(v)}
              />
            </CartaoGrafico>
            <CartaoGrafico titulo="Economia por UC" descricao="Clique para abrir a análise da UC.">
              <GraficoBarrasHorizontais
                dados={analise.porUc.map((r) => ({
                  chave: r.ucId,
                  rotulo: nomeUc(r.ucId),
                  valor: r.economia ?? 0,
                  detalhe: `${r.papel}${ucsPorId.get(r.ucId)?.fazenda ? ` · ${ucsPorId.get(r.ucId)?.fazenda}` : ""}`,
                }))}
                cor={COR_SOLAR}
                rotulo="Economia"
                formatar={formatarMoedaCompacta}
                aoClicar={(id) => navigate({ to: "/unidades/$id", params: { id } })}
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Injeção por kWp instalado (kWh/kWp/mês)"
              descricao="Compara o desempenho das UCs geradoras com potência informada. Considera apenas o excedente injetado."
              className="lg:col-span-2"
            >
              <GraficoBarrasHorizontais
                dados={analise.porUc
                  .filter((r) => r.injecaoPorKwpMes != null)
                  .map((r) => ({
                    chave: r.ucId,
                    rotulo: nomeUc(r.ucId),
                    valor: r.injecaoPorKwpMes!,
                    detalhe: `${formatarNumero(r.potenciaKw, 0, 2)} kW`,
                  }))}
                cor={COR_SOLAR}
                rotulo="kWh/kWp/mês"
                formatar={(v) => formatarNumero(v, 1)}
                aoClicar={(id) => navigate({ to: "/unidades/$id", params: { id } })}
              />
            </CartaoGrafico>
          </div>

          <CartaoGrafico
            titulo="Unidades com geração distribuída"
            descricao="Resumo do período por UC."
          >
            <TabelaDados
              dados={analise.porUc}
              colunas={colunas}
              chave={(r) => r.ucId}
              nomeExportacao="energia-solar-por-uc"
              ordenacaoInicial={{ id: "economia", direcao: "desc" }}
              aoClicarLinha={(r) => navigate({ to: "/unidades/$id", params: { id: r.ucId } })}
            />
          </CartaoGrafico>

          <CartaoGrafico titulo="Dados mensais" descricao="Tabela equivalente aos gráficos.">
            <TabelaDados
              dados={analise.serie}
              chave={(m) => m.mes}
              busca={false}
              nomeExportacao="energia-solar-mensal"
              colunas={[
                { id: "mes", titulo: "Mês", valor: (m) => rotuloMes(m.mes) },
                {
                  id: "injetada",
                  titulo: "Injetada (kWh)",
                  tipo: "kwh",
                  valor: (m) => m.injetadaKwh,
                },
                {
                  id: "creditos",
                  titulo: "Créditos (kWh)",
                  tipo: "kwh",
                  valor: (m) => m.creditosKwh,
                },
                { id: "consumo", titulo: "Consumo (kWh)", tipo: "kwh", valor: (m) => m.consumoKwh },
                { id: "economia", titulo: "Economia", tipo: "moeda", valor: (m) => m.economia },
                { id: "custo", titulo: "Custo faturado", tipo: "moeda", valor: (m) => m.custo },
                {
                  id: "semCreditos",
                  titulo: "Custo sem créditos",
                  tipo: "moeda",
                  valor: (m) => m.custoSemCreditos,
                },
                { id: "saldo", titulo: "Saldo (kWh)", tipo: "kwh", valor: (m) => m.saldoKwh },
              ]}
            />
          </CartaoGrafico>
        </>
      )}
    </div>
  );
}

function CaixaTooltip({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: { cor: string; rotulo: string; valor: string }[];
}) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">{titulo}</div>
      {linhas.map((l) => (
        <div key={l.rotulo} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: l.cor }} />
          <span>{l.rotulo}</span>
          <span className="tabular ml-auto pl-3 font-medium text-foreground">{l.valor}</span>
        </div>
      ))}
    </div>
  );
}

const legenda = (v: string) => <span className="text-xs text-muted-foreground">{v}</span>;

function GraficoEnergiaGd({
  dados,
}: {
  dados: { mes: string; injetadaKwh: number; creditosKwh: number; consumoKwh: number }[];
}) {
  if (!dados.some((d) => d.injetadaKwh || d.creditosKwh || d.consumoKwh))
    return <SemDadosGrafico />;
  const series = [
    { campo: "injetadaKwh", rotulo: "Injetada", cor: COR_SOLAR },
    { campo: "creditosKwh", rotulo: "Créditos compensados", cor: COR_CONSUMO },
    { campo: "consumoKwh", rotulo: "Consumo", cor: COR_CUSTO },
  ] as const;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={dados}
        margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
        barGap={2}
        barCategoryGap="22%"
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="mes"
          tickFormatter={rotuloMes}
          tick={eixo}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={eixo}
          axisLine={false}
          tickLine={false}
          width={64}
          tickFormatter={(v: number) => formatarNumero(v)}
        />
        <Legend verticalAlign="top" height={24} iconType="square" formatter={legenda} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <CaixaTooltip
                titulo={rotuloMes(String(label))}
                linhas={series.map((s) => ({
                  cor: s.cor,
                  rotulo: s.rotulo,
                  valor: kwh(Number((payload[0]!.payload as Record<string, number>)[s.campo] ?? 0)),
                }))}
              />
            ) : null
          }
        />
        {series.map((s) => (
          <Bar
            key={s.campo}
            dataKey={s.campo}
            name={s.rotulo}
            fill={s.cor}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function GraficoCustos({
  dados,
}: {
  dados: { mes: string; custo: number; custoSemCreditos: number; economia: number }[];
}) {
  if (!dados.some((d) => d.custo || d.custoSemCreditos)) return <SemDadosGrafico />;
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
          interval="preserveStartEnd"
        />
        <YAxis
          tick={eixo}
          axisLine={false}
          tickLine={false}
          width={64}
          tickFormatter={(v: number) => formatarMoedaCompacta(v)}
        />
        <Legend verticalAlign="top" height={24} iconType="plainline" formatter={legenda} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as (typeof dados)[number];
            return (
              <CaixaTooltip
                titulo={rotuloMes(String(label))}
                linhas={[
                  { cor: COR_CUSTO, rotulo: "Custo faturado", valor: formatarMoeda(p.custo) },
                  {
                    cor: COR_SOLAR,
                    rotulo: "Sem créditos (estimado)",
                    valor: formatarMoeda(p.custoSemCreditos),
                  },
                  { cor: "transparent", rotulo: "Economia", valor: formatarMoeda(p.economia) },
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="custoSemCreditos"
          name="Sem créditos (estimado)"
          stroke={COR_SOLAR}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="custo"
          name="Custo faturado"
          stroke={COR_CUSTO}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
