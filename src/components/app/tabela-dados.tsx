import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  FileDown,
  FileSpreadsheet,
  Search,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatarCompetencia,
  formatarData,
  formatarDataHora,
  formatarKwh,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
} from "@/lib/formatacao";
import {
  exportarCsv,
  exportarXlsx,
  type ColunaExportacao,
  type TipoColuna,
} from "@/lib/planilha/arquivos";
import { cn } from "@/lib/utils";

export type TipoValor = TipoColuna | "competencia" | "datahora";

export interface Coluna<T> {
  id: string;
  titulo: string;
  tipo?: TipoValor;
  valor: (linha: T) => string | number | boolean | null | undefined;
  /** Renderização customizada (a exportação continua usando `valor`). */
  celula?: (linha: T) => ReactNode;
  alinhar?: "esquerda" | "direita" | "centro";
  oculta?: boolean;
  semOrdenacao?: boolean;
  classe?: string;
}

function formatar(tipo: TipoValor | undefined, v: unknown): ReactNode {
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  switch (tipo) {
    case "moeda":
      return formatarMoeda(v as number);
    case "kwh":
      return formatarKwh(v as number);
    case "numero":
      return formatarNumero(v as number, 0, 2);
    case "decimal4":
      return formatarNumero(v as number, 4);
    case "percentual":
      return formatarPercentual(v as number);
    case "data":
      return formatarData(v as string);
    case "datahora":
      return formatarDataHora(v as string);
    case "competencia":
      return formatarCompetencia(v as string);
    default:
      return typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v);
  }
}

function paraExportacao<T>(c: Coluna<T>): ColunaExportacao<T> {
  if (c.tipo === "competencia") {
    return {
      id: c.id,
      titulo: c.titulo,
      tipo: "texto",
      valor: (l) => {
        const v = c.valor(l);
        return typeof v === "string" ? formatarCompetencia(v) : v;
      },
    };
  }
  if (c.tipo === "datahora") {
    return {
      id: c.id,
      titulo: c.titulo,
      tipo: "texto",
      valor: (l) => {
        const v = c.valor(l);
        return typeof v === "string" ? formatarDataHora(v) : v;
      },
    };
  }
  return { id: c.id, titulo: c.titulo, tipo: c.tipo ?? "texto", valor: c.valor };
}

const numericos: TipoValor[] = ["moeda", "kwh", "numero", "decimal4", "percentual"];

