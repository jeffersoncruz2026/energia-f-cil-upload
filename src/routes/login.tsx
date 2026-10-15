import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2, Zap } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConfiguracaoPendente } from "@/components/app/configuracao-pendente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { backendConfigurado } from "@/lib/configuracao-backend";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar — Controle Energia Elétrica" }] }),
  component: Login,
});

function traduzirErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar.";
  if (/already registered|already exists/i.test(msg)) return "Este e-mail já está cadastrado.";
  if (/password.*(at least|characters)|weak/i.test(msg))
    return "A senha não atende aos requisitos mínimos (mínimo 8 caracteres).";
  if (/rate limit/i.test(msg))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

function Login() {
  const { sessao, carregando } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!backendConfigurado) return <ConfiguracaoPendente />;
  if (!carregando && sessao) return <Navigate to="/dashboard" />;

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    setEnviando(false);
    if (error) toast.error(traduzirErro(error.message));
  };

  const cadastrar = async (e: FormEvent) => {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        data: { nome: nome.trim() },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setEnviando(false);
    if (error) {
      toast.error(traduzirErro(error.message));
      return;
    }
    if (!data.session) {
      toast.success("Cadastro realizado. Verifique seu e-mail para confirmar o acesso.");
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
          Controle Energia Elétrica
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight text-white">
            Gestão e análise de energia elétrica para propriedades rurais
          </h2>
          <p className="mt-4 max-w-md text-sm opacity-75">
            Importe os XMLs das faturas, associe cada documento à sua unidade consumidora e
            acompanhe custos, consumo e anomalias com dados confiáveis.
          </p>
        </div>
        <p className="text-xs opacity-50">Acesso restrito a usuários autorizados.</p>
      </div>
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Zap className="h-5 w-5" />
            </div>
            <span className="font-semibold">Controle Energia Elétrica</span>
          </div>
          <Tabs defaultValue="entrar">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="cadastrar">Criar acesso</TabsTrigger>
            </TabsList>
            <TabsContent value="entrar">
              <form onSubmit={entrar} className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Entrar
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="cadastrar">
              <form onSubmit={cadastrar} className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email2">E-mail</Label>
                  <Input
                    id="email2"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senha2">Senha (mínimo 8 caracteres)</Label>
                  <Input
                    id="senha2"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar acesso
                </Button>
                <p className="text-xs text-muted-foreground">
                  O primeiro usuário cadastrado torna-se administrador. Os demais entram com perfil
                  de consulta até que um administrador altere a permissão.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
