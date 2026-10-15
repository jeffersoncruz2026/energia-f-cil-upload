// Leitura completa de tabelas em páginas (o PostgREST limita linhas por requisição).

import type { SupabaseClient } from "@supabase/supabase-js";

export const CAMPOS_FATURA_ANALISE = [
  "id",
  "unidade_consumidora_id",
  "periodo_referencia",
  "data_emissao",
  "valor_total",
  "consumo_kwh",
  "dias_faturados",
  "status_documento",
  "status_processamento",
  "excluida",
  "finalidade",
  "numero_documento",
  "valor_tusd",
  "valor_te",
  "valor_icms",
  "valor_pis",
  "valor_cofins",
  "valor_cip",
  "valor_bandeira",
  "valor_demanda",
  "valor_reativo",
  "valor_multas",
  "valor_juros",
  "valor_encargos",
  "valor_descontos",
  "valor_compensacao",
  "valor_energia",
  "valor_outros",
  "energia_injetada_kwh",
  "energia_compensada_kwh",
  "demanda_medida_kw",
  "demanda_contratada_kw",
  "demanda_faturada_kw",
  "divergencias",
].join(",");

const TAMANHO_PAGINA = 1000;

export async function buscarTodos<T>(
  cliente: SupabaseClient,
  tabela: string,
  campos: string,
  filtrosIguais: Record<string, string | number | boolean> = {},
  ordem = "id",
): Promise<T[]> {
  const resultado: T[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    let q = cliente.from(tabela).select(campos).order(ordem, { ascending: true });
    for (const [coluna, valor] of Object.entries(filtrosIguais)) q = q.eq(coluna, valor);
    const { data, error } = await q.range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    resultado.push(...((data ?? []) as T[]));
    if (!data || data.length < TAMANHO_PAGINA) break;
    if (inicio > 500_000) break;
  }
  return resultado;
}

/** Itens de energia injetada/compensada (créditos de geração distribuída). */
export async function buscarItensGd(cliente: SupabaseClient) {
  const resultado: {
    fatura_id: string;
    tipo_item: string;
    componente: string | null;
    quantidade: number | null;
    unidade_medida: string | null;
    valor_total: number | null;
  }[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await cliente
      .from("itens_fatura")
      .select("fatura_id, tipo_item, componente, quantidade, unidade_medida, valor_total")
      .in("tipo_item", ["injecao", "compensacao"])
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    resultado.push(...((data ?? []) as typeof resultado));
    if (!data || data.length < TAMANHO_PAGINA || inicio > 500_000) break;
  }
  return resultado;
}
