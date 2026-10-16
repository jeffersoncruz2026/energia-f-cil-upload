// Grupo BC: energia injetada por terceiros. Automático: entram as linhas
// "INJEÇÃO SCEE – UC <geradora>" cuja geradora NÃO é UC cadastrada no sistema
// (usina de terceiro); injeções de UCs cadastradas (energia própria) ficam de
// fora. Exceções manuais (incluir/excluir) na guia Grupo BC.
//
//   Valor Grupo BC = kWh injetados × tarifa do CONSUMO NÃO COMPENSADO × 0,80
//   Desconto       = kWh injetados × (tarifa CONSUMO NÃO COMPENSADO + tarifa ADC
//                    BANDEIRA) − Valor Grupo BC
//   Custo cheio    = Valor Grupo BC + Desconto  (é o que soma ao custo da energia)
//
// - kWh injetados: quantidade das linhas "INJEÇÃO SCEE" (somadas). A Equatorial
//   repete a mesma energia em linhas de TE e TUSD; por isso, em cada posto
//   tarifário e UC geradora conta-se a maior quantidade uma única vez.
// - Tarifa: preço unitário com tributos (vItem) da linha "CONSUMO NÃO COMPENSADO"
//   (tarifa sem bandeira). Com mais de uma linha (TE/TUSD), soma dos valores ÷ kWh.
// - 0,80: desconto de 20% sobre a tarifa.
// - Só o resultado final é arredondado (2 casas). Sem INJEÇÃO SCEE → 0.
//
// - Bandeira: preço unitário com tributos da linha "ADC BANDEIRA"; sem linha = 0.
// O custo cheio soma ao custo da energia; valor, desconto e custo cheio também
// são exibidos à parte.

import { identificarPosto, normalizarTexto } from "../xml/classificacao-itens";

export const FATOR_GRUPO_BC = 0.8;

export interface ItemGrupoBc {
  fatura_id: string;
  descricao: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  posto_tarifario: string | null;
}

export type SituacaoGrupoBc = "calculado" | "sem_injecao" | "tarifa_indisponivel";

export interface ResultadoGrupoBc {
  kwhInjetados: number;
  /** Tarifa do CONSUMO NÃO COMPENSADO (R$/kWh, com tributos). */
  tarifa: number | null;
  /** Tarifa do ADC BANDEIRA (R$/kWh, com tributos); 0 sem bandeira. */
  tarifaBandeira: number;
  /** Valor Grupo BC = kWh × tarifa × 0,80 (2 casas); null sem tarifa na fatura. */
  valor: number | null;
  /** Desconto = kWh × (tarifa + bandeira) − Valor Grupo BC. */
  desconto: number | null;
  /** Custo cheio = Valor Grupo BC + Desconto (soma ao custo da energia). */
  custoCheio: number | null;
  situacao: SituacaoGrupoBc;
}

export const ROTULOS_SITUACAO_GRUPO_BC: Record<SituacaoGrupoBc, string> = {
  calculado: "Calculado",
  sem_injecao: "Sem injeção SCEE",
  tarifa_indisponivel: "Tarifa do consumo não compensado indisponível",
};

const ehInjecaoScee = (d: string) => /\bINJECAO SCEE\b/.test(d);
const ehConsumoNaoCompensado = (d: string) => /\bCONSUMO NAO COMPENSADO\b/.test(d);
const ehBandeira = (d: string) => /\bAD(C|IC|ICIONAL)\.? ?(DE )?BANDEIRA\b/.test(d);

/** Filtros (ilike) para buscar no banco só as linhas usadas no cálculo. */
export const FILTRO_ITENS_GRUPO_BC =
  "descricao.ilike.*INJE*SCEE*,descricao.ilike.*CONSUMO N*O COMPENSADO*,descricao.ilike.*BANDEIRA*";

