import { Database } from "lucide-react";

export function ConfiguracaoPendente() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-lg rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Database className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Banco de dados não conectado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este sistema usa Supabase (PostgreSQL, autenticação e armazenamento privado). Para
          ativá-lo:
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>
            Conecte um projeto Supabase (no Lovable: ative o Lovable Cloud / integração Supabase).
          </li>
          <li>
            Aplique a migração{" "}
            <code className="rounded bg-muted px-1">
              supabase/migrations/*_sistema_gestao_energia.sql
            </code>
            .
          </li>
          <li>
            Defina <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> e{" "}
            <code className="rounded bg-muted px-1">VITE_SUPABASE_PUBLISHABLE_KEY</code> (chave
            pública).
          </li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Nunca use a chave service_role no frontend. Consulte o README para os detalhes.
        </p>
      </div>
    </div>
  );
}
