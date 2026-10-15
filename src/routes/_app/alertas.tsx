import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Info, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina, Carregando, EstadoVazio, MensagemErro } from "@/components/app/comuns";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { ROTULOS_TIPO_ALERTA, type TipoAlerta } from "@/lib/analise/alertas";
import { useAuth } from "@/lib/auth";
import { buscarTodos } from "@/lib/consulta-paginada";
import { CHAVES, invalidarDados, mensagemErro, useConfiguracoes } from "@/lib/consultas";
import { formatarCompetencia, formatarNumero } from "@/lib/formatacao";
import type { Alerta, StatusAlerta } from "@/lib/tipos";
import { recalcularAlertas } from "@/backend/faturas.functions";

export const Route = createFileRoute("/_app/alertas")({
  head: () => ({ meta: [{ title: "Análises e Alertas — Controle Energia" }] }),
  component: PaginaAlertas,
});

type AlertaLista = Alerta & {
  uc: { numero_uc: string; fazenda: string; filial: string | null } | null;
};

const STATUS: Record<StatusAlerta, { rotulo: string; classe: string }> = {
  pendente: {
    rotulo: "Pendente",
    classe: "border-warning/40 bg-warning/15 text-warning-foreground",
  },
  analisado: { rotulo: "Analisado", classe: "border-primary/20 bg-primary/5 text-primary" },
  resolvido: { rotulo: "Resolvido", classe: "border-success/30 bg-success/10 text-success" },
};

