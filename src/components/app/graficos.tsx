// Gráficos (Recharts) com marcas finas, eixo único, grade discreta e tooltip.
// Cores: --chart-1 (custo) e --chart-2 (consumo), paleta validada para daltonismo.

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarMoedaCompacta, formatarNumero, rotuloMes } from "@/lib/formatacao";

export const COR_CUSTO = "var(--chart-1)";
export const COR_CONSUMO = "var(--chart-2)";

const eixo = { fontSize: 11, fill: "var(--muted-foreground)" };

export function CartaoGrafico({
  titulo,
  descricao,
  acoes,
  children,
  className,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-4 pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">{titulo}</CardTitle>
          {descricao && <CardDescription className="mt-1 text-xs">{descricao}</CardDescription>}
        </div>
        {acoes}
      </CardHeader>
      <CardContent className="p-4 pt-2">{children}</CardContent>
    </Card>
  );
}

function CaixaTooltip({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: { cor?: string; rotulo: string; valor: string }[];
}) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">{titulo}</div>
      {linhas.map((l) => (
        <div key={l.rotulo} className="flex items-center gap-2 text-muted-foreground">
          {l.cor && <span className="h-2 w-2 rounded-sm" style={{ background: l.cor }} />}
          <span>{l.rotulo}</span>
          <span className="tabular ml-auto pl-3 font-medium text-foreground">{l.valor}</span>
        </div>
      ))}
    </div>
  );
}

export function SemDadosGrafico({ altura = 240 }: { altura?: number }) {
  return (
    <div
      className="flex items-center justify-center text-xs text-muted-foreground"
      style={{ height: altura }}
    >
      Sem dados no período selecionado.
    </div>
  );
}

/** Barras mensais de uma medida (custo ou consumo). Clique em uma barra abre o detalhamento. */
export function GraficoMensal({
  dados,
  campo,
  cor,
  formatar,
  formatarEixo = formatar,
  rotulo,
  aoClicarMes,
  altura = 240,
}: {
  dados: object[];
  campo: string;
  cor: string;
  formatar: (v: number) => string;
  formatarEixo?: (v: number) => string;
  rotulo: string;
  aoClicarMes?: (mes: string) => void;
  altura?: number;
}) {
  if (!dados.some((d) => Number((d as Record<string, unknown>)[campo] ?? 0) !== 0))
    return <SemDadosGrafico altura={altura} />;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
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
          tickFormatter={(v: number) => formatarEixo(v)}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <CaixaTooltip
                titulo={rotuloMes(String(label))}
                linhas={[{ cor, rotulo, valor: formatar(Number(payload[0]!.value)) }]}
              />
            ) : null
          }
        />
        <Bar
          dataKey={campo}
          fill={cor}
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          className={aoClicarMes ? "cursor-pointer" : ""}
          onClick={(d: { payload?: { mes?: string } }) =>
            d.payload?.mes && aoClicarMes?.(d.payload.mes)
          }
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Custo × consumo no tempo, indexados (primeiro mês com dados = 100) em um único eixo,
 * evitando o gráfico de dois eixos.
 */
export function GraficoIndexado({
  dados,
  altura = 240,
}: {
  dados: { mes: string; custo: number; consumo: number }[];
  altura?: number;
}) {
  const base = dados.find((d) => d.custo > 0 && d.consumo > 0);
  if (!base) return <SemDadosGrafico altura={altura} />;
  const serie = dados.map((d) => ({
    mes: d.mes,
    custo: d.custo > 0 ? (d.custo / base.custo) * 100 : null,
    consumo: d.consumo > 0 ? (d.consumo / base.consumo) * 100 : null,
    custoAbs: d.custo,
    consumoAbs: d.consumo,
  }));
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          width={40}
          tickFormatter={(v: number) => formatarNumero(v)}
        />
        <Legend
          verticalAlign="top"
          height={24}
          iconType="plainline"
          formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as (typeof serie)[number];
            return (
              <CaixaTooltip
                titulo={rotuloMes(String(label))}
                linhas={[
                  {
                    cor: COR_CUSTO,
                    rotulo: "Custo",
                    valor: `${formatarMoedaCompacta(p.custoAbs)} (índice ${formatarNumero(p.custo, 0)})`,
                  },
                  {
                    cor: COR_CONSUMO,
                    rotulo: "Consumo",
                    valor: `${formatarNumero(p.consumoAbs)} kWh (índice ${formatarNumero(p.consumo, 0)})`,
                  },
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="custo"
          name="Custo (índice)"
          stroke={COR_CUSTO}
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="consumo"
          name="Consumo (índice)"
          stroke={COR_CONSUMO}
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais (comparativos e rankings). */
export function GraficoBarrasHorizontais({
  dados,
  cor,
  formatar,
  rotulo,
  aoClicar,
  mostrarPercentual = false,
  limite = 10,
}: {
  dados: { chave: string; rotulo: string; valor: number; detalhe?: string }[];
  cor: string;
  formatar: (v: number) => string;
  rotulo: string;
  aoClicar?: (chave: string) => void;
  mostrarPercentual?: boolean;
  limite?: number;
}) {
  const ordenados = [...dados].filter((d) => d.valor !== 0).sort((a, b) => b.valor - a.valor);
  let itens = ordenados.slice(0, limite);
  if (ordenados.length > limite) {
    const resto = ordenados.slice(limite).reduce((s, d) => s + d.valor, 0);
    itens = [
      ...itens,
      { chave: "__outros", rotulo: `Outros (${ordenados.length - limite})`, valor: resto },
    ];
  }
  if (!itens.length) return <SemDadosGrafico />;
  const total = ordenados.reduce((s, d) => s + d.valor, 0);
  const altura = Math.max(120, itens.length * 30 + 16);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart
        data={itens}
        layout="vertical"
        margin={{ top: 0, right: 72, left: 0, bottom: 0 }}
        barCategoryGap={6}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="rotulo"
          width={150}
          tick={{ ...eixo, fill: "var(--foreground)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as (typeof itens)[number];
            return (
              <CaixaTooltip
                titulo={p.rotulo}
                linhas={[
                  { cor, rotulo, valor: formatar(p.valor) },
                  ...(total
                    ? [
                        {
                          rotulo: "Participação",
                          valor: `${formatarNumero((p.valor / total) * 100, 1)}%`,
                        },
                      ]
                    : []),
                  ...(p.detalhe ? [{ rotulo: "Detalhe", valor: p.detalhe }] : []),
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="valor"
          radius={[0, 4, 4, 0]}
          maxBarSize={22}
          label={{
            position: "right",
            fontSize: 11,
            fill: "var(--muted-foreground)",
            formatter: (v: number) =>
              mostrarPercentual && total ? `${formatarNumero((v / total) * 100, 1)}%` : formatar(v),
          }}
          className={aoClicar ? "cursor-pointer" : ""}
          onClick={(d: { payload?: { chave?: string } }) =>
            d.payload?.chave && d.payload.chave !== "__outros" && aoClicar?.(d.payload.chave)
          }
        >
          {itens.map((i) => (
            <Cell key={i.chave} fill={i.chave === "__outros" ? "var(--muted-foreground)" : cor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
