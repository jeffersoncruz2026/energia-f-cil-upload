import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Eye,
  FileSpreadsheet,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  BadgeSituacao,
  CabecalhoPagina,
  Carregando,
  EstadoVazio,
  MensagemErro,
} from "@/components/app/comuns";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { FormularioUc } from "@/components/ucs/formulario-uc";
import { ImportarPlanilha } from "@/components/ucs/importar-planilha";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { invalidarDados, mensagemErro, useFaturasAnalise, useUcs } from "@/lib/consultas";
import { formatarCnpj } from "@/lib/formatacao";
import type { UnidadeConsumidora } from "@/lib/tipos";

export const Route = createFileRoute("/_app/unidades/")({
  head: () => ({ meta: [{ title: "Unidades Consumidoras — Controle Energia" }] }),
  component: PaginaUnidades,
});

function PaginaUnidades() {
  const { data: ucs, isLoading, error } = useUcs();
  const { data: faturas } = useFaturasAnalise();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<UnidadeConsumidora | null>(null);
  const [importando, setImportando] = useState(false);
  const [situacao, setSituacao] = useState<"todas" | "ativa" | "inativa">("todas");
  const [confirmar, setConfirmar] = useState<{
    tipo: "situacao" | "excluir";
    uc: UnidadeConsumidora;
  } | null>(null);

  const qtdFaturas = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of faturas ?? []) {
      if (f.unidade_consumidora_id)
        m.set(f.unidade_consumidora_id, (m.get(f.unidade_consumidora_id) ?? 0) + 1);
    }
    return m;
  }, [faturas]);

  const dados = useMemo(
    () => (ucs ?? []).filter((u) => situacao === "todas" || u.situacao === situacao),
    [ucs, situacao],
  );

  const colunas: Coluna<UnidadeConsumidora>[] = [
    {
      id: "numero_uc",
      titulo: "Número da UC",
      valor: (u) => u.numero_uc,
      celula: (u) => <span className="font-medium">{u.numero_uc}</span>,
    },
    { id: "fazenda", titulo: "Fazenda", valor: (u) => u.fazenda },
    { id: "cnpj", titulo: "CNPJ", valor: (u) => formatarCnpj(u.cnpj) },
    { id: "filial", titulo: "Filial", valor: (u) => u.filial },
    { id: "endereco", titulo: "Endereço", valor: (u) => u.endereco, classe: "max-w-xs truncate" },
    {
      id: "situacao",
      titulo: "Situação",
      valor: (u) => (u.situacao === "ativa" ? "Ativa" : "Inativa"),
      celula: (u) => <BadgeSituacao situacao={u.situacao} />,
    },
    { id: "faturas", titulo: "Faturas", tipo: "numero", valor: (u) => qtdFaturas.get(u.id) ?? 0 },
    { id: "observacoes", titulo: "Observações", valor: (u) => u.observacoes, oculta: true },
    {
      id: "updated_at",
      titulo: "Atualizado em",
      tipo: "datahora",
      valor: (u) => u.updated_at,
      oculta: true,
    },
  ];

  const executarConfirmacao = async () => {
    if (!confirmar) return;
    const { uc, tipo } = confirmar;
    setConfirmar(null);
    const { error } =
      tipo === "excluir"
        ? await supabase.from("unidades_consumidoras").delete().eq("id", uc.id)
        : await supabase
            .from("unidades_consumidoras")
            .update({ situacao: uc.situacao === "ativa" ? "inativa" : "ativa" })
            .eq("id", uc.id);
    if (error) {
      toast.error(
        error.code === "23503"
          ? "Esta UC possui faturas vinculadas e não pode ser excluída. Inative-a para preservar o histórico."
          : mensagemErro(error),
      );
      return;
    }
    toast.success(tipo === "excluir" ? "Unidade consumidora excluída." : "Situação atualizada.");
    await invalidarDados(qc);
  };

  return (
    <div>
      <CabecalhoPagina
        titulo="Unidades Consumidoras"
        descricao="Cadastro das UCs da fazenda. O número da UC é a chave usada para associar as faturas importadas."
        acoes={
          pode("cadastrar") && (
            <>
              <Button variant="outline" onClick={() => setImportando(true)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Importar planilha
              </Button>
              <Button
                onClick={() => {
                  setEditando(null);
                  setFormAberto(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Nova UC
              </Button>
            </>
          )
        }
      />

      {error ? (
        <MensagemErro
          erro={mensagemErro(error, "Não foi possível carregar as unidades consumidoras.")}
        />
      ) : isLoading ? (
        <Carregando />
      ) : !ucs?.length ? (
        <EstadoVazio
          icone={Building2}
          titulo="Nenhuma unidade consumidora cadastrada"
          descricao="Cadastre manualmente ou importe uma planilha com as colunas Numero da UC, Fazenda, CNPJ, Endereço e Filial."
          acao={
            pode("cadastrar") && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportando(true)}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Importar planilha
                </Button>
                <Button onClick={() => setFormAberto(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Nova UC
                </Button>
              </div>
            )
          }
        />
      ) : (
        <TabelaDados
          dados={dados}
          colunas={colunas}
          chave={(u) => u.id}
          nomeExportacao="unidades-consumidoras"
          placeholderBusca="Buscar por UC, fazenda, CNPJ, filial…"
          ordenacaoInicial={{ id: "fazenda", direcao: "asc" }}
          aoClicarLinha={(u) => navigate({ to: "/unidades/$id", params: { id: u.id } })}
          barraExtra={
            <Select value={situacao} onValueChange={(v) => setSituacao(v as typeof situacao)}>
              <SelectTrigger className="w-40" aria-label="Filtrar por situação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as situações</SelectItem>
                <SelectItem value="ativa">Ativas</SelectItem>
                <SelectItem value="inativa">Inativas</SelectItem>
              </SelectContent>
            </Select>
          }
          acoesLinha={(u) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/unidades/$id", params: { id: u.id } })}
                >
                  <Eye className="mr-2 h-4 w-4" /> Ver análise
                </DropdownMenuItem>
                {pode("editar") && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditando(u);
                        setFormAberto(true);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConfirmar({ tipo: "situacao", uc: u })}>
                      <Power className="mr-2 h-4 w-4" />{" "}
                      {u.situacao === "ativa" ? "Inativar" : "Reativar"}
                    </DropdownMenuItem>
                  </>
                )}
                {pode("excluir") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setConfirmar({ tipo: "excluir", uc: u })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      )}

      <FormularioUc
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        uc={editando}
        existentes={ucs ?? []}
      />
      <ImportarPlanilha
        aberto={importando}
        aoFechar={() => setImportando(false)}
        existentes={ucs ?? []}
      />

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar?.tipo === "excluir"
                ? "Excluir unidade consumidora?"
                : confirmar?.uc.situacao === "ativa"
                  ? "Inativar unidade consumidora?"
                  : "Reativar unidade consumidora?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.tipo === "excluir"
                ? `A UC ${confirmar.uc.numero_uc} será removida definitivamente. Só é possível excluir UCs sem faturas vinculadas.`
                : `A UC ${confirmar?.uc.numero_uc} terá a situação alterada. O histórico de faturas é preservado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void executarConfirmacao()}
              className={
                confirmar?.tipo === "excluir"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
