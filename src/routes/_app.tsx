import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { LayoutApp } from "@/components/app/layout-app";
import { ConfiguracaoPendente } from "@/components/app/configuracao-pendente";
import { ehAmbienteEdicao, rotaSoEdicao } from "@/lib/ambiente";
import { backendConfigurado } from "@/lib/configuracao-backend";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AreaAutenticada,
});

function AreaAutenticada() {
  const { carregando, sessao, papel } = useAuth();
  const caminho = useRouterState({ select: (s) => s.location.pathname });

  if (!backendConfigurado) return <ConfiguracaoPendente />;
  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!sessao) return <Navigate to="/login" />;
  // Telas de administração só no ambiente de edição (Lovable); no publicado, volta ao dashboard.
  if (!ehAmbienteEdicao() && rotaSoEdicao(caminho)) return <Navigate to="/dashboard" />;
  if (!papel) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 text-center text-sm text-muted-foreground">
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
