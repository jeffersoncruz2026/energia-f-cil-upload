// Regras de cálculo e consolidação dos indicadores.
//
// Metodologia (exibida também na interface):
//  - Faturas válidas: não excluídas, não canceladas, não substituídas, associadas a
//    uma UC e com valor total disponível. Documentos de ajuste/complementares
//    compõem o período ao qual se referem.
//  - Custo total: soma do VALOR TOTAL das faturas válidas do período (nunca soma
//    subtotais/componentes junto com o total).
//  - Consumo total: soma do consumo em kWh das faturas válidas com consumo
//    disponível.
//  - Custo médio por UC: custo total ÷ quantidade de UCs com faturas válidas no período.
//  - Custo médio por kWh: soma do valor total ÷ soma do consumo, considerando
//    SOMENTE as faturas com consumo positivo (mesmo conjunto no numerador e no
//    denominador).
//  - Variação percentual: (atual − anterior) ÷ anterior × 100, quando anterior ≠ 0.
//  - Período: por competência (mês de referência da fatura) ou por mês de emissão.

import type { CriterioConsolidacao, Fatura, UnidadeConsumidora } from "../tipos";
import { chaveMes, intervaloMeses, periodoAnterior, variacaoPercentual } from "./periodos";

export type FaturaAnalise = Pick<
  Fatura,
  | "id"
  | "unidade_consumidora_id"
  | "periodo_referencia"
  | "data_emissao"
  | "valor_total"
  | "consumo_kwh"
  | "dias_faturados"
  | "status_documento"
  | "status_processamento"
  | "excluida"
  | "finalidade"
  | "numero_documento"
  | "valor_tusd"
  | "valor_te"
  | "valor_icms"
  | "valor_pis"
  | "valor_cofins"
  | "valor_cip"
  | "valor_bandeira"
  | "valor_demanda"
  | "valor_reativo"
  | "valor_multas"
  | "valor_juros"
  | "valor_encargos"
  | "valor_descontos"
  | "valor_compensacao"
  | "valor_energia"
  | "valor_outros"
  | "energia_injetada_kwh"
  | "energia_compensada_kwh"
  | "demanda_medida_kw"
  | "demanda_contratada_kw"
  | "demanda_faturada_kw"
  | "divergencias"
>;

export type UcAnalise = Pick<
  UnidadeConsumidora,
  "id" | "numero_uc" | "fazenda" | "cnpj" | "filial" | "situacao" | "area"
>;

export interface Filtros {
  inicio: string | null; // AAAA-MM
  fim: string | null; // AAAA-MM
  fazendas: string[];
  ucs: string[];
  filiais: string[];
  areas: string[];
  cnpjs: string[];
  situacao: "todas" | "ativa" | "inativa";
  criterio: CriterioConsolidacao;
}

export const FILTROS_VAZIOS: Filtros = {
  inicio: null,
  fim: null,
  fazendas: [],
  ucs: [],
  filiais: [],
  areas: [],
  cnpjs: [],
  situacao: "todas",
  criterio: "competencia",
};

export function faturaValida(
  f: Pick<
    FaturaAnalise,
    "excluida" | "status_documento" | "unidade_consumidora_id" | "valor_total"
  >,
): boolean {
  return (
    !f.excluida &&
    f.status_documento !== "cancelada" &&
    f.status_documento !== "substituida" &&
    f.unidade_consumidora_id != null &&
    f.valor_total != null
  );
}

export function mesDaFatura(
  f: Pick<FaturaAnalise, "periodo_referencia" | "data_emissao">,
  criterio: CriterioConsolidacao,
): string | null {
  return chaveMes(criterio === "competencia" ? f.periodo_referencia : f.data_emissao);
}

export function ucAtendeFiltros(uc: UcAnalise, filtros: Filtros): boolean {
  if (filtros.situacao !== "todas" && uc.situacao !== filtros.situacao) return false;
  if (filtros.fazendas.length && !filtros.fazendas.includes(uc.fazenda)) return false;
  if (filtros.ucs.length && !filtros.ucs.includes(uc.id)) return false;
  if (filtros.filiais.length && !filtros.filiais.includes(uc.filial ?? "")) return false;
  if (filtros.areas.length && !filtros.areas.includes(uc.area ?? "")) return false;
  if (filtros.cnpjs.length && !filtros.cnpjs.includes(uc.cnpj)) return false;
  return true;
}

