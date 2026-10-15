// Validação de CNPJ (numérico e alfanumérico) e normalização do número da UC.
// As regras espelham as funções SQL public.cnpj_valido e public.normalizar_uc.

export function normalizarCnpj(valor: string | null | undefined): string {
  return (valor ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) {
    soma += (base.charCodeAt(i) - 48) * pesos[i]!;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Valida CNPJ numérico ou alfanumérico (12 caracteres alfanuméricos + 2 dígitos
 * verificadores, conforme IN RFB nº 2.229/2024).
 */
export function cnpjValido(valor: string | null | undefined): boolean {
  const c = normalizarCnpj(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const dv1 = digitoVerificador(c, PESOS_1);
  const dv2 = digitoVerificador(c, PESOS_2);
  return Number(c[12]) === dv1 && Number(c[13]) === dv2;
}

/** Normaliza o número da UC: sem pontuação/espaços, maiúsculas e sem zeros à esquerda. */
export function normalizarUc(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const limpo = valor.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!limpo) return null;
  const semZeros = limpo.replace(/^0+/, "");
  return semZeros || "0";
}

/** Valida a chave de acesso de 44 dígitos (dígito verificador módulo 11). */
export function chaveAcessoValida(chave: string | null | undefined): boolean {
  if (!chave || !/^\d{44}$/.test(chave)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
}