function formatarValorAlerta(a: AlertaLista, v: number | null): string | null {
  if (v == null) return null;
  const ind = (a.indicador ?? "").toLowerCase();
  const diario = ind.includes("diário");
  if (ind.includes("consumo")) return `${formatarNumero(v, 0, 2)} kWh${diario ? "/dia" : ""}`;
  if (diario) return `${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/dia`;
  if (ind.includes("kwh")) return `R$ ${formatarNumero(v, 4)}`;
  if (a.tipo_alerta === "ausencia_fatura") return `${formatarNumero(v)} meses c/ fatura`;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PaginaAlertas() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const recalcular = useServerFn(recalcularAlertas);
  const { data: cfg } = useConfiguracoes();
  const [status, setStatus] = useState<"abertos" | StatusAlerta | "todos">("abertos");
  const [classificacao, setClassificacao] = useState<"todas" | "confirmado" | "possivel">("todas");
  const [tipo, setTipo] = useState<"todos" | TipoAlerta>("todos");
  const [recalculando, setRecalculando] = useState(false);
  const [analisando, setAnalisando] = useState<AlertaLista | null>(null);

  const consulta = useQuery({
    queryKey: [...CHAVES.alertas, "lista"],
    queryFn: () =>
      buscarTodos<AlertaLista>(
        supabase,
        "alertas",
        "*, uc:unidades_consumidoras(numero_uc,fazenda,filial)",
        { ativo: true },
      ),
  });

  const dados = useMemo(
    () =>
      (consulta.data ?? []).filter(
        (a) =>
          (status === "todos" ||
            (status === "abertos" ? a.status !== "resolvido" : a.status === status)) &&
          (classificacao === "todas" || a.classificacao === classificacao) &&
          (tipo === "todos" || a.tipo_alerta === tipo),
      ),
    [consulta.data, status, classificacao, tipo],
  );

  const executarRecalculo = async () => {
    setRecalculando(true);
    try {
      const r = await recalcular();
      toast.success(
        `Análise concluída: ${r.total} situação(ões) identificada(s), ${r.novos} nova(s).`,
      );
      await invalidarDados(qc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao recalcular.");
    } finally {
      setRecalculando(false);
    }
  };

  const colunas: Coluna<AlertaLista>[] = [
    { id: "periodo", titulo: "Período", tipo: "competencia", valor: (a) => a.periodo },
    {
      id: "uc",
      titulo: "UC",
      valor: (a) => a.uc?.numero_uc,
      celula: (a) => <span className="font-medium">{a.uc?.numero_uc ?? "—"}</span>,
    },
    { id: "fazenda", titulo: "Fazenda", valor: (a) => a.uc?.fazenda },
    { id: "filial", titulo: "Filial", valor: (a) => a.uc?.filial, oculta: true },
    {
      id: "tipo",
      titulo: "Situação identificada",
      valor: (a) => ROTULOS_TIPO_ALERTA[a.tipo_alerta as TipoAlerta] ?? a.tipo_alerta,
    },
    {
      id: "classificacao",
      titulo: "Classificação",
      valor: (a) => (a.classificacao === "confirmado" ? "Alerta confirmado" : "Possível anomalia"),
      celula: (a) => (
        <Badge
          variant="outline"
          className={
            a.classificacao === "confirmado"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-warning/40 bg-warning/15 text-warning-foreground"
          }
        >
          {a.classificacao === "confirmado" ? "Alerta confirmado" : "Possível anomalia"}
        </Badge>
      ),
    },
    { id: "indicador", titulo: "Indicador", valor: (a) => a.indicador },
    {
      id: "atual",
      titulo: "Valor atual",
      alinhar: "direita",
      valor: (a) => formatarValorAlerta(a, a.valor_atual),
    },
    {
      id: "comparacao",
      titulo: "Comparação",
      alinhar: "direita",
      valor: (a) => formatarValorAlerta(a, a.valor_comparacao),
    },
    { id: "variacao", titulo: "Variação", tipo: "percentual", valor: (a) => a.variacao_percentual },
    {
      id: "descricao",
      titulo: "Motivo",
      valor: (a) => a.descricao,
      classe: "min-w-[320px] max-w-md whitespace-normal text-xs text-muted-foreground",
    },
    {
      id: "status",
      titulo: "Status",
      valor: (a) => STATUS[a.status].rotulo,
      celula: (a) => (
        <Badge variant="outline" className={STATUS[a.status].classe}>
          {STATUS[a.status].rotulo}
        </Badge>
      ),
    },
    {
      id: "obs",
      titulo: "Observação da análise",
      valor: (a) => a.observacao_analise,
      oculta: true,
    },
  ];

  const todos = consulta.data ?? [];
  const abertos = todos.filter((a) => a.status !== "resolvido");

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Análises e Alertas"
        descricao="Situações que merecem atenção, identificadas automaticamente a partir das faturas. Uma variação não significa necessariamente desperdício: cada alerta indica o que verificar."
        acoes={
          pode("importar") && (
            <Button
              variant="outline"
              onClick={() => void executarRecalculo()}
              disabled={recalculando}
            >
              {recalculando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Recalcular análises
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo rotulo="Em aberto" valor={abertos.length} />
        <Resumo
          rotulo="Alertas confirmados"
          valor={abertos.filter((a) => a.classificacao === "confirmado").length}
        />
        <Resumo
          rotulo="Possíveis anomalias"
          valor={abertos.filter((a) => a.classificacao === "possivel").length}
        />
        <Resumo rotulo="Resolvidos" valor={todos.length - abertos.length} />
      </div>

      {cfg && (
        <Card>
          <CardContent className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Regras atuais: consumo &gt; {cfg.alertas.consumo_aumento_pct}% e custo &gt;{" "}
              {cfg.alertas.custo_aumento_pct}% vs. mês anterior
              {cfg.alertas.considerar_dias_faturados &&
                " (por média diária quando há dias faturados)"}
              ; R$/kWh &gt; {cfg.alertas.custo_kwh_acima_historico_pct}% da média histórica;
              componentes &gt; {cfg.alertas.componente_variacao_pct}% e R${" "}
              {cfg.alertas.componente_variacao_valor_min}; R$/kWh &gt;{" "}
              {cfg.alertas.custo_semelhantes_pct}% da mediana de UCs semelhantes.{" "}
              <strong>Alerta confirmado</strong>: o desvio aparece em duas referências (mês anterior
              e mesmo mês do ano anterior/média histórica). <strong>Possível anomalia</strong>: uma
              referência, histórico insuficiente ou variação compatível com sazonalidade.{" "}
              {pode("configurar") && (
                <Link to="/configuracoes" className="underline">
                  Alterar limites
                </Link>
              )}
            </span>
          </CardContent>
        </Card>
      )}

      {consulta.error ? (
        <MensagemErro erro={mensagemErro(consulta.error)} />
      ) : consulta.isLoading ? (
        <Carregando />
      ) : !todos.length ? (
        <EstadoVazio
          icone={ShieldCheck}
          titulo="Nenhuma situação identificada"
          descricao="Os alertas são gerados automaticamente após cada importação. Importe faturas de diferentes meses para habilitar as comparações."
        />
      ) : (
        <TabelaDados
          dados={dados}
          colunas={colunas}
          chave={(a) => a.id}
          nomeExportacao="relatorio-anomalias"
          ordenacaoInicial={{ id: "periodo", direcao: "desc" }}
          aoClicarLinha={(a) =>
            a.unidade_consumidora_id &&
            navigate({ to: "/unidades/$id", params: { id: a.unidade_consumidora_id } })
          }
          acoesLinha={(a) =>
            pode("editar") ? (
              <Button variant="ghost" size="sm" onClick={() => setAnalisando(a)}>
                Analisar
              </Button>
            ) : null
          }
          barraExtra={
            <>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="abertos">Em aberto</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="analisado">Analisados</SelectItem>
                  <SelectItem value="resolvido">Resolvidos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={classificacao}
                onValueChange={(v) => setClassificacao(v as typeof classificacao)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as classificações</SelectItem>
                  <SelectItem value="confirmado">Alertas confirmados</SelectItem>
                  <SelectItem value="possivel">Possíveis anomalias</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {(Object.keys(ROTULOS_TIPO_ALERTA) as TipoAlerta[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ROTULOS_TIPO_ALERTA[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
      )}

      {analisando && <DialogoAnalise alerta={analisando} aoFechar={() => setAnalisando(null)} />}
    </div>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <ShieldAlert className="h-5 w-5 text-muted-foreground" />
        <div>
          <div className="tabular text-xl font-semibold">{valor}</div>
          <div className="text-xs text-muted-foreground">{rotulo}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DialogoAnalise({ alerta, aoFechar }: { alerta: AlertaLista; aoFechar: () => void }) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const [status, setStatus] = useState<StatusAlerta>(
    alerta.status === "pendente" ? "analisado" : alerta.status,
  );
  const [obs, setObs] = useState(alerta.observacao_analise ?? "");
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase
      .from("alertas")
      .update({
        status,
        observacao_analise: obs.trim() || null,
        analisado_por: status === "pendente" ? null : (usuario?.id ?? null),
        analisado_em: status === "pendente" ? null : new Date().toISOString(),
      })
      .eq("id", alerta.id);
    setSalvando(false);
    if (error) {
      toast.error(mensagemErro(error));
      return;
    }
    toast.success("Análise registrada.");
    await invalidarDados(qc);
    aoFechar();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {ROTULOS_TIPO_ALERTA[alerta.tipo_alerta as TipoAlerta] ?? alerta.tipo_alerta}
          </DialogTitle>
          <DialogDescription>
            UC {alerta.uc?.numero_uc} · {alerta.uc?.fazenda} · {formatarCompetencia(alerta.periodo)}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">{alerta.descricao}</p>
        {alerta.fatura_id && (
          <Link
            to="/faturas/$id"
            params={{ id: alerta.fatura_id }}
            className="text-sm text-primary underline"
          >
            Abrir fatura relacionada
          </Link>
        )}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusAlerta)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="analisado">Analisado</SelectItem>
              <SelectItem value="resolvido">Resolvido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Observação da análise</Label>
          <Textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={3}
            placeholder="Ex.: aumento devido à irrigação no período de estiagem."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}{" "}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
