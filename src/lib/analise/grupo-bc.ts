// Grupo BC: energia injetada por terceiros nas UCs cadastradas como Grupo BC.
//
//   Valor Grupo BC = kWh injetados × tarifa do CONSUMO NÃO COMPENSADO × 0,80
//
// - kWh injetados: quantidade das linhas "INJEÇÃO SCEE" (somadas). A Equatorial
//   repete a mesma energia em linhas de TE e TUSD; por isso, em cada posto
//   tarifário e UC geradora conta-se a maior quantidade uma única vez.
// - Tarifa: preço unitário com tributos (vItem) da linha "CONSUMO NÃO COMPENSADO"
//   (tarifa sem bandeira). Com mais de uma linha (TE/TUSD), soma dos valores ÷ kWh.
// - 0,80: desconto de 20% sobre a tarifa.
// - Só o resultado final é arredondado (2 casas). Sem INJEÇÃO SCEE → 0.
//
// O valor soma ao custo da energia e também é exibido à parte ("Grupo BC").

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
  tarifa: number | null;
  /** R$ (2 casas); null quando há injeção mas a tarifa não está na fatura. */
  valor: number | null;
  situacao: SituacaoGrupoBc;
}

export const ROTULOS_SITUACAO_GRUPO_BC: Record<SituacaoGrupoBc, string> = {
  calculado: "Calculado",
  sem_injecao: "Sem injeção SCEE",
  tarifa_indisponivel: "Tarifa do consumo não compensado indisponível",
};

const ehInjecaoScee = (d: string) => /\bINJECAO SCEE\b/.test(d);
const ehConsumoNaoCompensado = (d: string) => /\bCONSUMO NAO COMPENSADO\b/.test(d);

/** Filtros (ilike) para buscar no banco só as linhas usadas no cálculo. */
export const FILTRO_ITENS_GRUPO_BC =
  "descricao.ilike.*INJE*SCEE*,descricao.ilike.*CONSUMO N*O COMPENSADO*";

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

export function calcularGrupoBc(itens: ItemGrupoBc[]): ResultadoGrupoBc {
  const injecao = itens.filter((i) => ehInjecaoScee(normalizarTexto(i.descricao)));
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

  if (!injecao.length || kwhInjetados === 0) {
    return { kwhInjetados: 0, tarifa, valor: 0, situacao: "sem_injecao" };
  }
  if (tarifa == null) {
    return { kwhInjetados, tarifa: null, valor: null, situacao: "tarifa_indisponivel" };
  }
  const valor = Math.round(kwhInjetados * tarifa * FATOR_GRUPO_BC * 100) / 100;
  return { kwhInjetados, tarifa, valor, situacao: "calculado" };
}

/** Resultado por fatura, apenas para as faturas das UCs do Grupo BC. */
export function calcularGrupoBcPorFatura(
  faturaIds: Iterable<string>,
  itens: ItemGrupoBc[],
): Map<string, ResultadoGrupoBc> {
  const porFatura = new Map<string, ItemGrupoBc[]>();
  for (const i of itens) {
    const l = porFatura.get(i.fatura_id);
    if (l) l.push(i);
    else porFatura.set(i.fatura_id, [i]);
  }
  const resultado = new Map<string, ResultadoGrupoBc>();
  for (const id of faturaIds) resultado.set(id, calcularGrupoBc(porFatura.get(id) ?? []));
  return resultado;
}

/**
 * Preenche `valor_grupo_bc` (e o kWh injetado) nas faturas das UCs do Grupo BC.
 * Faturas de outras UCs ficam sem valor (não somam nada ao custo).
 */
export function aplicarGrupoBc<T extends { id: string; unidade_consumidora_id: string | null }>(
  faturas: T[],
  ucsGrupoBc: Set<string>,
  resultados: Map<string, ResultadoGrupoBc>,
): (T & { valor_grupo_bc: number | null; kwh_grupo_bc: number | null })[] {
  return faturas.map((f) => {
    const r =
      f.unidade_consumidora_id && ucsGrupoBc.has(f.unidade_consumidora_id)
        ? resultados.get(f.id)
        : undefined;
    return { ...f, valor_grupo_bc: r ? r.valor : null, kwh_grupo_bc: r ? r.kwhInjetados : null };
  });
}