export function filtrarFaturas<T extends FaturaAnalise>(
  faturas: T[],
  ucsPorId: Map<string, UcAnalise>,
  filtros: Filtros,
  intervalo: { inicio: string | null; fim: string | null } = filtros,
): T[] {
  return faturas.filter((f) => {
    if (!faturaValida(f)) return false;
    const uc = ucsPorId.get(f.unidade_consumidora_id!);
    if (!uc || !ucAtendeFiltros(uc, filtros)) return false;
    const mes = mesDaFatura(f, filtros.criterio);
    if (intervalo.inicio || intervalo.fim) {
      if (!mes) return false;
      if (intervalo.inicio && mes < intervalo.inicio) return false;
      if (intervalo.fim && mes > intervalo.fim) return false;
    }
    return true;
  });
}

export interface Totais {
  custoTotal: number;
  consumoTotal: number;
  quantidadeFaturas: number;
  faturasComConsumo: number;
  ucsComFaturas: number;
  custoMedioUc: number | null;
  custoKwh: number | null;
  custoBaseKwh: number;
  consumoBaseKwh: number;
}

export function calcularTotais(faturas: FaturaAnalise[]): Totais {
  let custoTotal = 0;
  let consumoTotal = 0;
  let custoBase = 0;
  let consumoBase = 0;
  let comConsumo = 0;
  const ucs = new Set<string>();
  for (const f of faturas) {
    custoTotal += f.valor_total ?? 0;
    if (f.consumo_kwh != null) consumoTotal += f.consumo_kwh;
    if (f.consumo_kwh != null && f.consumo_kwh > 0 && f.valor_total != null) {
      custoBase += f.valor_total;
      consumoBase += f.consumo_kwh;
      comConsumo++;
    }
    if (f.unidade_consumidora_id) ucs.add(f.unidade_consumidora_id);
  }
  return {
    custoTotal: arred2(custoTotal),
    consumoTotal: arred3(consumoTotal),
    quantidadeFaturas: faturas.length,
    faturasComConsumo: comConsumo,
    ucsComFaturas: ucs.size,
    custoMedioUc: ucs.size ? custoTotal / ucs.size : null,
    custoKwh: consumoBase > 0 ? custoBase / consumoBase : null,
    custoBaseKwh: arred2(custoBase),
    consumoBaseKwh: arred3(consumoBase),
  };
}

function arred2(v: number) {
  return Math.round(v * 100) / 100;
}
function arred3(v: number) {
  return Math.round(v * 1000) / 1000;
}

export interface Indicadores extends Totais {
  ucsAtivas: number;
  variacaoCusto: number | null;
  variacaoConsumo: number | null;
  anterior: Totais | null;
  intervalo: { inicio: string; fim: string } | null;
  intervaloAnterior: { inicio: string; fim: string } | null;
}

/** Período padrão: últimos 12 meses até o último mês com dados. */
export function intervaloPadrao(
  faturas: FaturaAnalise[],
  criterio: CriterioConsolidacao,
): { inicio: string; fim: string } | null {
  let max: string | null = null;
  let min: string | null = null;
  for (const f of faturas) {
    if (!faturaValida(f)) continue;
    const m = mesDaFatura(f, criterio);
    if (m && (!max || m > max)) max = m;
    if (m && (!min || m < min)) min = m;
  }
  if (!max || !min) return null;
  const [a, mm] = max.split("-").map(Number) as [number, number];
  const total = a * 12 + mm - 1 - 11;
  const inicio12 = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  return { inicio: min > inicio12 ? min : inicio12, fim: max };
}

export function calcularIndicadores(
  faturas: FaturaAnalise[],
  ucs: UcAnalise[],
  filtros: Filtros,
): Indicadores {
  const ucsPorId = new Map(ucs.map((u) => [u.id, u]));
  const atuais = filtrarFaturas(faturas, ucsPorId, filtros);
  const totais = calcularTotais(atuais);
  const intervalo =
    filtros.inicio && filtros.fim ? { inicio: filtros.inicio, fim: filtros.fim } : null;
  let anterior: Totais | null = null;
  let intervaloAnt: { inicio: string; fim: string } | null = null;
  if (intervalo) {
    intervaloAnt = periodoAnterior(intervalo.inicio, intervalo.fim);
    const anteriores = filtrarFaturas(faturas, ucsPorId, filtros, intervaloAnt);
    anterior = anteriores.length ? calcularTotais(anteriores) : null;
  }
  const ucsAtivas = ucs.filter((u) => u.situacao === "ativa" && ucAtendeFiltros(u, filtros)).length;
  return {
    ...totais,
    ucsAtivas,
    variacaoCusto: anterior ? variacaoPercentual(totais.custoTotal, anterior.custoTotal) : null,
    variacaoConsumo: anterior
      ? variacaoPercentual(totais.consumoTotal, anterior.consumoTotal)
      : null,
    anterior,
    intervalo,
    intervaloAnterior: intervaloAnt,
  };
}

