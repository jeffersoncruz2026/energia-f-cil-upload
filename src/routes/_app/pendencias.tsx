import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Eye,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina, Carregando, EstadoVazio, MensagemErro } from "@/components/app/comuns";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { AssociarUc } from "@/components/faturas/associar-uc";
import { useFaturasLista, type FaturaLista } from "@/components/faturas/lista";
import { FormularioUc } from "@/components/ucs/formulario-uc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { invalidarDados, mensagemErro, useUcs } from "@/lib/consultas";
import { cnpjValido } from "@/lib/documentos";
import { formatarCnpj } from "@/lib/formatacao";
import { recalcularAlertas, reprocessarFatura } from "@/backend/faturas.functions";

export const Route = createFileRoute("/_app/pendencias")({
  head: () => ({ meta: [{ title: "Pendências de Identificação — Controle Energia" }] }),
  component: PaginaPendencias,
});

function PaginaPendencias() {
  const { data, isLoading, error } = useFaturasLista();
  const { data: ucs } = useUcs();
  const { pode } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reprocessar = useServerFn(reprocessarFatura);
  const recalcular = useServerFn(recalcularAlertas);
  const [associar, setAssociar] = useState<FaturaLista | null>(null);
  const [cadastrar, setCadastrar] = useState<FaturaLista | null>(null);
  const [reidentificando, setReidentificando] = useState(false);

  const pendentes = useMemo(
    () =>
      (data ?? []).filter(
        (f) => f.status_processamento === "pendente_identificacao" && !f.excluida,
      ),
    [data],
  );

  const valoresNovaUc = useMemo(
    () =>
      cadastrar
        ? {
            numero_uc: cadastrar.numero_uc_extraido ?? "",
            cnpj:
              cadastrar.cnpj_destinatario && cnpjValido(cadastrar.cnpj_destinatario)
                ? formatarCnpj(cadastrar.cnpj_destinatario)
                : "",
          }
        : undefined,
    [cadastrar],
  );

  const reidentificar = async (silencioso = false) => {
    setReidentificando(true);
    const { data: r, error: e } = await supabase.rpc("reidentificar_pendentes");
    setReidentificando(false);
    if (e) {
      toast.error(mensagemErro(e));
      return;
    }
    const qtd = (r as { associadas: number }).associadas;
    if (qtd > 0) {
      await recalcular().catch(() => undefined);
      toast.success(`${qtd} fatura(s) associada(s) automaticamente pelo número da UC.`);
    } else if (!silencioso) {
      toast.info("Nenhuma fatura pendente corresponde às UCs cadastradas.");
    }
    await invalidarDados(qc);
  };

  const colunas: Coluna<FaturaLista>[] = [
    {
      id: "uc",
      titulo: "UC no XML",
      valor: (f) => f.numero_uc_extraido,
      celula: (f) => (
        <span className="font-medium">{f.numero_uc_extraido ?? "não identificada"}</span>
      ),
    },
    { id: "dest", titulo: "Destinatário", valor: (f) => f.nome_destinatario },
    {
      id: "cnpj",
      titulo: "CNPJ/CPF",
      valor: (f) => (f.cnpj_destinatario ? formatarCnpj(f.cnpj_destinatario) : null),
    },
    {
      id: "competencia",
      titulo: "Competência",
      tipo: "competencia",
      valor: (f) => f.periodo_referencia,
    },
    { id: "numero", titulo: "Nº documento", valor: (f) => f.numero_documento },
    { id: "fornecedor", titulo: "Fornecedor", valor: (f) => f.nome_fornecedor },
    { id: "valor", titulo: "Valor", tipo: "moeda", valor: (f) => f.valor_total },
    { id: "consumo", titulo: "Consumo", tipo: "kwh", valor: (f) => f.consumo_kwh },
    { id: "arquivo", titulo: "Arquivo", valor: (f) => f.nome_arquivo, oculta: true },
    { id: "importada", titulo: "Importada em", tipo: "datahora", valor: (f) => f.created_at },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Pendências de Identificação"
        descricao="Faturas cuja UC não foi encontrada no cadastro. Elas não compõem os indicadores até serem associadas. A associação nunca é feita apenas pelo CNPJ, pois um CNPJ pode ter várias UCs."
        acoes={
          pode("importar") && (
            <Button
              variant="outline"
              onClick={() => void reidentificar()}
              disabled={reidentificando || !pendentes.length}
            >
              {reidentificando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ScanSearch className="mr-2 h-4 w-4" />
              )}
              Reprocessar identificação
            </Button>
          )
        }
      />
      {error ? (
        <MensagemErro erro={mensagemErro(error)} />
      ) : isLoading ? (
        <Carregando />
      ) : !pendentes.length ? (
        <EstadoVazio
          icone={CheckCircle2}
          titulo="Nenhuma pendência"
          descricao="Todas as faturas importadas estão associadas a unidades consumidoras."
        />
      ) : (
        <TabelaDados
          dados={pendentes}
          colunas={colunas}
          chave={(f) => f.id}
          nomeExportacao="pendencias-identificacao"
          ordenacaoInicial={{ id: "importada", direcao: "desc" }}
          aoClicarLinha={(f) => navigate({ to: "/faturas/$id", params: { id: f.id } })}
          acoesLinha={(f) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/faturas/$id", params: { id: f.id } })}
                >
                  <Eye className="mr-2 h-4 w-4" /> Ver dados extraídos e XML
                </DropdownMenuItem>
                {pode("importar") && (
                  <DropdownMenuItem onClick={() => setAssociar(f)}>
                    <Link2 className="mr-2 h-4 w-4" /> Selecionar UC existente
                  </DropdownMenuItem>
                )}
                {pode("cadastrar") && (
                  <DropdownMenuItem onClick={() => setCadastrar(f)}>
                    <Plus className="mr-2 h-4 w-4" /> Cadastrar nova UC
                  </DropdownMenuItem>
                )}
                {pode("importar") && (
                  <DropdownMenuItem
                    onClick={async () => {
                      try {
                        const r = await reprocessar({ data: { faturaId: f.id } });
                        toast.success(r.mensagem);
                        await invalidarDados(qc);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Falha ao reprocessar.");
                      }
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Reprocessar XML
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      )}

      {associar && (
        <AssociarUc
          aberto
          aoFechar={() => {
            setAssociar(null);
            void recalcular().catch(() => undefined);
          }}
          faturaId={associar.id}
          numeroUcXml={associar.numero_uc_extraido}
          cnpjXml={associar.cnpj_destinatario}
        />
      )}
      <FormularioUc
        aberto={!!cadastrar}
        aoFechar={() => setCadastrar(null)}
        existentes={ucs ?? []}
        valoresIniciais={valoresNovaUc}
        aoSalvar={() => void reidentificar(true)}
      />
    </div>
  );
}
