// Consultas compartilhadas (React Query) ao Supabase.

import { useQuery, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import type { FaturaAnalise } from "./analise/calculos";
import { buscarTodos, CAMPOS_FATURA_ANALISE } from "./consulta-paginada";
import {
  CONFIG_ALERTAS_PADRAO,
  CONFIG_CADASTRO_PADRAO,
  type ConfigAlertas,
  type ConfigCadastroUc,
  type CriterioConsolidacao,
  type UnidadeConsumidora,
} from "./tipos";

export const CHAVES = {
  ucs: ["ucs"] as const,
  faturasAnalise: ["faturas-analise"] as const,
  faturas: ["faturas"] as const,
  pendentes: ["pendentes"] as const,
  alertas: ["alertas"] as const,
  historico: ["historico"] as const,
  config: ["config"] as const,
};

export function invalidarDados(qc: QueryClient) {
  return Promise.all(
    [
      CHAVES.ucs,
      CHAVES.faturasAnalise,
      CHAVES.faturas,
      CHAVES.pendentes,
      CHAVES.alertas,
      CHAVES.historico,
    ].map((k) => qc.invalidateQueries({ queryKey: k })),
  );
}

export function useUcs() {
  return useQuery({
    queryKey: CHAVES.ucs,
    queryFn: () =>
      buscarTodos<UnidadeConsumidora>(supabase, "unidades_consumidoras", "*", {}, "numero_uc"),
  });
}

/** Faturas não excluídas com os campos necessários para indicadores e gráficos. */
export function useFaturasAnalise() {
  return useQuery({
    queryKey: CHAVES.faturasAnalise,
    queryFn: () =>
      buscarTodos<FaturaAnalise>(supabase, "faturas", CAMPOS_FATURA_ANALISE, { excluida: false }),
  });
}

export function usePendentesCount() {
  return useQuery({
    queryKey: [...CHAVES.pendentes, "contagem"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("faturas")
        .select("id", { count: "exact", head: true })
        .eq("status_processamento", "pendente_identificacao")
        .eq("excluida", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export interface Configuracoes {
  alertas: ConfigAlertas;
  cadastro: ConfigCadastroUc;
  criterio: CriterioConsolidacao;
}

export function useConfiguracoes() {
  return useQuery({
    queryKey: CHAVES.config,
    queryFn: async (): Promise<Configuracoes> => {
      const { data, error } = await supabase.from("configuracoes").select("chave, valor");
      if (error) throw error;
      const mapa = new Map(
        (data ?? []).map((d) => [d.chave as string, d.valor as Record<string, unknown>]),
      );
      return {
        alertas: { ...CONFIG_ALERTAS_PADRAO, ...(mapa.get("alertas") ?? {}) },
        cadastro: { ...CONFIG_CADASTRO_PADRAO, ...(mapa.get("cadastro_uc") ?? {}) },
        criterio:
          (mapa.get("consolidacao")?.["criterio_padrao"] as CriterioConsolidacao) ?? "competencia",
      };
    },
  });
}

/** Converte erros do Supabase em mensagem amigável, sem expor detalhes internos. */
export function mensagemErro(
  erro: unknown,
  padrao = "Não foi possível concluir a operação.",
): string {
  const e = erro as { code?: string; message?: string } | null;
  if (!e) return padrao;
  if (e.code === "42501" || /row-level security|permiss/i.test(e.message ?? "")) {
    return "Você não tem permissão para esta operação.";
  }
  if (e.code === "23505") return "Já existe um registro com este identificador.";
  if (e.code === "23514") {
    if (/cnpj/i.test(e.message ?? "")) return "CNPJ inválido.";
    return "Dados inconsistentes: verifique os campos informados.";
  }
  if (e.code === "23503") return "Registro vinculado a outros dados: não pode ser removido.";
  if (e.code === "22023" || e.code === "P0002") return e.message ?? padrao;
  if (e instanceof Error && e.message && !/fetch|network|JSON|undefined|null/i.test(e.message))
    return e.message;
  return padrao;
}
