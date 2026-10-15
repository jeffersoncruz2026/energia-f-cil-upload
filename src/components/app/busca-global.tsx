import { useNavigate } from "@tanstack/react-router";
import { Building2, FileText, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { formatarCnpj, formatarCompetencia, formatarMoeda } from "@/lib/formatacao";

interface ResultadoUc {
  id: string;
  numero_uc: string;
  fazenda: string;
  cnpj: string;
  filial: string | null;
}
interface ResultadoFatura {
  id: string;
  numero_documento: string | null;
  numero_uc_extraido: string | null;
  periodo_referencia: string | null;
  valor_total: number | null;
}

/** Remove caracteres com significado especial nos filtros do PostgREST. */
function sanitizar(t: string) {
  return t.replace(/[,()*%\\:"']/g, " ").trim();
}

export function BuscaGlobal() {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [ucs, setUcs] = useState<ResultadoUc[]>([]);
  const [faturas, setFaturas] = useState<ResultadoFatura[]>([]);
  const [buscando, setBuscando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAberto((v) => !v);
      }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  useEffect(() => {
    const t = sanitizar(termo);
    if (t.length < 2) {
      setUcs([]);
      setFaturas([]);
      return;
    }
    let ativo = true;
    setBuscando(true);
    const digitos = t.replace(/\D/g, "");
    const timer = setTimeout(async () => {
      const filtrosUc = [`numero_uc.ilike.%${t}%`, `fazenda.ilike.%${t}%`, `filial.ilike.%${t}%`];
      if (digitos.length >= 3)
        filtrosUc.push(`cnpj.ilike.%${digitos}%`, `numero_uc_normalizado.ilike.%${digitos}%`);
      const filtrosFat = [`numero_documento.ilike.%${t}%`, `numero_uc_extraido.ilike.%${t}%`];
      if (digitos.length >= 6) filtrosFat.push(`chave_acesso.ilike.%${digitos}%`);
      const [r1, r2] = await Promise.all([
        supabase
          .from("unidades_consumidoras")
          .select("id, numero_uc, fazenda, cnpj, filial")
          .or(filtrosUc.join(","))
          .limit(8),
        supabase
          .from("faturas")
          .select("id, numero_documento, numero_uc_extraido, periodo_referencia, valor_total")
          .eq("excluida", false)
          .or(filtrosFat.join(","))
          .order("periodo_referencia", { ascending: false })
          .limit(8),
      ]);
      if (!ativo) return;
      setUcs((r1.data as ResultadoUc[]) ?? []);
      setFaturas((r2.data as ResultadoFatura[]) ?? []);
      setBuscando(false);
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [termo]);

  const ir = (fn: () => void) => {
    setAberto(false);
    setTermo("");
    fn();
  };

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-full justify-start gap-2 text-sm font-normal text-muted-foreground sm:w-72"
        onClick={() => setAberto(true)}
      >
        <Search className="h-4 w-4" />
        <span className="truncate">Buscar UC, fazenda, CNPJ ou fatura…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] font-medium md:inline">
          Ctrl K
        </kbd>
      </Button>
      <CommandDialog open={aberto} onOpenChange={setAberto} shouldFilter={false}>
        <CommandInput
          placeholder="Número da UC, fazenda, CNPJ ou número da fatura…"
          value={termo}
          onValueChange={setTermo}
        />
        <CommandList>
          <CommandEmpty>
            {termo.trim().length < 2
              ? "Digite ao menos 2 caracteres."
              : buscando
                ? "Buscando…"
                : "Nenhum resultado."}
          </CommandEmpty>
          {ucs.length > 0 && (
            <CommandGroup heading="Unidades consumidoras">
              {ucs.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`uc-${u.id}`}
                  onSelect={() => ir(() => navigate({ to: "/unidades/$id", params: { id: u.id } }))}
                >
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      UC {u.numero_uc} — {u.fazenda}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatarCnpj(u.cnpj)} {u.filial ? `· ${u.filial}` : ""}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {faturas.length > 0 && (
            <CommandGroup heading="Faturas">
              {faturas.map((f) => (
                <CommandItem
                  key={f.id}
                  value={`fat-${f.id}`}
                  onSelect={() => ir(() => navigate({ to: "/faturas/$id", params: { id: f.id } }))}
                >
                  <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      Fatura nº {f.numero_documento ?? "—"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      UC {f.numero_uc_extraido ?? "—"} · {formatarCompetencia(f.periodo_referencia)}{" "}
                      · {formatarMoeda(f.valor_total)}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
