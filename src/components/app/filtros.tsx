import { Check, ChevronsUpDown, X } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Filtros } from "@/lib/analise/calculos";
import { formatarCnpj } from "@/lib/formatacao";
import type { UnidadeConsumidora } from "@/lib/tipos";
import { cn } from "@/lib/utils";

export function MultiSelecao({
  rotulo,
  opcoes,
  valores,
  aoMudar,
}: {
  rotulo: string;
  opcoes: { valor: string; rotulo: string; detalhe?: string }[];
  valores: string[];
  aoMudar: (v: string[]) => void;
}) {
  const alternar = (v: string) =>
    aoMudar(valores.includes(v) ? valores.filter((x) => x !== v) : [...valores, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 justify-between gap-1 font-normal">
          <span className="truncate">{rotulo}</span>
          {valores.length > 0 && (
            <Badge variant="secondary" className="rounded-sm px-1.5 text-[10px]">
              {valores.length}
            </Badge>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${rotulo.toLowerCase()}…`} />
          <CommandList className="max-h-64">
            <CommandEmpty>Nenhuma opção.</CommandEmpty>
            <CommandGroup>
              {opcoes.map((o) => (
                <CommandItem
                  key={o.valor}
                  value={`${o.rotulo} ${o.detalhe ?? ""}`}
                  onSelect={() => alternar(o.valor)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      valores.includes(o.valor) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="truncate">{o.rotulo}</div>
                    {o.detalhe && (
                      <div className="truncate text-xs text-muted-foreground">{o.detalhe}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {valores.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => aoMudar([])}>
                Limpar seleção
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function BarraFiltros({
  filtros,
  aoMudar,
  ucs,
  ocultar = [],
}: {
  filtros: Filtros;
  aoMudar: (f: Filtros) => void;
  ucs: UnidadeConsumidora[];
  ocultar?: ("ucs" | "situacao" | "criterio")[];
}) {
  const opcoes = useMemo(() => {
    const unicos = (l: (string | null)[]) =>
      [...new Set(l.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      fazendas: unicos(ucs.map((u) => u.fazenda)).map((f) => ({ valor: f, rotulo: f })),
      filiais: unicos(ucs.map((u) => u.filial)).map((f) => ({ valor: f, rotulo: f })),
      cnpjs: unicos(ucs.map((u) => u.cnpj)).map((c) => ({ valor: c, rotulo: formatarCnpj(c) })),
      ucs: ucs
        .filter((u) => !filtros.fazendas.length || filtros.fazendas.includes(u.fazenda))
        .map((u) => ({
          valor: u.id,
          rotulo: `UC ${u.numero_uc}`,
          detalhe: `${u.fazenda}${u.filial ? ` · ${u.filial}` : ""}`,
        })),
    };
  }, [ucs, filtros.fazendas]);

  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => aoMudar({ ...filtros, [k]: v });
  const ativos =
    filtros.fazendas.length +
    filtros.ucs.length +
    filtros.filiais.length +
    filtros.cnpjs.length +
    (filtros.situacao !== "todas" ? 1 : 0);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Período</Label>
        <div className="flex items-center gap-1">
          <Input
            type="month"
            className="h-9 w-[150px]"
            value={filtros.inicio ?? ""}
            max={filtros.fim ?? undefined}
            onChange={(e) => set("inicio", e.target.value || null)}
            aria-label="Mês inicial"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="month"
            className="h-9 w-[150px]"
            value={filtros.fim ?? ""}
            min={filtros.inicio ?? undefined}
            onChange={(e) => set("fim", e.target.value || null)}
            aria-label="Mês final"
          />
        </div>
      </div>
      {!ocultar.includes("criterio") && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Consolidar por</Label>
          <Select
            value={filtros.criterio}
            onValueChange={(v) => set("criterio", v as Filtros["criterio"])}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="competencia">Competência</SelectItem>
              <SelectItem value="emissao">Data de emissão</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <MultiSelecao
        rotulo="Fazenda"
        opcoes={opcoes.fazendas}
        valores={filtros.fazendas}
        aoMudar={(v) => set("fazendas", v)}
      />
      {!ocultar.includes("ucs") && (
        <MultiSelecao
          rotulo="Unidade consumidora"
          opcoes={opcoes.ucs}
          valores={filtros.ucs}
          aoMudar={(v) => set("ucs", v)}
        />
      )}
      <MultiSelecao
        rotulo="Filial"
        opcoes={opcoes.filiais}
        valores={filtros.filiais}
        aoMudar={(v) => set("filiais", v)}
      />
      <MultiSelecao
        rotulo="CNPJ"
        opcoes={opcoes.cnpjs}
        valores={filtros.cnpjs}
        aoMudar={(v) => set("cnpjs", v)}
      />
      {!ocultar.includes("situacao") && (
        <Select
          value={filtros.situacao}
          onValueChange={(v) => set("situacao", v as Filtros["situacao"])}
        >
          <SelectTrigger className="h-9 w-[150px]" aria-label="Situação da UC">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">UCs: todas</SelectItem>
            <SelectItem value="ativa">UCs ativas</SelectItem>
            <SelectItem value="inativa">UCs inativas</SelectItem>
          </SelectContent>
        </Select>
      )}
      {ativos > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() =>
            aoMudar({
              ...filtros,
              fazendas: [],
              ucs: [],
              filiais: [],
              cnpjs: [],
              situacao: "todas",
            })
          }
        >
          <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
        </Button>
      )}
    </div>
  );
}
