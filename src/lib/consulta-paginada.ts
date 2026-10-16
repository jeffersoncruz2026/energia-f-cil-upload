// Leitura completa de tabelas em páginas (o PostgREST limita linhas por requisição).

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  aplicarGrupoBc,
  calcularGrupoBcPorFatura,
  faturasComInjecaoGrupoBc,
  FILTRO_ITENS_GRUPO_BC,
  normalizarNumeroUc,
  type RegraGrupoBc,
  usinasGrupoBc,
  type ItemGrupoBc,
  type ResultadoGrupoBc,
} from "./analise/grupo-bc";

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

/** Lista de números da configuração grupo_bc (exceções manuais). */
function listaConfig(valor: unknown, chave: string): Set<string> {
  const lista = (valor as Record<string, unknown> | null)?.[chave];
  return new Set(
    (Array.isArray(lista) ? lista : []).map((g) => normalizarNumeroUc(String(g))).filter(Boolean),
  );
}

/**
 * Regra do Grupo BC: UCs cadastradas (energia própria) e exceções manuais.
 * Sem a configuração no banco, as exceções ficam vazias e vale só o automático.
 */
export async function buscarRegraGrupoBc(cliente: SupabaseClient): Promise<RegraGrupoBc> {
  const [ucs, cfg] = await Promise.all([
    buscarTodos<{ numero_uc: string }>(cliente, "unidades_consumidoras", "numero_uc"),
    cliente.from("configuracoes").select("valor").eq("chave", "grupo_bc").maybeSingle(),
  ]);
  const valor = cfg.error ? null : (cfg.data?.valor ?? null);
  return {
    proprias: new Set(ucs.map((u) => normalizarNumeroUc(u.numero_uc)).filter(Boolean)),
    // "geradoras" = formato anterior (usinas cadastradas manualmente) → incluir
    incluir: new Set([...listaConfig(valor, "geradoras"), ...listaConfig(valor, "incluir")]),
    excluir: listaConfig(valor, "excluir"),
  };
}

/** Linhas "INJEÇÃO SCEE" de todas as faturas (para achar as usinas e as faturas do Grupo BC). */
export async function buscarInjecoesScee(cliente: SupabaseClient): Promise<ItemGrupoBc[]> {
  const resultado: ItemGrupoBc[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await cliente
      .from("itens_fatura")
      .select("fatura_id, descricao, quantidade, valor_unitario, valor_total, posto_tarifario")
      .ilike("descricao", "%INJE%SCEE%")
      .order("id", { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    resultado.push(...((data ?? []) as ItemGrupoBc[]));
    if (!data || data.length < TAMANHO_PAGINA || inicio > 500_000) break;
  }
  return resultado;
}

/** Linhas "INJEÇÃO SCEE", "CONSUMO NÃO COMPENSADO" e "ADC BANDEIRA" das faturas informadas. */
export async function buscarItensGrupoBc(
  cliente: SupabaseClient,
  faturaIds: string[],
): Promise<ItemGrupoBc[]> {
  const resultado: ItemGrupoBc[] = [];
  for (let i = 0; i < faturaIds.length; i += 100) {
    const lote = faturaIds.slice(i, i + 100);
    for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
      const { data, error } = await cliente
        .from("itens_fatura")
        .select("fatura_id, descricao, quantidade, valor_unitario, valor_total, posto_tarifario")
        .in("fatura_id", lote)
        .or(FILTRO_ITENS_GRUPO_BC)
        .order("id", { ascending: true })
        .range(inicio, inicio + TAMANHO_PAGINA - 1);
      if (error) throw error;
      resultado.push(...((data ?? []) as ItemGrupoBc[]));
      if (!data || data.length < TAMANHO_PAGINA) break;
    }
  }
  return resultado;
}

/**
 * Acrescenta às faturas os valores do Grupo BC (faturas com injeção de usina
 * cadastrada no Grupo BC) e devolve também o resultado detalhado por fatura.
 */
export async function comGrupoBc<T extends { id: string }>(cliente: SupabaseClient, faturas: T[]) {
  if (!faturas.length) {
    return {
      faturas: aplicarGrupoBc(faturas, new Map()),
      geradoras: new Set<string>(),
      resultados: new Map(),
    };
  }
  const ids = new Set(faturas.map((f) => f.id));
  const [todas, regra] = await Promise.all([
    buscarInjecoesScee(cliente),
    buscarRegraGrupoBc(cliente),
  ]);
  const injecoes = todas.filter((i) => ids.has(i.fatura_id));
  const geradoras = usinasGrupoBc(injecoes, regra);
  const faturasBc = faturasComInjecaoGrupoBc(injecoes, geradoras);
  const resultados: Map<string, ResultadoGrupoBc> = faturasBc.length
    ? calcularGrupoBcPorFatura(await buscarItensGrupoBc(cliente, faturasBc), geradoras)
    : new Map();
  return { faturas: aplicarGrupoBc(faturas, resultados), geradoras, resultados };
}
