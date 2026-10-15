// Constantes e verificação de configuração do backend. Ficam fora de
// src/integrations/supabase/client.ts porque esse arquivo é gerado
// automaticamente e não deve ser editado.

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const CHAVE = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

/** O backend está conectado e o app pode usar banco, login e armazenamento. */
export const backendConfigurado = Boolean(URL && CHAVE);

/** Armazenamento privado dos XMLs originais das faturas. */
export const BUCKET_XML = "faturas-xml";
