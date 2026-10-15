import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Info, Loader2, Minus } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatarPercentual } from "@/lib/formatacao";
import type { StatusDocumento, StatusProcessamento } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function CartaoIndicador({
  titulo,
  valor,
  icone: Icone,
  detalhe,
  variacao,
  inverterCores = false,
  ajuda,
  carregando,
}: {
  titulo: string;
  valor: ReactNode;
  icone: LucideIcon;
  detalhe?: ReactNode;
  variacao?: number | null;
  inverterCores?: boolean;
  ajuda?: string;
  carregando?: boolean;
}) {
  const positivo = variacao != null && variacao > 0;
  const negativo = variacao != null && variacao < 0;
  const ruim = inverterCores ? negativo : positivo;
  const bom = inverterCores ? positivo : negativo;
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {titulo}
            {ajuda && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Sobre: ${titulo}`}
                    className="text-muted-foreground/70"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{ajuda}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary">
            <Icone className="h-4 w-4" />
          </div>
        </div>
        {carregando ? (
          <Skeleton className="mt-2 h-7 w-28" />
        ) : (
          <div className="tabular mt-1 truncate text-2xl font-semibold text-foreground">
            {valor}
          </div>
        )}
        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {variacao !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                ruim && "text-destructive",
                bom && "text-success",
              )}
            >
              {variacao == null ? (
                <>
                  <Minus className="h-3 w-3" /> sem base
                </>
              ) : (
                <>
                  {positivo ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : negativo ? (
                    <ArrowDownRight className="h-3 w-3" />
                  ) : null}
                  {formatarPercentual(variacao)}
                </>
              )}
            </span>
          )}
          {detalhe}
        </div>
      </CardContent>
    </Card>
  );
}

export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icone className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{titulo}</h3>
      {descricao && <p className="mt-1 max-w-md text-sm text-muted-foreground">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {texto}
    </div>
  );
}

export function MensagemErro({ erro }: { erro: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {erro}
    </div>
  );
}

const STATUS_DOC: Record<StatusDocumento, { rotulo: string; classe: string }> = {
  autorizada: { rotulo: "Autorizada", classe: "border-success/30 bg-success/10 text-success" },
  sem_protocolo: {
    rotulo: "Sem protocolo",
    classe: "border-warning/40 bg-warning/15 text-warning-foreground",
  },
  cancelada: {
    rotulo: "Cancelada",
    classe: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  substituida: { rotulo: "Substituída", classe: "border-border bg-muted text-muted-foreground" },
};

export function BadgeStatusDocumento({ status }: { status: StatusDocumento }) {
  const s = STATUS_DOC[status] ?? STATUS_DOC.sem_protocolo;
  return (
    <Badge variant="outline" className={cn("font-medium", s.classe)}>
      {s.rotulo}
    </Badge>
  );
}

const STATUS_PROC: Record<StatusProcessamento, { rotulo: string; classe: string }> = {
  processada: { rotulo: "Identificada", classe: "border-primary/20 bg-primary/5 text-primary" },
  pendente_identificacao: {
    rotulo: "Pendente de identificação",
    classe: "border-warning/40 bg-warning/15 text-warning-foreground",
  },
  erro: { rotulo: "Erro", classe: "border-destructive/30 bg-destructive/10 text-destructive" },
};

export function BadgeStatusProcessamento({ status }: { status: StatusProcessamento }) {
  const s = STATUS_PROC[status] ?? STATUS_PROC.erro;
  return (
    <Badge variant="outline" className={cn("font-medium", s.classe)}>
      {s.rotulo}
    </Badge>
  );
}

export function BadgeSituacao({ situacao }: { situacao: "ativa" | "inativa" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        situacao === "ativa"
          ? "border-success/30 bg-success/10 text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      {situacao === "ativa" ? "Ativa" : "Inativa"}
    </Badge>
  );
}

export function CampoInfo({
  rotulo,
  valor,
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="tabular mt-0.5 break-words text-sm text-foreground">{valor ?? "—"}</dd>
    </div>
  );
}