export function TabelaDados<T>({
  dados,
  colunas,
  chave,
  nomeExportacao,
  busca = true,
  placeholderBusca = "Buscar…",
  vazio,
  aoClicarLinha,
  acoesLinha,
  ordenacaoInicial,
  porPagina = 50,
  barraExtra,
  rodape,
}: {
  dados: T[];
  colunas: Coluna<T>[];
  chave: (linha: T) => string;
  nomeExportacao?: string;
  busca?: boolean;
  placeholderBusca?: string;
  vazio?: ReactNode;
  aoClicarLinha?: (linha: T) => void;
  acoesLinha?: (linha: T) => ReactNode;
  ordenacaoInicial?: { id: string; direcao: "asc" | "desc" };
  porPagina?: number;
  barraExtra?: ReactNode;
  rodape?: ReactNode;
}) {
  const [termo, setTermo] = useState("");
  const [ordem, setOrdem] = useState(ordenacaoInicial ?? null);
  const [visiveis, setVisiveis] = useState<Set<string>>(
    () => new Set(colunas.filter((c) => !c.oculta).map((c) => c.id)),
  );
  const [pagina, setPagina] = useState(0);
  const [exportando, setExportando] = useState(false);

  const colunasVisiveis = colunas.filter((c) => visiveis.has(c.id));

  const filtrados = useMemo(() => {
    if (!termo.trim()) return dados;
    const t = termo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return dados.filter((l) =>
      colunas.some((c) => {
        const v = c.valor(l);
        if (v == null) return false;
        return String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(t);
      }),
    );
  }, [dados, termo, colunas]);

  const ordenados = useMemo(() => {
    if (!ordem) return filtrados;
    const col = colunas.find((c) => c.id === ordem.id);
    if (!col) return filtrados;
    const fator = ordem.direcao === "asc" ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      const va = col.valor(a);
      const vb = col.valor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * fator;
      return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * fator;
    });
  }, [filtrados, ordem, colunas]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const pagina_ = ordenados.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina);

  const alternarOrdem = (id: string) => {
    setOrdem((o) =>
      o?.id !== id ? { id, direcao: "asc" } : o.direcao === "asc" ? { id, direcao: "desc" } : null,
    );
  };

  const exportar = async (formato: "csv" | "xlsx") => {
    if (!nomeExportacao) return;
    const cols = colunasVisiveis.map(paraExportacao);
    const data = new Date().toISOString().slice(0, 10);
    try {
      setExportando(true);
      if (formato === "csv") exportarCsv(`${nomeExportacao}-${data}`, cols, ordenados);
      else await exportarXlsx(`${nomeExportacao}-${data}`, cols, ordenados);
      toast.success(`${ordenados.length} registro(s) exportado(s).`);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o arquivo de exportação.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {busca && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={termo}
                onChange={(e) => {
                  setTermo(e.target.value);
                  setPagina(0);
                }}
                placeholder={placeholderBusca}
                className="pl-8"
                aria-label="Buscar na tabela"
              />
            </div>
          )}
          {barraExtra}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="mr-1.5 h-4 w-4" /> Colunas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Colunas exibidas e exportadas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {colunas.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={visiveis.has(c.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) =>
                    setVisiveis((s) => {
                      const n = new Set(s);
                      if (v) n.add(c.id);
                      else if (n.size > 1) n.delete(c.id);
                      return n;
                    })
                  }
                >
                  {c.titulo}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {nomeExportacao && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={exportando || !ordenados.length}
                onClick={() => exportar("xlsx")}
              >
                <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exportando || !ordenados.length}
                onClick={() => exportar("csv")}
              >
                <FileDown className="mr-1.5 h-4 w-4" /> CSV
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                {colunasVisiveis.map((c) => {
                  const direita =
                    c.alinhar === "direita" || (!c.alinhar && c.tipo && numericos.includes(c.tipo));
                  const ativo = ordem?.id === c.id;
                  return (
                    <TableHead
                      key={c.id}
                      className={cn("whitespace-nowrap text-xs", direita && "text-right", c.classe)}
                    >
                      {c.semOrdenacao ? (
                        c.titulo
                      ) : (
                        <button
                          type="button"
                          onClick={() => alternarOrdem(c.id)}
                          className={cn(
                            "inline-flex items-center gap-1 font-medium hover:text-foreground",
                            direita && "flex-row-reverse",
                            ativo && "text-foreground",
                          )}
                        >
                          {c.titulo}
                          {ativo ? (
                            ordem!.direcao === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      )}
                    </TableHead>
                  );
                })}
                {acoesLinha && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagina_.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colunasVisiveis.length + (acoesLinha ? 1 : 0)}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {termo
                      ? "Nenhum registro corresponde à busca."
                      : (vazio ?? "Nenhum registro encontrado.")}
                  </TableCell>
                </TableRow>
              ) : (
                pagina_.map((l) => (
                  <TableRow
                    key={chave(l)}
                    className={cn(aoClicarLinha && "cursor-pointer")}
                    onClick={aoClicarLinha ? () => aoClicarLinha(l) : undefined}
                  >
                    {colunasVisiveis.map((c) => {
                      const direita =
                        c.alinhar === "direita" ||
                        (!c.alinhar && c.tipo && numericos.includes(c.tipo));
                      return (
                        <TableCell
                          key={c.id}
                          className={cn(
                            "tabular whitespace-nowrap py-2.5 text-sm",
                            direita && "text-right",
                            c.classe,
                          )}
                        >
                          {c.celula ? c.celula(l) : formatar(c.tipo, c.valor(l))}
                        </TableCell>
                      );
                    })}
                    {acoesLinha && (
                      <TableCell className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {acoesLinha(l)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {rodape}
      </div>

      <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
        <span>
          {ordenados.length} registro(s){termo && ` (de ${dados.length})`}
        </span>
        {totalPaginas > 1 && (
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual === 0}
              onClick={() => setPagina(paginaAtual - 1)}
            >
              Anterior
            </Button>
            <span>
              Página {paginaAtual + 1} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual >= totalPaginas - 1}
              onClick={() => setPagina(paginaAtual + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
