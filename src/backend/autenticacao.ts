// Middleware de autenticação das server functions: o navegador envia o token da
// sessão; o servidor valida o usuário no Supabase e cria um cliente que age em
// nome dele (RLS e permissões do banco continuam valendo). Nenhuma chave
// administrativa é utilizada.

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { supabase } from "@/integrations/supabase/client";

export class ErroNegocio extends Error {}

export const comAutenticacao = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(async ({ next }) => {
    const env: Record<string, string | undefined> =
      typeof process !== "undefined" && process.env ? process.env : {};
    const url = env["SUPABASE_URL"] ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
    const chave =
      env["SUPABASE_PUBLISHABLE_KEY"] ??
      env["SUPABASE_ANON_KEY"] ??
      ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
        string | undefined);
    if (!url || !chave) throw new ErroNegocio("Backend não configurado (Supabase).");

    const cabecalho = getRequestHeader("authorization");
    const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
    if (!token) throw new ErroNegocio("Sessão expirada. Faça login novamente.");

    const cliente: SupabaseClient = createClient(url, chave, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await cliente.auth.getUser(token);
    if (error || !data.user) throw new ErroNegocio("Sessão inválida. Faça login novamente.");
    return next({ context: { supabase: cliente, usuario: data.user as User } });
  });

export async function exigirPermissao(cliente: SupabaseClient, permissao: string) {
  const { data, error } = await cliente.rpc("tem_permissao", { _permissao: permissao });
  if (error) throw new ErroNegocio("Não foi possível verificar as permissões do usuário.");
  if (data !== true) throw new ErroNegocio("Você não tem permissão para esta operação.");
}

/** Mensagem segura para o usuário (sem detalhes internos do banco). */
export function mensagemSegura(erro: unknown, padrao: string): string {
  if (erro instanceof ErroNegocio) return erro.message;
  const e = erro as { code?: string; message?: string } | null;
  if (e?.code === "42501") return "Você não tem permissão para esta operação.";
  if (e?.code === "22023" || e?.code === "P0002") return e.message ?? padrao;
  if (e?.code === "23505") return "Registro duplicado: o documento já existe no sistema.";
  console.error(erro);
  return padrao;
}