/** Posto pelas siglas da Equatorial ("INJEÇÃO SCEE FP", "… HR …", "… P …"). */
function postoDaDescricao(d: string): string | null {
  if (/\bFORA (DE )?PONTA\b|\bFP\b/.test(d)) return "FP";
  if (/\bRESERVAD|\bHR\b/.test(d)) return "HR";
  if (/\bINTERMED|\bINT\b/.test(d)) return "INT";
  if (/\bPONTA\b|\bP\b|\bHP\b/.test(d)) return "P";
  return null;
}

/** kWh sem repetir a mesma energia lançada em várias linhas (TE/TUSD). */
function kwhSemRepetir(itens: ItemGrupoBc[]): number {
  const grupos = new Map<string, number>();
  for (const i of itens) {
    if (i.quantidade == null) continue;
    const d = normalizarTexto(i.descricao);
    const posto =
      postoDaDescricao(d) ?? i.posto_tarifario ?? identificarPosto(null, i.descricao) ?? "";
    const geradora = d.match(/\bUC\s*(\d+)/)?.[1] ?? "";
    const chave = `${posto}|${geradora}`;
    grupos.set(chave, Math.max(grupos.get(chave) ?? 0, Math.abs(i.quantidade)));
  }
  let total = 0;
  for (const v of grupos.values()) total += v;
  return total;
}

