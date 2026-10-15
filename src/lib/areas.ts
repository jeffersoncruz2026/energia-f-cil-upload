// Área da unidade consumidora (Agrícola, Pecuária, Seringal…). A grafia é
// padronizada pela lista configurada ou pelas áreas já cadastradas, espelhando
// as funções SQL public.chave_texto e public.area_canonica.

import type { SituacaoUc } from "./tipos";

export const SEM_AREA = "";

export function chaveTexto(t: string | null | undefined): string | null {
  const s = (t ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  return s || null;
}

export function canonizarArea(
  area: string | null | undefined,
  areasConfiguradas: string[],
  areasExistentes: (string | null)[] = [],
): string | null {
  const chave = chaveTexto(area);
  if (!chave) return null;
  const encontrada =
    areasConfiguradas.find((a) => chaveTexto(a) === chave) ??
    areasExistentes.find((a) => a && chaveTexto(a) === chave);
  return encontrada ?? area!.trim().replace(/\s+/g, " ");
}

/** Lista de áreas para sugestão: configuradas + já usadas, sem repetição. */
export function listaAreas(
  areasConfiguradas: string[],
  areasExistentes: (string | null)[],
): string[] {
  const vistas = new Set<string>();
  const lista: string[] = [];
  for (const a of [...areasConfiguradas, ...areasExistentes]) {
    const k = chaveTexto(a);
    if (!a || !k || vistas.has(k)) continue;
    vistas.add(k);
    lista.push(a);
  }
  return lista;
}

/** Situação em texto (planilha): ativa/ativo/inativa/inativo. undefined = inválida. */
export function interpretarSituacao(t: string | null | undefined): SituacaoUc | null | undefined {
  const k = chaveTexto(t);
  if (!k) return null;
  if (["ativa", "ativo", "a", "sim", "s"].includes(k)) return "ativa";
  if (["inativa", "inativo", "i", "nao", "n"].includes(k)) return "inativa";
  return undefined;
}
