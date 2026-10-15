import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { backendConfigurado } from "@/lib/configuracao-backend";

import type { Papel, Permissao } from "./tipos";

// Espelha a matriz da função public.tem_permissao (a verificação definitiva é no banco).
const MATRIZ: Record<Permissao, Papel[]> = {
  visualizar: ["admin", "gestor", "operador", "consulta"],
  cadastrar: ["admin", "gestor", "operador"],
  importar: ["admin", "gestor", "operador"],
  editar: ["admin", "gestor"],
  excluir: ["admin"],
  configurar: ["admin"],
};

export const ROTULOS_PAPEL: Record<Papel, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  operador: "Operador",
  consulta: "Consulta",
};

interface EstadoAuth {
  carregando: boolean;
  sessao: Session | null;
  usuario: User | null;
  papel: Papel | null;
  pode: (p: Permissao) => boolean;
  sair: () => Promise<void>;
}

const AuthContext = createContext<EstadoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!supabaseConfigurado) {
      setCarregando(false);
      return;
    }
    let ativo = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      if (!ativo) return;
      setSessao(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
      if (!data.session) setCarregando(false);
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = sessao?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      setPapel(null);
      return;
    }
    let ativo = true;
    setCarregando(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (!ativo) return;
        const papeis = (data ?? []).map((r) => r.role as Papel);
        const ordem: Papel[] = ["admin", "gestor", "operador", "consulta"];
        setPapel(ordem.find((p) => papeis.includes(p)) ?? null);
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [userId]);

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      sessao,
      usuario: sessao?.user ?? null,
      papel,
      pode: (p) => (papel ? MATRIZ[p].includes(papel) : false),
      sair: async () => {
        await supabase.auth.signOut();
      },
    }),
    [carregando, sessao, papel],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
