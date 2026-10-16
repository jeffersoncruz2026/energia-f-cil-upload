import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { CabecalhoPagina, Carregando, EstadoVazio, MensagemErro } from "@/components/app/comuns";
import { TabelaDados } from "@/components/app/tabela-dados";
import { colunasFatura, useFaturasLista } from "@/components/faturas/lista";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mensagemErro } from "@/lib/consultas";
import { ehAmbienteEdicao } from "@/lib/ambiente";

export const Route = createFileRoute("/_app/faturas/")({
  head: () => ({ meta: [{ title: "Faturas — Controle Energia" }] }),
  component: PaginaFaturas,
});

type FiltroStatus = "validas" | "todas" | "pendentes" | "canceladas" | "divergencias" | "excluidas";

function PaginaFaturas() {
  const { data, isLoading, error } = useFaturasLista();
  const navigate = useNavigate();
  const [status, setStatus] = useState<FiltroStatus>("validas");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  const filtradas = useMemo(() => {
    return (data ?? []).filter((f) => {
      if (status === "excluidas") {
        if (!f.excluida) return false;
      } else if (f.excluida) return false;
      if (
        status === "validas" &&
        (f.status_documento === "cancelada" ||
          f.status_documento === "substituida" ||
          !f.unidade_consumidora_id)
      )
        return false;
      if (status === "pendentes" && f.status_processamento !== "pendente_identificacao")
        return false;
      if (
        status === "canceladas" &&
        f.status_documento !== "cancelada" &&
        f.status_documento !== "substituida"
      )
        return false;
      if (
        status === "divergencias" &&
        !(f.divergencias?.length > 0 || f.status_documento === "sem_protocolo")
      )
        return false;
      const mes = f.periodo_referencia?.slice(0, 7) ?? "";
      if (inicio && (!mes || mes < inicio)) return false;
      if (fim && (!mes || mes > fim)) return false;
      return true;
    });
  }, [data, status, inicio, fim]);

  return (
    <div>
      <CabecalhoPagina
        titulo="Faturas"
        descricao="Documentos fiscais importados. O valor faturado não é considerado pago até a confirmação do pagamento."
        acoes={
          ehAmbienteEdicao() && (
            <Button asChild>
              <Link to="/importar">
                <Upload className="mr-2 h-4 w-4" /> Importar XML
              </Link>
            </Button>
          )
        }
      />
      {error ? (
        <MensagemErro erro={mensagemErro(error, "Não foi possível carregar as faturas.")} />
      ) : isLoading ? (
        <Carregando />
      ) : !data?.length ? (
        <EstadoVazio
          icone={FileText}
          titulo="Nenhuma fatura importada"
          descricao="Importe os XMLs das contas de energia para começar."
          acao={
            ehAmbienteEdicao() && (
              <Button asChild>
                <Link to="/importar">Importar XML</Link>
              </Button>
            )
          }
        />
      ) : (
        <TabelaDados
          dados={filtradas}
          colunas={colunasFatura()}
          chave={(f) => f.id}
          nomeExportacao="faturas"
          placeholderBusca="Buscar por número, UC, fazenda…"
          ordenacaoInicial={{ id: "competencia", direcao: "desc" }}
          aoClicarLinha={(f) => navigate({ to: "/faturas/$id", params: { id: f.id } })}
          barraExtra={
            <>
              <Select value={status} onValueChange={(v) => setStatus(v as FiltroStatus)}>
                <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar situação">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="validas">Válidas (compõem indicadores)</SelectItem>
                  <SelectItem value="todas">Todas (não excluídas)</SelectItem>
                  <SelectItem value="pendentes">Pendentes de identificação</SelectItem>
                  <SelectItem value="divergencias">Com divergências/sem protocolo</SelectItem>
                  <SelectItem value="canceladas">Canceladas/substituídas</SelectItem>
                  <SelectItem value="excluidas">Excluídas</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1 text-xs text-muted-foreground sm:flex sm:w-auto">
                <Input
                  type="month"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="w-full min-w-0 sm:w-36"
                  aria-label="Competência inicial"
                />
                até
                <Input
                  type="month"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                  className="w-full min-w-0 sm:w-36"
                  aria-label="Competência final"
                />
              </div>
            </>
          }
        />
      )}
    </div>
  );
}