export interface PontoMensal {
  mes: string;
  custo: number;
  consumo: number;
  custoKwh: number | null;
  faturas: number;
  ucs: number;
}

export function serieMensal(
  faturas: FaturaAnalise[],
  criterio: CriterioConsolidacao,
  intervalo?: { inicio: string; fim: string } | null,
): PontoMensal[] {
  const grupos = new Map<string, FaturaAnalise[]>();
  for (const f of faturas) {
    const m = mesDaFatura(f, criterio);
    if (!m) continue;
    const g = grupos.get(m);
    if (g) g.push(f);
    else grupos.set(m, [f]);
  }
  let meses = [...grupos.keys()].sort();
  if (intervalo) meses = intervaloMeses(intervalo.inicio, intervalo.fim);
  else if (meses.length) meses = intervaloMeses(meses[0]!, meses[meses.length - 1]!);
  return meses.map((mes) => {
    const t = calcularTotais(grupos.get(mes) ?? []);
    return {
      mes,
      custo: t.custoTotal,
      consumo: t.consumoTotal,
      custoKwh: t.custoKwh,
      faturas: t.quantidadeFaturas,
      ucs: t.ucsComFaturas,
    };
  });
}

export interface Agrupado {
  chave: string;
  rotulo: string;
  custo: number;
  consumo: number;
  custoKwh: number | null;
  faturas: number;
  ucs: number;
}

export function agruparPor(
  faturas: FaturaAnalise[],
  ucsPorId: Map<string, UcAnalise>,
  chave: (uc: UcAnalise) => { chave: string; rotulo: string },
): Agrupado[] {
  const grupos = new Map<string, { rotulo: string; faturas: FaturaAnalise[] }>();
  for (const f of faturas) {
    const uc = f.unidade_consumidora_id ? ucsPorId.get(f.unidade_consumidora_id) : undefined;
    if (!uc) continue;
    const k = chave(uc);
    const g = grupos.get(k.chave);
    if (g) g.faturas.push(f);
    else grupos.set(k.chave, { rotulo: k.rotulo, faturas: [f] });
  }
  return [...grupos.entries()]
    .map(([k, g]) => {
      const t = calcularTotais(g.faturas);
      return {
        chave: k,
        rotulo: g.rotulo,
        custo: t.custoTotal,
        consumo: t.consumoTotal,
        custoKwh: t.custoKwh,
        faturas: t.quantidadeFaturas,
        ucs: t.ucsComFaturas,
      };
    })
    .sort((a, b) => b.custo - a.custo);
}

/** Composição dos valores faturados (componentes discriminados nos documentos). */
export const COMPONENTES: { campo: keyof FaturaAnalise; rotulo: string }[] = [
  { campo: "valor_tusd", rotulo: "TUSD (consumo)" },
  { campo: "valor_te", rotulo: "TE (consumo)" },
  { campo: "valor_demanda", rotulo: "Demanda" },
  { campo: "valor_reativo", rotulo: "Reativo" },
  { campo: "valor_bandeira", rotulo: "Bandeira tarifária" },
  { campo: "valor_cip", rotulo: "CIP/COSIP" },
  { campo: "valor_multas", rotulo: "Multas" },
  { campo: "valor_juros", rotulo: "Juros" },
  { campo: "valor_encargos", rotulo: "Encargos" },
  { campo: "valor_compensacao", rotulo: "Compensação (GD)" },
  { campo: "valor_outros", rotulo: "Outros" },
];

export const TRIBUTOS: { campo: keyof FaturaAnalise; rotulo: string }[] = [
  { campo: "valor_icms", rotulo: "ICMS" },
  { campo: "valor_pis", rotulo: "PIS" },
  { campo: "valor_cofins", rotulo: "COFINS" },
];

export function somarCampo(faturas: FaturaAnalise[], campo: keyof FaturaAnalise): number | null {
  let soma = 0;
  let algum = false;
  for (const f of faturas) {
    const v = f[campo];
    if (typeof v === "number") {
      soma += v;
      algum = true;
    }
  }
  return algum ? arred2(soma) : null;
}
