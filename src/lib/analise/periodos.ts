// Utilitários de períodos mensais no formato "AAAA-MM".

export function chaveMes(data: string | null | undefined): string | null {
  if (!data) return null;
  const m = /^(\d{4})-(\d{2})/.exec(data);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function somarMeses(chave: string, n: number): string {
  const [a, m] = chave.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function diferencaMeses(de: string, ate: string): number {
  const [a1, m1] = de.split("-").map(Number) as [number, number];
  const [a2, m2] = ate.split("-").map(Number) as [number, number];
  return a2 * 12 + m2 - (a1 * 12 + m1);
}

/** Lista de meses de "inicio" até "fim" (inclusive). */
export function intervaloMeses(inicio: string, fim: string): string[] {
  const n = diferencaMeses(inicio, fim);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => somarMeses(inicio, i));
}

/** Período anterior de mesma duração, imediatamente antes de "inicio". */
export function periodoAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  const n = diferencaMeses(inicio, fim) + 1;
  return { inicio: somarMeses(inicio, -n), fim: somarMeses(inicio, -1) };
}

export function mesValido(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Variação percentual: (atual − anterior) / anterior × 100, apenas quando anterior ≠ 0. */
export function variacaoPercentual(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}