/** Número da UC só com dígitos e sem zeros à esquerda (000405731001244 = 405731001244). */
export function normalizarNumeroUc(t: string | null | undefined): string {
  return (t ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

/** UC geradora citada na linha de injeção ("INJEÇÃO SCEE - UC 000405731001244 - GD I"). */
export function geradoraDaLinha(descricao: string | null | undefined): string | null {
  const n = normalizarTexto(descricao).match(/\bUC\s*:?\s*(\d+)/)?.[1];
  return n ? normalizarNumeroUc(n) || null : null;
}

/** Linhas de injeção das usinas do Grupo BC (sem cadastro informado, todas). */
function injecoesGrupoBc(itens: ItemGrupoBc[], geradoras?: Set<string>): ItemGrupoBc[] {
  return itens.filter((i) => {
    if (!ehInjecaoScee(normalizarTexto(i.descricao))) return false;
    if (!geradoras) return true;
    const g = geradoraDaLinha(i.descricao);
    return g != null && geradoras.has(g);
  });
}

export function calcularGrupoBc(itens: ItemGrupoBc[], geradoras?: Set<string>): ResultadoGrupoBc {
  const injecao = injecoesGrupoBc(itens, geradoras);
  const kwhInjetados = Math.round(kwhSemRepetir(injecao) * 1000) / 1000;
  const consumoNc = itens.filter((i) => ehConsumoNaoCompensado(normalizarTexto(i.descricao)));

  let tarifa: number | null = null;
  if (consumoNc.length === 1) {
    const i = consumoNc[0]!;
    tarifa =
      i.valor_unitario ??
      (i.valor_total != null && i.quantidade ? Math.abs(i.valor_total / i.quantidade) : null);
  } else if (consumoNc.length > 1) {
    const kwh = kwhSemRepetir(consumoNc);
    const valor = consumoNc.reduce((s, i) => s + Math.abs(i.valor_total ?? 0), 0);
    tarifa = kwh > 0 ? valor / kwh : null;
  }

  // Bandeira: uma linha → vItem; várias (bandeiras diferentes no mês) → média ponderada.
  const bandeira = itens.filter((i) => ehBandeira(normalizarTexto(i.descricao)));
  let tarifaBandeira = 0;
  if (bandeira.length === 1) {
    const i = bandeira[0]!;
    tarifaBandeira =
      i.valor_unitario ??
      (i.valor_total != null && i.quantidade ? Math.abs(i.valor_total / i.quantidade) : 0);
  } else if (bandeira.length > 1) {
    const kwh = bandeira.reduce((s, i) => s + Math.abs(i.quantidade ?? 0), 0);
    const valor = bandeira.reduce((s, i) => s + Math.abs(i.valor_total ?? 0), 0);
    tarifaBandeira = kwh > 0 ? valor / kwh : 0;
  }

  if (!injecao.length || kwhInjetados === 0) {
    return {
      kwhInjetados: 0,
      tarifa,
      tarifaBandeira,
      valor: 0,
      desconto: 0,
      custoCheio: 0,
      situacao: "sem_injecao",
    };
  }
  if (tarifa == null) {
    return {
      kwhInjetados,
      tarifa: null,
      tarifaBandeira,
      valor: null,
      desconto: null,
      custoCheio: null,
      situacao: "tarifa_indisponivel",
    };
  }
  const arred2 = (v: number) => Math.round(v * 100) / 100;
  const valor = arred2(kwhInjetados * tarifa * FATOR_GRUPO_BC);
  const desconto = arred2(kwhInjetados * (tarifa + tarifaBandeira) - valor);
  const custoCheio = arred2(valor + desconto);
  return {
    kwhInjetados,
    tarifa,
    tarifaBandeira,
    valor,
    desconto,
    custoCheio,
    situacao: "calculado",
  };
}

function agruparPorFatura(itens: ItemGrupoBc[]): Map<string, ItemGrupoBc[]> {
  const porFatura = new Map<string, ItemGrupoBc[]>();
  for (const i of itens) {
    const l = porFatura.get(i.fatura_id);
    if (l) l.push(i);
    else porFatura.set(i.fatura_id, [i]);
  }
  return porFatura;
}

/** IDs das faturas que têm injeção de alguma usina do Grupo BC. */
export function faturasComInjecaoGrupoBc(itens: ItemGrupoBc[], geradoras: Set<string>): string[] {
  return [...new Set(injecoesGrupoBc(itens, geradoras).map((i) => i.fatura_id))];
}

/** Resultado por fatura, apenas para as faturas com injeção de usina do Grupo BC. */
export function calcularGrupoBcPorFatura(
  itens: ItemGrupoBc[],
  geradoras: Set<string>,
): Map<string, ResultadoGrupoBc> {
  const resultado = new Map<string, ResultadoGrupoBc>();
  for (const [id, lista] of agruparPorFatura(itens)) {
    if (!injecoesGrupoBc(lista, geradoras).length) continue;
    resultado.set(id, calcularGrupoBc(lista, geradoras));
  }
  return resultado;
}

/**
 * Preenche os campos do Grupo BC nas faturas com resultado (injeção de usina do
 * Grupo BC). As demais ficam sem valor (não somam nada ao custo).
 */
export function aplicarGrupoBc<T extends { id: string }>(
  faturas: T[],
  resultados: Map<string, ResultadoGrupoBc>,
): (T & CamposGrupoBc)[] {
  return faturas.map((f) => {
    const r = resultados.get(f.id);
    return {
      ...f,
      valor_grupo_bc: r ? r.valor : null,
      desconto_grupo_bc: r ? r.desconto : null,
      custo_cheio_grupo_bc: r ? r.custoCheio : null,
      kwh_grupo_bc: r ? r.kwhInjetados : null,
    };
  });
}

export interface GeradoraEncontrada {
  numero: string;
  /** Número como aparece na fatura (com zeros à esquerda). */
  numeroOriginal: string;
  kwhInjetados: number;
  faturas: number;
  faturaIds: string[];
}

/** Usinas (UCs geradoras) citadas nas linhas "INJEÇÃO SCEE", para o cadastro. */
export function geradorasEncontradas(itens: ItemGrupoBc[]): GeradoraEncontrada[] {
  const mapa = new Map<string, { original: string; porFatura: Map<string, ItemGrupoBc[]> }>();
  for (const i of injecoesGrupoBc(itens)) {
    const original = normalizarTexto(i.descricao).match(/\bUC\s*:?\s*(\d+)/)?.[1];
    const g = geradoraDaLinha(i.descricao);
    if (!g || !original) continue;
    const e = mapa.get(g) ?? { original, porFatura: new Map() };
    const l = e.porFatura.get(i.fatura_id);
    if (l) l.push(i);
    else e.porFatura.set(i.fatura_id, [i]);
    mapa.set(g, e);
  }
  return [...mapa.entries()]
    .map(([numero, e]) => ({
      numero,
      numeroOriginal: e.original,
      kwhInjetados:
        Math.round([...e.porFatura.values()].reduce((s, l) => s + kwhSemRepetir(l), 0) * 1000) /
        1000,
      faturas: e.porFatura.size,
      faturaIds: [...e.porFatura.keys()],
    }))
    .sort((a, b) => b.kwhInjetados - a.kwhInjetados);
}

/** Campos do Grupo BC acrescentados às faturas das UCs do grupo. */
/**
 * Regra para saber se uma usina é do Grupo BC (energia de terceiros):
 * automática — usina que NÃO é UC cadastrada no sistema é terceiro (Grupo BC);
 * UC cadastrada é energia própria. Exceções manuais: incluir / excluir.
 */
export interface RegraGrupoBc {
  /** UCs cadastradas no sistema (normalizadas). */
  proprias: Set<string>;
  /** Usinas forçadas no Grupo BC (normalizadas). */
  incluir: Set<string>;
  /** Usinas forçadas fora do Grupo BC (normalizadas). */
  excluir: Set<string>;
}

/**
 * Monta a regra a partir dos números das UCs cadastradas e da configuração
 * grupo_bc. Só valem as exceções "incluir"/"excluir"; o cadastro manual antigo
 * ("geradoras", anterior à regra automática) é ignorado — terceiros já entram
 * automaticamente e esse cadastro podia forçar UCs próprias no Grupo BC.
 */
export function regraGrupoBc(numerosUc: Iterable<string>, valorConfig: unknown): RegraGrupoBc {
  const lista = (chave: string) => {
    const l = (valorConfig as Record<string, unknown> | null)?.[chave];
    return new Set(
      (Array.isArray(l) ? l : []).map((g) => normalizarNumeroUc(String(g))).filter(Boolean),
    );
  };
  return {
    proprias: new Set([...numerosUc].map(normalizarNumeroUc).filter(Boolean)),
    incluir: lista("incluir"),
    excluir: lista("excluir"),
  };
}

export type MotivoUsina = "terceiro" | "propria" | "incluida_manual" | "excluida_manual";

export function classificarUsina(
  numero: string,
  regra: RegraGrupoBc,
): { grupoBc: boolean; motivo: MotivoUsina; automatico: boolean } {
  const n = normalizarNumeroUc(numero);
  const automatico = !regra.proprias.has(n);
  if (regra.incluir.has(n)) return { grupoBc: true, motivo: "incluida_manual", automatico };
  if (regra.excluir.has(n)) return { grupoBc: false, motivo: "excluida_manual", automatico };
  return { grupoBc: automatico, motivo: automatico ? "terceiro" : "propria", automatico };
}

export function ehUsinaGrupoBc(numero: string, regra: RegraGrupoBc): boolean {
  return classificarUsina(numero, regra).grupoBc;
}

/** Usinas do Grupo BC entre as geradoras citadas nas linhas de injeção. */
export function usinasGrupoBc(itens: ItemGrupoBc[], regra: RegraGrupoBc): Set<string> {
  const resultado = new Set<string>();
  for (const i of injecoesGrupoBc(itens)) {
    const g = geradoraDaLinha(i.descricao);
    if (g && ehUsinaGrupoBc(g, regra)) resultado.add(g);
  }
  for (const g of regra.incluir) resultado.add(g);
  return resultado;
}

export interface CamposGrupoBc {
  valor_grupo_bc: number | null;
  desconto_grupo_bc: number | null;
  custo_cheio_grupo_bc: number | null;
  kwh_grupo_bc: number | null;
}
