import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina, Carregando, MensagemErro } from "@/components/app/comuns";
import { REGRAS_CALCULO } from "@/components/app/metodologia";
import { TabelaDados } from "@/components/app/tabela-dados";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { listaAreas } from "@/lib/areas";
import { ROTULOS_PAPEL, useAuth } from "@/lib/auth";
import { CHAVES, mensagemErro, useConfiguracoes } from "@/lib/consultas";
import type { BaseCusto } from "@/lib/analise/calculos";
import type { ConfigAlertas, ConfigCadastroUc, CriterioConsolidacao, Papel } from "@/lib/tipos";
import { recalcularAlertas, reprocessarFatura } from "@/backend/faturas.functions";
import { buscarTodos } from "@/lib/consulta-paginada";

export const Route = createFileRoute("/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Controle Energia" }] }),
  component: PaginaConfiguracoes,
});

function PaginaConfiguracoes() {
  const { pode } = useAuth();
  return (
    <div>
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Parâmetros de análise, cadastro, usuários e auditoria."
      />
      <Tabs defaultValue="analise">
        <TabsList className="flex-wrap">
          <TabsTrigger value="analise">Regras de análise</TabsTrigger>
          <TabsTrigger value="cadastro">Cadastro e consolidação</TabsTrigger>
          {pode("configurar") && <TabsTrigger value="usuarios">Usuários e permissões</TabsTrigger>}
          {pode("configurar") && <TabsTrigger value="log">Registro de operações</TabsTrigger>}
          <TabsTrigger value="metodologia">Metodologia de cálculo</TabsTrigger>
        </TabsList>
        <TabsContent value="analise">
          <ConfigAnalise />
        </TabsContent>
        <TabsContent value="cadastro" className="space-y-4">
          <ConfigCadastro />
          {pode("importar") && <ReprocessarTodas />}
        </TabsContent>
        {pode("configurar") && (
          <TabsContent value="usuarios">
            <Usuarios />
          </TabsContent>
        )}
        {pode("configurar") && (
          <TabsContent value="log">
            <RegistroOperacoes />
          </TabsContent>
        )}
        <TabsContent value="metodologia">
          <Card>
            <CardContent className="space-y-4 p-6">
              {REGRAS_CALCULO.map((r) => (
                <div key={r.titulo}>
                  <h3 className="text-sm font-semibold">{r.titulo}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{r.texto}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

async function salvarConfig(chave: string, valor: unknown) {
  const { error } = await supabase
    .from("configuracoes")
    .update({ valor: valor as Json })
    .eq("chave", chave);
  if (error) throw error;
}

const CAMPOS_ALERTA: {
  campo: keyof ConfigAlertas;
  rotulo: string;
  sufixo: string;
  min: number;
  max: number;
}[] = [
  {
    campo: "consumo_aumento_pct",
    rotulo: "Aumento de consumo vs. mês anterior",
    sufixo: "%",
    min: 1,
    max: 500,
  },
  {
    campo: "custo_aumento_pct",
    rotulo: "Aumento de custo vs. mês anterior",
    sufixo: "%",
    min: 1,
    max: 500,
  },
  {
    campo: "custo_kwh_acima_historico_pct",
    rotulo: "R$/kWh acima da média histórica da UC",
    sufixo: "%",
    min: 1,
    max: 500,
  },
  {
    campo: "componente_variacao_pct",
    rotulo: "Variação de componente tarifário",
    sufixo: "%",
    min: 1,
    max: 1000,
  },
  {
    campo: "componente_variacao_valor_min",
    rotulo: "Diferença mínima do componente",
    sufixo: "R$",
    min: 0,
    max: 1_000_000,
  },
  {
    campo: "custo_semelhantes_pct",
    rotulo: "R$/kWh acima da mediana de UCs semelhantes",
    sufixo: "%",
    min: 1,
    max: 500,
  },
  {
    campo: "historico_minimo_meses",
    rotulo: "Histórico mínimo para comparações",
    sufixo: "meses",
    min: 1,
    max: 24,
  },
  {
    campo: "solar_queda_injecao_pct",
    rotulo: "Solar: queda da energia injetada vs. média",
    sufixo: "%",
    min: 1,
    max: 100,
  },
  {
    campo: "solar_meses_saldo_excessivo",
    rotulo: "Solar: saldo de créditos acima de",
    sufixo: "meses de uso",
    min: 1,
    max: 60,
  },
];

function ConfigAnalise() {
  const { data, isLoading } = useConfiguracoes();
  const { pode } = useAuth();
  const qc = useQueryClient();
  const recalcular = useServerFn(recalcularAlertas);
  const [v, setV] = useState<ConfigAlertas | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (data) setV(data.alertas);
  }, [data]);
  if (isLoading || !v) return <Carregando />;
  const editavel = pode("configurar");

  const salvar = async () => {
    for (const c of CAMPOS_ALERTA) {
      const n = Number(v[c.campo]);
      if (!Number.isFinite(n) || n < c.min || n > c.max) {
        toast.error(`${c.rotulo}: informe um valor entre ${c.min} e ${c.max}.`);
        return;
      }
    }
    setSalvando(true);
    try {
      await salvarConfig("alertas", v);
      await qc.invalidateQueries({ queryKey: CHAVES.config });
      await recalcular().catch(() => undefined);
      await qc.invalidateQueries({ queryKey: CHAVES.alertas });
      toast.success("Regras salvas e análises recalculadas.");
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Limites de identificação de anomalias</CardTitle>
        <CardDescription>
          As variações são avaliadas por competência. Ao salvar, as análises são recalculadas
          preservando o status dos alertas já analisados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPOS_ALERTA.map((c) => (
            <div key={c.campo} className="space-y-1.5">
              <Label htmlFor={c.campo}>{c.rotulo}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={c.campo}
                  type="number"
                  min={c.min}
                  max={c.max}
                  disabled={!editavel}
                  value={String(v[c.campo])}
                  onChange={(e) => setV({ ...v, [c.campo]: Number(e.target.value) })}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">{c.sufixo}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={v.considerar_dias_faturados}
              disabled={!editavel}
              onCheckedChange={(x) => setV({ ...v, considerar_dias_faturados: x })}
            />
            Comparar pela média diária quando os dias faturados estiverem disponíveis
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={v.considerar_sazonalidade}
              disabled={!editavel}
              onCheckedChange={(x) => setV({ ...v, considerar_sazonalidade: x })}
            />
            Considerar sazonalidade (comparar com o mesmo mês do ano anterior antes de confirmar)
          </label>
        </div>
        {editavel ? (
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}{" "}
            Salvar regras
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Somente administradores podem alterar as regras.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Relê o XML original de todas as faturas com as regras atuais de leitura
 * (ex.: após correção na identificação de créditos de energia).
 */
function ReprocessarTodas() {
  const qc = useQueryClient();
  const reprocessar = useServerFn(reprocessarFatura);
  const recalcular = useServerFn(recalcularAlertas);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const executar = async () => {
    try {
      const faturas = await buscarTodos<{ id: string; arquivo_xml_path: string | null }>(
        supabase,
        "faturas",
        "id, arquivo_xml_path",
        { excluida: false },
      );
      const ids = faturas.filter((f) => f.arquivo_xml_path).map((f) => f.id);
      let falhas = 0;
      setProgresso({ feitas: 0, total: ids.length });
      for (const [i, id] of ids.entries()) {
        try {
          await reprocessar({ data: { faturaId: id } });
        } catch {
          falhas += 1;
        }
        setProgresso({ feitas: i + 1, total: ids.length });
      }
      await recalcular();
      await qc.invalidateQueries();
      if (falhas)
        toast.warning(`${ids.length - falhas} faturas reprocessadas, ${falhas} com falha.`);
      else toast.success(`${ids.length} faturas reprocessadas e alertas recalculados.`);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setProgresso(null);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reprocessar faturas importadas</CardTitle>
        <CardDescription>
          Lê novamente o XML original de todas as faturas com as regras atuais (itens, créditos de
          energia, custo antes da compensação) e recalcula os alertas. Pagamentos confirmados e a UC
          associada são mantidos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={executar} disabled={!!progresso}>
          {progresso ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {progresso
            ? `Reprocessando ${progresso.feitas} de ${progresso.total}…`
            : "Reprocessar todas as faturas"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ConfigCadastro() {
  const { data, isLoading } = useConfiguracoes();
  const { pode } = useAuth();
  const qc = useQueryClient();
  const recalcular = useServerFn(recalcularAlertas);
  const [cad, setCad] = useState<ConfigCadastroUc | null>(null);
  const [textoAreas, setTextoAreas] = useState("");
  const [criterio, setCriterio] = useState<CriterioConsolidacao>("competencia");
  const [baseCusto, setBaseCusto] = useState<BaseCusto>("energia");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (data) {
      setCad(data.cadastro);
      setTextoAreas(data.cadastro.areas.join(", "));
      setCriterio(data.criterio);
      setBaseCusto(data.baseCusto);
    }
  }, [data]);
  if (isLoading || !cad) return <Carregando />;
  const editavel = pode("configurar");
  const salvar = async () => {
    setSalvando(true);
    try {
      const areas = listaAreas(
        textoAreas.split(/[,;\n]/).map((a) => a.trim().replace(/\s+/g, " ")),
        [],
      );
      await salvarConfig("cadastro_uc", { ...cad, areas });
      await salvarConfig("consolidacao", {
        criterio_padrao: criterio,
        base_custo_padrao: baseCusto,
      });
      await recalcular().catch(() => undefined);
      await qc.invalidateQueries({ queryKey: CHAVES.config });
      toast.success("Configurações salvas.");
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cadastro de UCs e consolidação</CardTitle>
        <CardDescription>Número da UC, fazenda e CNPJ são sempre obrigatórios.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={cad.filial_obrigatoria}
            disabled={!editavel}
            onCheckedChange={(x) => setCad({ ...cad, filial_obrigatoria: x })}
          />
          Filial obrigatória
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={cad.endereco_obrigatorio}
            disabled={!editavel}
            onCheckedChange={(x) => setCad({ ...cad, endereco_obrigatorio: x })}
          />
          Endereço obrigatório
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={cad.area_obrigatoria}
            disabled={!editavel}
            onCheckedChange={(x) => setCad({ ...cad, area_obrigatoria: x })}
          />
          Área obrigatória
        </label>
        <div className="max-w-xl space-y-1.5">
          <Label htmlFor="areas">Áreas sugeridas no cadastro</Label>
          <Input
            id="areas"
            disabled={!editavel}
            value={textoAreas}
            onChange={(e) => setTextoAreas(e.target.value)}
            placeholder="Agrícola, Pecuária, Seringal, Administrativo, Oficina"
          />
          <p className="text-xs text-muted-foreground">
            Separe por vírgula. Grafias equivalentes (ex.: “agricola” e “Agrícola”) são unificadas
            automaticamente no cadastro e na importação. Outras áreas também podem ser digitadas.
          </p>
        </div>
        <div className="max-w-xs space-y-1.5">
          <Label>Critério padrão de consolidação</Label>
          <Select
            value={criterio}
            disabled={!editavel}
            onValueChange={(x) => setCriterio(x as CriterioConsolidacao)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="competencia">Competência (mês de referência)</SelectItem>
              <SelectItem value="emissao">Data de emissão</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pode ser alterado pontualmente nos filtros do dashboard e relatórios.
          </p>
        </div>
        <div className="max-w-md space-y-1.5">
          <Label>Base de custo padrão das análises</Label>
          <Select
            value={baseCusto}
            disabled={!editavel}
            onValueChange={(x) => setBaseCusto(x as BaseCusto)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="energia">Custo da energia (antes dos créditos)</SelectItem>
              <SelectItem value="faturado">Valor faturado (líquido)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Custo da energia = valor faturado + créditos de geração distribuída abatidos na fatura.
            Usado em indicadores, gráficos, relatórios e alertas de custo.
          </p>
        </div>
        {editavel && (
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}{" "}
            Salvar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface UsuarioLinha {
  id: string;
  nome: string | null;
  email: string | null;
  created_at: string;
  papel: Papel | null;
}

function Usuarios() {
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("perfis").select("id, nome, email, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      const papeis = new Map((r.data ?? []).map((x) => [x.user_id as string, x.role as Papel]));
      return (p.data ?? []).map((u) => ({
        ...(u as Omit<UsuarioLinha, "papel">),
        papel: papeis.get(u.id as string) ?? null,
      }));
    },
  });
  const alterar = async (id: string, papel: Papel) => {
    const { error } = await supabase.rpc("definir_papel_usuario", { p_user_id: id, p_role: papel });
    if (error) toast.error(mensagemErro(error));
    else {
      toast.success("Permissão atualizada.");
      await qc.invalidateQueries({ queryKey: ["usuarios"] });
    }
  };
  if (consulta.error) return <MensagemErro erro={mensagemErro(consulta.error)} />;
  if (consulta.isLoading) return <Carregando />;
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <p>
            <strong className="text-foreground">Administrador</strong>: todas as operações,
            exclusões, configurações e usuários.
          </p>
          <p>
            <strong className="text-foreground">Gestor</strong>: visualizar, cadastrar, importar,
            editar, analisar alertas e pagamentos.
          </p>
          <p>
            <strong className="text-foreground">Operador</strong>: visualizar, cadastrar UCs e
            importar faturas.
          </p>
          <p>
            <strong className="text-foreground">Consulta</strong>: somente visualização e
            exportação.
          </p>
        </CardContent>
      </Card>
      <TabelaDados
        dados={consulta.data ?? []}
        chave={(u) => u.id}
        busca
        colunas={[
          { id: "nome", titulo: "Nome", valor: (u) => u.nome },
          { id: "email", titulo: "E-mail", valor: (u) => u.email },
          { id: "criado", titulo: "Cadastrado em", tipo: "datahora", valor: (u) => u.created_at },
          {
            id: "papel",
            titulo: "Perfil",
            valor: (u) => (u.papel ? ROTULOS_PAPEL[u.papel] : "—"),
            semOrdenacao: true,
            celula: (u) => (
              <Select value={u.papel ?? ""} onValueChange={(p) => void alterar(u.id, p as Papel)}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="Sem perfil" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROTULOS_PAPEL) as Papel[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {ROTULOS_PAPEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
        ]}
      />
    </div>
  );
}

interface LogLinha {
  id: number;
  usuario_id: string | null;
  acao: string;
  tabela: string;
  registro_id: string | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  created_at: string;
}

const ROTULO_TABELA: Record<string, string> = {
  unidades_consumidoras: "Unidade consumidora",
  faturas: "Fatura",
  user_roles: "Permissão de usuário",
  configuracoes: "Configuração",
  alertas: "Alerta",
};

function resumoAlteracao(l: LogLinha): string {
  if (l.acao !== "update" || !l.dados_anteriores || !l.dados_novos) {
    const d = l.dados_novos ?? l.dados_anteriores ?? {};
    return String(d["numero_uc"] ?? d["numero_documento"] ?? d["chave"] ?? d["role"] ?? "");
  }
  const ignorar = new Set(["updated_at", "updated_by", "divergencias"]);
  return Object.keys(l.dados_novos)
    .filter(
      (k) =>
        !ignorar.has(k) &&
        JSON.stringify(l.dados_novos![k]) !== JSON.stringify(l.dados_anteriores![k]),
    )
    .map(
      (k) =>
        `${k}: ${JSON.stringify(l.dados_anteriores![k])} → ${JSON.stringify(l.dados_novos![k])}`,
    )
    .join("; ")
    .slice(0, 300);
}

function RegistroOperacoes() {
  const consulta = useQuery({
    queryKey: ["log-operacoes"],
    queryFn: async () => {
      const [l, p] = await Promise.all([
        supabase
          .from("log_operacoes")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("perfis").select("id, nome, email"),
      ]);
      if (l.error) throw l.error;
      const nomes = new Map(
        (p.data ?? []).map((x) => [x.id as string, (x.nome || x.email) as string]),
      );
      return ((l.data ?? []) as LogLinha[]).map((x) => ({
        ...x,
        usuario: x.usuario_id ? (nomes.get(x.usuario_id) ?? "—") : "Sistema",
      }));
    },
  });
  if (consulta.error) return <MensagemErro erro={mensagemErro(consulta.error)} />;
  if (consulta.isLoading) return <Carregando />;
  return (
    <TabelaDados
      dados={consulta.data ?? []}
      chave={(l) => String(l.id)}
      nomeExportacao="registro-operacoes"
      colunas={[
        { id: "data", titulo: "Data", tipo: "datahora", valor: (l) => l.created_at },
        { id: "usuario", titulo: "Usuário", valor: (l) => l.usuario },
        {
          id: "acao",
          titulo: "Ação",
          valor: (l) =>
            ({ insert: "Inclusão", update: "Alteração", delete: "Exclusão" })[l.acao] ?? l.acao,
        },
        { id: "tabela", titulo: "Registro", valor: (l) => ROTULO_TABELA[l.tabela] ?? l.tabela },
        {
          id: "resumo",
          titulo: "Detalhes",
          valor: (l) => resumoAlteracao(l),
          classe: "max-w-xl whitespace-normal text-xs text-muted-foreground",
        },
      ]}
    />
  );
}
