import { createFileRoute, Link } from "@tanstack/react-router";
import { FileDown } from "lucide-react";
import { useMemo } from "react";

import { CabecalhoPagina, Carregando, EstadoVazio, MensagemErro } from "@/components/app/comuns";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { useFaturasLista, type FaturaLista } from "@/components/faturas/lista";
import { Button } from "@/components/ui/button";
import { mensagemErro } from "@/lib/consultas";

export const Route = createFileRoute("/_app/download-fatura/")({
  head: () => ({ meta: [{ title: "Download fatura — Controle Energia" }] }),
  component: PaginaDownloadFatura,
});

function PaginaDownloadFatura() {
  const { data, isLoading, error } = useFaturasLista();
  const faturas = useMemo(
    () =>
      (data ?? []).filter(
        (f) => !f.excluida && f.arquivo_xml_path && f.tipo_documento !== "evento",
      ),
    [data],
  );

  const colunas: Coluna<FaturaLista>[] = [
    {
      id: "competencia",
      titulo: "Competência",
      tipo: "competencia",
      valor: (f) => f.periodo_referencia,
    },
    {
      id: "numero",
      titulo: "Nº documento",
      valor: (f) => f.numero_documento,
      celula: (f) => (
        <span className="font-medium">
          {f.numero_documento ?? "—"}
          {f.serie && <span className="text-muted-foreground">/{f.serie}</span>}
        </span>
      ),
    },
    { id: "uc", titulo: "UC", valor: (f) => f.uc?.numero_uc ?? f.numero_uc_extraido },
    { id: "fazenda", titulo: "Fazenda", valor: (f) => f.uc?.fazenda ?? null },
    { id: "area", titulo: "Área", valor: (f) => f.uc?.area ?? null },
    { id: "vencimento", titulo: "Vencimento", tipo: "data", valor: (f) => f.data_vencimento },
    { id: "valor", titulo: "Valor faturado", tipo: "moeda", valor: (f) => f.valor_total },
    {
      id: "acao",
      titulo: "",
      valor: () => null,
      semOrdenacao: true,
      celula: (f) => (
        <Button asChild size="sm" variant="outline">
          <Link to="/download-fatura/$id" params={{ id: f.id }}>
            <FileDown className="mr-1.5 h-4 w-4" /> Abrir / Baixar PDF
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <CabecalhoPagina
        titulo="Download fatura"
        descricao="Fatura no layout da conta de energia (DANF3E), montada a partir do XML da NF3e. Abra a fatura e use “Baixar PDF” (Salvar como PDF na janela de impressão)."
      />
      {error ? (
        <MensagemErro erro={mensagemErro(error, "Não foi possível carregar as faturas.")} />
      ) : isLoading ? (
        <Carregando />
      ) : !faturas.length ? (
        <EstadoVazio
          icone={FileDown}
          titulo="Nenhuma fatura com XML disponível"
          descricao="As faturas importadas aparecem aqui para download."
        />
      ) : (
        <TabelaDados
          dados={faturas}
          colunas={colunas}
          chave={(f) => f.id}
          nomeExportacao="faturas-download"
          placeholderBusca="Buscar UC, fazenda, nº do documento…"
          ordenacaoInicial={{ id: "competencia", direcao: "desc" }}
        />
      )}
    </div>
  );
}
