// Utilitários para navegar no objeto gerado pelo fast-xml-parser de forma tolerante
// a variações de leiaute (elementos ausentes, repetidos ou em níveis diferentes).

export type No = Record<string, unknown>;

export function ehNo(v: unknown): v is No {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function primeiro(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

/** Retorna o primeiro filho com o nome indicado, seguindo o caminho informado. */
export function filho(no: unknown, ...caminho: string[]): No | undefined {
  let atual: unknown = no;
  for (const parte of caminho) {
    if (!ehNo(atual)) return undefined;
    atual = primeiro(atual[parte]);
  }
  return ehNo(atual) ? atual : undefined;
}

function valorTexto(v: unknown): string | null {
  const p = primeiro(v);
  if (p == null) return null;
  if (typeof p === "string") return p.trim() || null;
  if (typeof p === "number" || typeof p === "boolean") return String(p);
  if (ehNo(p) && p["#text"] != null) return valorTexto(p["#text"]);
  return null;
}

/** Texto do elemento ao final do caminho (ou null quando indisponível). */
export function txt(no: unknown, ...caminho: string[]): string | null {
  if (caminho.length === 0) return valorTexto(no);
  const pai = caminho.length > 1 ? filho(no, ...caminho.slice(0, -1)) : ehNo(no) ? no : undefined;
  if (!pai) return null;
  return valorTexto(pai[caminho[caminho.length - 1]!]);
}

export function atributo(no: unknown, nome: string): string | null {
  if (!ehNo(no)) return null;
  return valorTexto(no[`@_${nome}`]);
}

/** Lista de filhos diretos com o nome indicado (sempre um array). */
export function lista(no: unknown, nome: string): No[] {
  if (!ehNo(no)) return [];
  const v = no[nome];
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).filter(ehNo);
}

/** Busca recursiva por todos os elementos com o nome indicado (ignora assinatura digital). */
export function buscarTodos(no: unknown, nome: string, limite = 5000): No[] {
  const achados: No[] = [];
  const pilha: unknown[] = [no];
  while (pilha.length && achados.length < limite) {
    const atual = pilha.pop();
    if (Array.isArray(atual)) {
      for (let i = atual.length - 1; i >= 0; i--) pilha.push(atual[i]);
      continue;
    }
    if (!ehNo(atual)) continue;
    for (const [chave, valor] of Object.entries(atual)) {
      if (chave === "Signature" || chave.startsWith("@_")) continue;
      if (chave === nome) {
        for (const v of Array.isArray(valor) ? valor : [valor]) {
          if (ehNo(v)) achados.push(v);
          else if (v != null) achados.push({ "#text": v });
        }
      }
      if (typeof valor === "object" && valor !== null) pilha.push(valor);
    }
  }
  return achados;
}

export function buscarPrimeiroTexto(no: unknown, nome: string): string | null {
  const [p] = buscarTodos(no, nome, 1);
  return p ? valorTexto(p) : null;
}

/** Converte número no formato XML (ponto decimal). Retorna null se ausente ou inválido. */
export function num(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Remove a assinatura digital e campos volumosos sem valor analítico. */
export function semAssinatura(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(semAssinatura);
  if (!ehNo(no)) return no;
  const out: No = {};
  for (const [k, v] of Object.entries(no)) {
    if (k === "Signature") continue;
    out[k] = semAssinatura(v);
  }
  return out;
}
