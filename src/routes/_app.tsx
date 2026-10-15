import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { LayoutApp } from "@/components/app/layout-app";
import { ConfiguracaoPendente } from "@/components/app/configuracao-pendente";
import { backendConfigurado } from "@/lib/configuracao-backend";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AreaAutenticada,
});

function AreaAutenticada() {
  const { carregando, sessao, papel } = useAuth();

  if (!supabaseConfigurado) return <ConfiguracaoPendente />;
  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!sessao) return <Navigate to="/login" />;
  if (!papel) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Seu usuário ainda não possui perfil de acesso. Solicite a liberação a um administrador.
      </div>
    );
  }
  return (
    <LayoutApp>
      <Outlet />
    </LayoutApp>
  );
}
