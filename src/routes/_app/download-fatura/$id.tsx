import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileDown } from "lucide-react";

import { Carregando, MensagemErro } from "@/components/app/comuns";
import { Danf3eDocumento } from "@/components/faturas/danf3e";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_XML } from "@/lib/configuracao-backend";
import { CHAVES, mensagemErro } from "@/lib/consultas";
import { montarDanf3e } from "@/lib/danf3e/montar";

export const Route = createFileRoute("/_app/download-fatura/$id")({
  head: () => ({ meta: [{ title: "Fatura (DANF3E) — Controle Energia" }] }),
  component: PaginaFaturaPdf,
});

function PaginaFaturaPdf() {
  const { id } = Route.useParams();
  const consulta = useQuery({
    queryKey: [...CHAVES.faturas, "danf3e", id],
    queryFn: async () => {
      const { data: f, error } = await supabase
        .from("faturas")
        .select("id, arquivo_xml_path, numero_documento, periodo_referencia")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!f?.arquivo_xml_path) throw new Error("XML original não disponível para esta fatura.");
      const { data: arquivo, error: errXml } = await supabase.storage
        .from(BUCKET_XML)
        .download(f.arquivo_xml_path);
      if (errXml || !arquivo) throw new Error("Não foi possível obter o XML original.");
      return { fatura: f, danf3e: montarDanf3e(await arquivo.text()) };
    },
  });

  const baixar = () => {
    // O nome sugerido do PDF vem do título da página
    const anterior = document.title;
    const d = consulta.data?.danf3e;
    if (d) document.title = `Fatura ${d.numeroUc} ${d.competencia ?? ""}`.trim();
    window.print();
    document.title = anterior;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/download-fatura">
            <ArrowLeft className="mr-1 h-4 w-4" /> Download fatura
          </Link>
        </Button>
        <Button onClick={baixar} disabled={!consulta.data}>
          <FileDown className="mr-1.5 h-4 w-4" /> Baixar PDF
        </Button>
      </div>
      {consulta.error ? (
        <MensagemErro erro={mensagemErro(consulta.error, "Não foi possível montar a fatura.")} />
      ) : consulta.isLoading || !consulta.data ? (
        <Carregando />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <Danf3eDocumento d={consulta.data.danf3e} />
        </div>
      )}
    </div>
  );
}
