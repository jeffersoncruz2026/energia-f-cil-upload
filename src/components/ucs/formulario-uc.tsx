import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { invalidarDados, mensagemErro, useConfiguracoes } from "@/lib/consultas";
import { canonizarArea, chaveTexto, listaAreas } from "@/lib/areas";
import { cnpjValido, normalizarCnpj, normalizarUc } from "@/lib/documentos";
import { formatarCnpj } from "@/lib/formatacao";
import { AREAS_PADRAO, type SituacaoUc, type UnidadeConsumidora } from "@/lib/tipos";

interface Valores {
  numero_uc: string;
  fazenda: string;
  cnpj: string;
  endereco: string;
  filial: string;
  area: string;
  situacao: SituacaoUc;
  observacoes: string;
}

const VAZIO: Valores = {
  numero_uc: "",
  fazenda: "",
  cnpj: "",
  endereco: "",
  filial: "",
  area: "",
  situacao: "ativa",
  observacoes: "",
};

export function FormularioUc({
  aberto,
  aoFechar,
  uc,
  existentes,
  valoresIniciais,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  uc?: UnidadeConsumidora | null;
  existentes: UnidadeConsumidora[];
  valoresIniciais?: Partial<Valores> | undefined;
  aoSalvar?: (uc: UnidadeConsumidora) => void;
}) {
  const qc = useQueryClient();
  const { data: cfg } = useConfiguracoes();
  const [v, setV] = useState<Valores>(VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof Valores, string>>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setV(
      uc
        ? {
            numero_uc: uc.numero_uc,
            fazenda: uc.fazenda,
            cnpj: formatarCnpj(uc.cnpj),
            endereco: uc.endereco ?? "",
            filial: uc.filial ?? "",
            area: uc.area ?? "",
            situacao: uc.situacao,
            observacoes: uc.observacoes ?? "",
          }
        : { ...VAZIO, ...valoresIniciais },
    );
  }, [aberto, uc, valoresIniciais]);

  const fazendas = useMemo(
    () => [...new Set(existentes.map((u) => u.fazenda))].sort(),
    [existentes],
  );
  const areasExistentes = useMemo(() => existentes.map((u) => u.area), [existentes]);
  const areas = useMemo(
    () => listaAreas(cfg?.cadastro.areas ?? AREAS_PADRAO, areasExistentes),
    [cfg, areasExistentes],
  );
  const filiais = useMemo(
    () => [...new Set(existentes.map((u) => u.filial).filter((f): f is string => !!f))].sort(),
    [existentes],
  );

  const validar = (): boolean => {
    const e: Partial<Record<keyof Valores, string>> = {};
    const norm = normalizarUc(v.numero_uc);
    if (!norm) e.numero_uc = "Informe o número da UC.";
    else if (existentes.some((u) => u.numero_uc_normalizado === norm && u.id !== uc?.id)) {
      e.numero_uc = "Já existe uma UC cadastrada com este número.";
    }
    if (!v.fazenda.trim()) e.fazenda = "Informe a fazenda.";
    if (!normalizarCnpj(v.cnpj)) e.cnpj = "Informe o CNPJ.";
    else if (!cnpjValido(v.cnpj)) e.cnpj = "CNPJ inválido (dígitos verificadores não conferem).";
    if (cfg?.cadastro.filial_obrigatoria && !v.filial.trim()) e.filial = "Informe a filial.";
    if (cfg?.cadastro.area_obrigatoria && !v.area.trim()) e.area = "Informe a área.";
    if (cfg?.cadastro.endereco_obrigatorio && !v.endereco.trim())
      e.endereco = "Informe o endereço.";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validar()) return;
    setSalvando(true);
    const registro = {
      numero_uc: v.numero_uc.trim(),
      fazenda: v.fazenda.trim(),
      cnpj: normalizarCnpj(v.cnpj),
      endereco: v.endereco.trim() || null,
      filial: v.filial.trim() || null,
      area: canonizarArea(v.area, cfg?.cadastro.areas ?? AREAS_PADRAO, areasExistentes),
      situacao: v.situacao,
      observacoes: v.observacoes.trim() || null,
    };
    const q = uc
      ? supabase.from("unidades_consumidoras").update(registro).eq("id", uc.id).select().single()
      : supabase.from("unidades_consumidoras").insert(registro).select().single();
    const { data, error } = await q;
    setSalvando(false);
    if (error) {
      toast.error(mensagemErro(error, "Não foi possível salvar a unidade consumidora."));
      return;
    }
    toast.success(uc ? "Unidade consumidora atualizada." : "Unidade consumidora cadastrada.");
    await invalidarDados(qc);
    aoSalvar?.(data as UnidadeConsumidora);
    aoFechar();
  };

  const campo = (k: keyof Valores) => ({
    value: v[k],
    onChange: (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value })),
    "aria-invalid": !!erros[k],
  });

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {uc ? "Editar unidade consumidora" : "Nova unidade consumidora"}
          </DialogTitle>
          <DialogDescription>
            O número da UC é o identificador usado para associar automaticamente as faturas
            importadas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Campo rotulo="Número da UC *" erro={erros.numero_uc}>
            <Input {...campo("numero_uc")} placeholder="Ex.: 000123456" autoFocus />
          </Campo>
          <Campo rotulo="CNPJ *" erro={erros.cnpj}>
            <Input
              {...campo("cnpj")}
              placeholder="00.000.000/0000-00"
              onBlur={() =>
                cnpjValido(v.cnpj) &&
                setV((s) => ({ ...s, cnpj: formatarCnpj(normalizarCnpj(s.cnpj)) }))
              }
            />
          </Campo>
          <Campo rotulo="Fazenda *" erro={erros.fazenda} className="sm:col-span-2">
            <Input
              {...campo("fazenda")}
              list="lista-fazendas"
              placeholder="Nome da fazenda ou propriedade"
            />
            <datalist id="lista-fazendas">
              {fazendas.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Campo>
          <Campo
            rotulo={`Filial${cfg?.cadastro.filial_obrigatoria ? " *" : ""}`}
            erro={erros.filial}
          >
            <Input {...campo("filial")} list="lista-filiais" />
            <datalist id="lista-filiais">
              {filiais.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Campo>
          <Campo rotulo="Situação">
            <Select
              value={v.situacao}
              onValueChange={(s) => setV((x) => ({ ...x, situacao: s as SituacaoUc }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="inativa">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo
            rotulo={`Área${cfg?.cadastro.area_obrigatoria ? " *" : ""}`}
            erro={erros.area}
            className="sm:col-span-2"
          >
            <Input
              {...campo("area")}
              list="lista-areas"
              placeholder="Ex.: Agrícola, Pecuária, Seringal, Administrativo, Oficina"
            />
            <datalist id="lista-areas">
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {areas.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setV((x) => ({ ...x, area: a }))}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    chaveTexto(v.area) === chaveTexto(a)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </Campo>
          <Campo
            rotulo={`Endereço${cfg?.cadastro.endereco_obrigatorio ? " *" : ""}`}
            erro={erros.endereco}
            className="sm:col-span-2"
          >
            <Input {...campo("endereco")} />
          </Campo>
          <Campo rotulo="Observações" className="sm:col-span-2">
            <Textarea {...campo("observacoes")} rows={3} />
          </Campo>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  rotulo,
  erro,
  children,
  className,
}: {
  rotulo: string;
  erro?: string | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{rotulo}</Label>
      {children}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
