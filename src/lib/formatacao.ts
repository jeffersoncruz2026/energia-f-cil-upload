// Formatação no padrão brasileiro (moeda R$, números, datas DD/MM/AAAA).

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompacto = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const INDISPONIVEL = "—";

export function formatarMoeda(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return INDISPONIVEL;
  return brl.format(valor);
}

export function formatarMoedaCompacta(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return INDISPONIVEL;
  return brlCompacto.format(valor);
}

export function formatarNumero(
  valor: number | null | undefined,
  casas = 0,
  maxCasas: number = casas,
): string {
  if (valor == null || !Number.isFinite(valor)) return INDISPONIVEL;
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: maxCasas,
  });
}

export function formatarKwh(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return INDISPONIVEL;
  return `${formatarNumero(valor, 0, 2)} kWh`;
}

export function formatarPercentual(valor: number | null | undefined, casas = 1): string {
  if (valor == null || !Number.isFinite(valor)) return INDISPONIVEL;
  const sinal = valor > 0 ? "+" : "";
  return `${sinal}${formatarNumero(valor, casas)}%`;
}

export function formatarCustoKwh(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return INDISPONIVEL;
  return `${valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}/kWh`;
}

/** Converte "AAAA-MM-DD" (ou ISO com hora) em DD/MM/AAAA sem efeito de fuso horário. */
export function formatarData(valor: string | null | undefined): string {
  if (!valor) return INDISPONIVEL;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!m) return INDISPONIVEL;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatarDataHora(valor: string | null | undefined): string {
  if (!valor) return INDISPONIVEL;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return INDISPONIVEL;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-03-01" → "03/2026" */
export function formatarCompetencia(valor: string | null | undefined): string {
  if (!valor) return INDISPONIVEL;
  const m = /^(\d{4})-(\d{2})/.exec(valor);
  if (!m) return INDISPONIVEL;
  return `${m[2]}/${m[1]}`;
}

/** "2026-03" → "mar/26" (rótulos curtos de gráficos) */
export function rotuloMes(chave: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(chave);
  if (!m) return chave;
  return `${MESES[Number(m[2]) - 1] ?? m[2]}/${m[1]!.slice(2)}`;
}

export function formatarCnpj(valor: string | null | undefined): string {
  if (!valor) return INDISPONIVEL;
  const c = valor.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (c.length === 14) {
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  }
  if (c.length === 11 && /^\d+$/.test(c)) {
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  }
  return valor;
}

export function formatarChave(valor: string | null | undefined): string {
  if (!valor) return INDISPONIVEL;
  return valor.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Interpreta número digitado no padrão brasileiro ("1.234,56") ou internacional ("1234.56"). */
export function parseNumeroBr(valor: string | number | null | undefined): number | null {
  if (valor == null) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let s = valor.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
