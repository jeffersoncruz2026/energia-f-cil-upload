import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { invalidarDados, mensagemErro, useUcs } from "@/lib/consultas";
import { formatarCnpj } from "@/lib/formatacao";
import { cn } from "@/lib/utils";

export function AssociarUc({
  aberto,
  aoFechar,
  faturaId,
  ucAtualId,
  numeroUcXml,
  cnpjXml,
}: {
  aberto: boolean;
  aoFechar: () => void;
  faturaId: string;
  ucAtualId?: string | null;
  numeroUcXml?: string | null;
  cnpjXml?: string | null;
}) {
  const { data: ucs } = useUcs();
  const qc = useQueryClient();
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!selecionada) return;
    setSalvando(true);
    const { error } = await supabase.rpc("associar_fatura_uc", {
      p_fatura_id: faturaId,
      p_uc_id: selecionada,
    });
    setSalvando(false);
    if (error) {
      toast.error(mensagemErro(error, "Não foi possível associar a fatura."));
      return;
    }
    toast.success("Fatura associada à unidade consumidora.");
    await invalidarDados(qc);
    setSelecionada(null);
    aoFechar();
  };

  const cnpjNorm = cnpjXml?.replace(/\W/g, "").toUpperCase();

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {ucAtualId ? "Corrigir associação" : "Selecionar unidade consumidora"}
          </DialogTitle>
          <DialogDescription>
            UC informada no XML: <strong>{numeroUcXml ?? "não identificada"}</strong>
            {cnpjXml && (
              <>
                {" "}
                · CNPJ/CPF do destinatário: <strong>{formatarCnpj(cnpjXml)}</strong>
              </>
            )}
            . A associação é registrada com divergência quando o número da UC não corresponde.
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-md border">
          <CommandInput placeholder="Buscar UC, fazenda, filial ou CNPJ…" />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhuma UC encontrada.</CommandEmpty>
            <CommandGroup>
              {(ucs ?? []).map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.numero_uc} ${u.fazenda} ${u.filial ?? ""} ${u.cnpj}`}
                  onSelect={() => setSelecionada(u.id)}
                  className={cn(u.id === ucAtualId && "opacity-60")}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selecionada === u.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      UC {u.numero_uc} — {u.fazenda}
                      {u.id === ucAtualId && " (atual)"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatarCnpj(u.cnpj)}
                      {cnpjNorm && cnpjNorm === u.cnpj && " · mesmo CNPJ do XML"}
                      {u.area && ` · ${u.area}`}
                      {u.filial && ` · ${u.filial}`}
                      {u.situacao === "inativa" && " · inativa"}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <p className="text-xs text-muted-foreground">
          Atenção: o mesmo CNPJ pode ter várias UCs. Confirme pelo número da UC e pelo endereço.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            onClick={() => void salvar()}
            disabled={!selecionada || selecionada === ucAtualId || salvando}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Associar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
