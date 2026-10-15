import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Copy,
  FileWarning,
  FileX2,
  Inbox,
  Loader2,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina, EstadoVazio } from "@/components/app/comuns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { invalidarDados } from "@/lib/consultas";
import { formatarCompetencia, formatarKwh, formatarMoeda } from "@/lib/formatacao";
import { TAMANHO_MAXIMO_XML } from "@/lib/xml/leitor-fatura";
import {
  analisarXml,
  importarXml,
  recalcularAlertas,
  type ResultadoAnalise,
  type ResultadoImportacao,
} from "@/backend/faturas.functions";

export const Route = createFileRoute("/_app/importar")({
  head: () => ({ meta: [{ title: "Importar XML — Controle Energia" }] }),
  component: PaginaImportar,
});

const MAX_ARQUIVOS = 200;
const CONCORRENCIA = 3;

interface ItemArquivo {
  id: string;
  arquivo: File;
  conteudo?: string;
  analise?: ResultadoAnalise;
  resultado?: ResultadoImportacao;
  erroLocal?: string;
  selecionado: boolean;
  estado: "analisando" | "analisado" | "importando" | "concluido";
}

async function emParalelo<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  const fila = [...itens];
  const trabalhadores = Array.from({ length: Math.min(limite, fila.length) }, async () => {
    while (fila.length) {
      const item = fila.shift()!;
      await fn(item);
    }
  });
  await Promise.all(trabalhadores);
}

const SITUACAO: Record<
  ResultadoAnalise["situacao"],
  { rotulo: string; classe: string; icone: typeof CheckCircle2 }
> = {
  pronto: {
    rotulo: "Pronta",
    classe: "border-success/30 bg-success/10 text-success",
    icone: CheckCircle2,
  },
  uc_nao_cadastrada: {
    rotulo: "UC não cadastrada",
    classe: "border-warning/40 bg-warning/15 text-warning-foreground",
    icone: Inbox,
  },
  duplicado: { rotulo: "Duplicada", classe: "bg-muted text-muted-foreground", icone: Copy },
  invalido: {
    rotulo: "Inválido",
    classe: "border-destructive/30 bg-destructive/10 text-destructive",
    icone: FileX2,
  },
  evento: {
    rotulo: "Evento fiscal",
    classe: "border-primary/20 bg-primary/5 text-primary",
    icone: FileWarning,
  },
};

const RESULTADO: Record<ResultadoImportacao["status"], { rotulo: string; classe: string }> = {
  importada: { rotulo: "Importada", classe: "border-success/30 bg-success/10 text-success" },
  pendente_identificacao: {
    rotulo: "Pendente de identificação",
    classe: "border-warning/40 bg-warning/15 text-warning-foreground",
  },
  duplicada: { rotulo: "Duplicada (ignorada)", classe: "bg-muted text-muted-foreground" },
  evento_registrado: {
    rotulo: "Evento registrado",
    classe: "border-primary/20 bg-primary/5 text-primary",
  },
  erro: { rotulo: "Erro", classe: "border-destructive/30 bg-destructive/10 text-destructive" },
};

