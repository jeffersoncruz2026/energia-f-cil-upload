import { createClient } from "@supabase/supabase-js";

// Somente a chave pública (publishable/anon) é usada no navegador. O acesso aos
// dados é controlado por autenticação + políticas RLS no banco.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase = createClient(
  SUPABASE_URL ?? "http://localhost:54321",
  SUPABASE_PUBLISHABLE_KEY ?? "chave-nao-configurada",
  {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export const BUCKET_XML = "faturas-xml";