function PaginaImportar() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const analisar = useServerFn(analisarXml);
  const importar = useServerFn(importarXml);
  const recalcular = useServerFn(recalcularAlertas);
  const entrada = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<ItemArquivo[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const atualizar = (id: string, p: Partial<ItemArquivo>) =>
    setItens((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const adicionar = async (lista: FileList | File[] | null) => {
    if (!lista) return;
    const arquivos = Array.from(lista);
    const espaco = MAX_ARQUIVOS - itens.length;
    if (arquivos.length > espaco) {
      toast.warning(
        `Limite de ${MAX_ARQUIVOS} arquivos por lote. ${arquivos.length - espaco} arquivo(s) ignorado(s).`,
      );
    }
    const novos: ItemArquivo[] = arquivos.slice(0, Math.max(espaco, 0)).map((arquivo) => ({
      id: crypto.randomUUID(),
      arquivo,
      selecionado: true,
      estado: "analisando",
    }));
    setItens((l) => [...l, ...novos]);

    await emParalelo(novos, CONCORRENCIA, async (item) => {
      const { arquivo } = item;
      if (!/\.xml$/i.test(arquivo.name)) {
        atualizar(item.id, {
          estado: "analisado",
          erroLocal: "Arquivo não é XML (.xml).",
          selecionado: false,
        });
        return;
      }
      if (arquivo.size > TAMANHO_MAXIMO_XML) {
        atualizar(item.id, {
          estado: "analisado",
          erroLocal: "Arquivo excede 5 MB.",
          selecionado: false,
        });
        return;
      }
      try {
        const conteudo = await arquivo.text();
        const analise = await analisar({ data: { nomeArquivo: arquivo.name, conteudo } });
        atualizar(item.id, {
          conteudo,
          analise,
          estado: "analisado",
          selecionado: analise.situacao !== "duplicado",
        });
      } catch (e) {
        atualizar(item.id, {
          estado: "analisado",
          erroLocal: e instanceof Error ? e.message : "Falha ao analisar o arquivo.",
          selecionado: false,
        });
      }
    });
  };

  const confirmar = async () => {
    const fila = itens.filter((i) => i.selecionado && i.conteudo && !i.resultado);
    if (!fila.length) return;
    setImportando(true);
    setProgresso(0);
    const loteId = crypto.randomUUID();
    let feitos = 0;
    await emParalelo(fila, CONCORRENCIA, async (item) => {
      atualizar(item.id, { estado: "importando" });
      try {
        const resultado = await importar({
          data: { nomeArquivo: item.arquivo.name, conteudo: item.conteudo!, loteId },
        });
        atualizar(item.id, { estado: "concluido", resultado });
      } catch (e) {
        atualizar(item.id, {
          estado: "concluido",
          resultado: {
            nomeArquivo: item.arquivo.name,
            status: "erro",
            mensagem: e instanceof Error ? e.message : "Falha na importação.",
            faturaId: null,
            avisos: [],
          },
        });
      }
      feitos++;
      setProgresso(Math.round((feitos / fila.length) * 100));
    });
    try {
      await recalcular();
    } catch {
      toast.warning(
        "Faturas importadas, mas não foi possível atualizar os alertas agora. Use “Recalcular” em Análises e Alertas.",
      );
    }
    await invalidarDados(qc);
    setImportando(false);
    toast.success("Importação concluída. Indicadores, gráficos e alertas foram atualizados.");
  };

  const analisando = itens.some((i) => i.estado === "analisando");
  const selecionados = itens.filter((i) => i.selecionado && i.conteudo && !i.resultado);
  const contagem = (s: ResultadoAnalise["situacao"]) =>
    itens.filter((i) => i.analise?.situacao === s).length;
  const concluidos = itens.filter((i) => i.resultado);
  const contagemResultado = (s: ResultadoImportacao["status"]) =>
    concluidos.filter((i) => i.resultado?.status === s).length;

  if (!pode("importar")) {
    return (
      <div>
        <CabecalhoPagina titulo="Importar XML" />
        <EstadoVazio
          icone={XCircle}
          titulo="Sem permissão"
          descricao="Seu perfil não permite importar faturas."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Importação de Faturas"
        descricao="Envie os XMLs das notas fiscais de energia elétrica (NF3e modelo 66, NF-e de energia e eventos de cancelamento). Os arquivos são lidos no servidor, conferidos e só gravados após sua confirmação."
      />

      <div
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors ${
          arrastando ? "border-primary bg-primary/5" : "hover:border-primary/60"
        }`}
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void adicionar(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && entrada.current?.click()}
      >
        <UploadCloud className="h-9 w-9 text-primary" />
        <p className="font-medium">Arraste os arquivos XML aqui ou clique para selecionar</p>
        <p className="text-xs text-muted-foreground">
          Até {MAX_ARQUIVOS} arquivos por lote · máximo de 5 MB por arquivo · armazenamento privado
          do XML original
        </p>
        <input
          ref={entrada}
          type="file"
          accept=".xml,text/xml,application/xml"
          multiple
          className="hidden"
          onChange={(e) => {
            void adicionar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {itens.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                {concluidos.length ? "Resultado da importação" : "Prévia para conferência"}
              </CardTitle>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {concluidos.length ? (
                  (Object.keys(RESULTADO) as ResultadoImportacao["status"][]).map(
                    (s) =>
                      contagemResultado(s) > 0 && (
                        <Badge key={s} variant="outline" className={RESULTADO[s].classe}>
                          {RESULTADO[s].rotulo}: {contagemResultado(s)}
                        </Badge>
                      ),
                  )
                ) : (
                  <>
                    {(Object.keys(SITUACAO) as ResultadoAnalise["situacao"][]).map(
                      (s) =>
                        contagem(s) > 0 && (
                          <Badge key={s} variant="outline" className={SITUACAO[s].classe}>
                            {SITUACAO[s].rotulo}: {contagem(s)}
                          </Badge>
                        ),
                    )}
                    {itens.some((i) => i.erroLocal) && (
                      <Badge variant="outline" className={SITUACAO.invalido.classe}>
                        Rejeitados: {itens.filter((i) => i.erroLocal).length}
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setItens([])}
                disabled={importando || analisando}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Limpar lista
              </Button>
              <Button
                size="sm"
                onClick={() => void confirmar()}
                disabled={importando || analisando || !selecionados.length}
              >
                {importando ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                )}
                Confirmar importação ({selecionados.length})
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(importando || analisando) && (
              <div className="space-y-1">
                <Progress
                  value={importando ? progresso : undefined}
                  className={analisando ? "animate-pulse" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  {analisando ? "Analisando arquivos no servidor…" : `Importando… ${progresso}%`}
                </p>
              </div>
            )}
            {contagem("uc_nao_cadastrada") > 0 && !concluidos.length && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                <span>
                  Faturas de UCs não cadastradas serão importadas para a fila de{" "}
                  <Link to="/pendencias" className="font-medium underline">
                    Pendências de Identificação
                  </Link>
                  . Elas não entram nos indicadores até serem associadas a uma UC.
                </span>
              </div>
            )}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60">
                    <TableHead className="w-8" />
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>UC / Fazenda</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                    <TableHead className="text-right">Consumo</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((i) => (
                    <LinhaArquivo
                      key={i.id}
                      item={i}
                      bloqueado={importando}
                      aoSelecionar={(v) => atualizar(i.id, { selecionado: v })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LinhaArquivo({
  item,
  bloqueado,
  aoSelecionar,
}: {
  item: ItemArquivo;
  bloqueado: boolean;
  aoSelecionar: (v: boolean) => void;
}) {
  const a = item.analise;
  const r = item.resultado;
  const avisos = [...(a?.divergencias ?? []), ...(r?.avisos ?? a?.avisos ?? [])];
  return (
    <TableRow className="align-top">
      <TableCell className="pt-3">
        {item.estado === "analisando" ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : item.estado === "importando" ? (
          <CircleDashed className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Checkbox
            checked={item.selecionado}
            disabled={bloqueado || !item.conteudo || !!r}
            onCheckedChange={(v) => aoSelecionar(v === true)}
            aria-label={`Incluir ${item.arquivo.name}`}
          />
        )}
      </TableCell>
      <TableCell className="max-w-[220px]">
        <div className="truncate text-sm font-medium" title={item.arquivo.name}>
          {item.arquivo.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {(item.arquivo.size / 1024).toFixed(1)} KB
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {a?.resumo ? (
          <>
            <div>
              {a.resumo.tipoDocumento}
              {a.resumo.numeroDocumento && ` nº ${a.resumo.numeroDocumento}`}
            </div>
            <div className="max-w-[180px] truncate text-xs text-muted-foreground">
              {a.resumo.descricaoEvento ?? a.resumo.fornecedor}
            </div>
          </>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm">
        {a?.uc ? (
          <>
            <div className="font-medium">{a.uc.numero_uc}</div>
            <div className="text-xs text-muted-foreground">
              {a.uc.fazenda}
              {a.uc.filial && ` · ${a.uc.filial}`}
            </div>
          </>
        ) : a?.resumo?.numeroUc ? (
          <div className="text-muted-foreground">{a.resumo.numeroUc}</div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="tabular text-sm">
        {formatarCompetencia(a?.resumo?.competencia)}
      </TableCell>
      <TableCell className="tabular text-right text-sm">
        {formatarMoeda(a?.resumo?.valorTotal)}
      </TableCell>
      <TableCell className="tabular text-right text-sm">
        {formatarKwh(a?.resumo?.consumoKwh)}
      </TableCell>
      <TableCell className="min-w-[220px] text-sm">
        {r ? (
          <Badge variant="outline" className={RESULTADO[r.status].classe}>
            {RESULTADO[r.status].rotulo}
          </Badge>
        ) : item.erroLocal ? (
          <Badge variant="outline" className={SITUACAO.invalido.classe}>
            Rejeitado
          </Badge>
        ) : a ? (
          <Badge variant="outline" className={SITUACAO[a.situacao].classe}>
            {SITUACAO[a.situacao].rotulo}
          </Badge>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {r ? (
            r.faturaId &&
            (r.status === "importada" ||
              r.status === "pendente_identificacao" ||
              r.status === "duplicada") ? (
              <Link to="/faturas/$id" params={{ id: r.faturaId }} className="underline">
                {r.mensagem}
              </Link>
            ) : (
              r.mensagem
            )
          ) : (
            (item.erroLocal ?? a?.mensagem)
          )}
        </p>
        {avisos.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-1 text-xs text-warning-foreground underline decoration-dotted"
              >
                <AlertTriangle className="h-3 w-3" /> {avisos.length} aviso(s)
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm text-xs">
              <ul className="list-disc space-y-1 pl-4">
                {avisos.map((av) => (
                  <li key={av}>{av}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
      </TableCell>
    </TableRow>
  );
}
