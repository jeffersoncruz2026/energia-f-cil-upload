import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useMemo, useState } from "react";

import { CabecalhoPagina, Carregando, EstadoVazio, MensagemErro } from "@/components/app/comuns";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { buscarTodos } from "@/lib/consulta-paginada";
import { CHAVES, mensagemErro } from "@/lib/consultas";
import { formatarDataHora } from "@/lib/formatacao";
import type { HistoricoImportacao } from "@/lib/tipos";

export const Route = createFileRoute("/_app/historico")({
  head: () => ({ meta: [{ title: "Histórico de Importações — Controle Energia" }] }),
  component: PaginaHistorico,
});

const STATUS: Record<HistoricoImportacao["status"], { rotulo: string; classe: string }> = {
  sucesso: { rotulo: "Sucesso", classe: "border-success/30 bg-success/10 text-success" },
  parcial: { rotulo: "Parcial", classe: "border-warning/40 bg-warning/15 text-warning-foreground" },
  pendente: {
    rotulo: "Pendente de identificação",
    classe: "border-warning/40 bg-warning/15 text-warning-foreground",
  },
  duplicado: { rotulo: "Duplicado", classe: "bg-muted text-muted-foreground" },
  falha: { rotulo: "Falha", classe: "border-destructive/30 bg-destructive/10 text-destructive" },
};

const TIPOS: Record<HistoricoImportacao["tipo_importacao"], string> = {
  xml_fatura: "XML de fatura",
  planilha_uc: "Planilha de UCs",
  reprocessamento: "Reprocessamento",
};

interface Detalhe {
  tipo?: string;
  mensagem?: string;
  motivo?: string;
  linha?: number;
  numero_uc?: string;
}

function PaginaHistorico() {
  const [tipo, setTipo] = useState<"todos" | HistoricoImportacao["tipo_importacao"]>("todos");
  const [status, setStatus] = useState<"todos" | HistoricoImportacao["status"]>("todos");
  const [aberto, setAberto] = useState<HistoricoImportacao | null>(null);

  const consulta = useQuery({
    queryKey: [...CHAVES.historico, "lista"],
    queryFn: async () => {
      const [hist, perfis] = await Promise.all([
        buscarTodos<HistoricoImportacao>(
          supabase,
          "historico_importacoes",
          "*",
          {},
          "data_importacao",
        ),
        supabase.from("perfis").select("id, nome, email"),
      ]);
      const nomes = new Map(
        (perfis.data ?? []).map((p) => [p.id as string, (p.nome || p.email) as string]),
      );
      return hist.map((h) => ({
        ...h,
        usuario: h.usuario_id ? (nomes.get(h.usuario_id) ?? "—") : "—",
      }));
    },
  });

  const faturaDoHistorico = useQuery({
    queryKey: [...CHAVES.historico, "fatura", aberto?.id],
    enabled: !!aberto && aberto.tipo_importacao === "xml_fatura",
    queryFn: async () => {
      const { data } = await supabase
        .from("faturas")
        .select("id, numero_documento")
        .eq("importacao_id", aberto!.id)
        .maybeSingle();
      return data as { id: string; numero_documento: string | null } | null;
    },
  });

  const dados = useMemo(
    () =>
      (consulta.data ?? []).filter(
        (h) =>
          (tipo === "todos" || h.tipo_importacao === tipo) &&
          (status === "todos" || h.status === status),
      ),
    [consulta.data, tipo, status],
  );

  type Linha = (typeof dados)[number];
  const colunas: Coluna<Linha>[] = [
    { id: "data", titulo: "Data", tipo: "datahora", valor: (h) => h.data_importacao },
    { id: "usuario", titulo: "Usuário", valor: (h) => h.usuario },
    {
      id: "arquivo",
      titulo: "Arquivo",
      valor: (h) => h.nome_arquivo,
      classe: "max-w-[260px] truncate",
    },
    { id: "tipo", titulo: "Tipo", valor: (h) => TIPOS[h.tipo_importacao] },
    {
      id: "status",
      titulo: "Resultado",
      valor: (h) => STATUS[h.status]?.rotulo ?? h.status,
      celula: (h) => (
        <Badge variant="outline" className={STATUS[h.status]?.classe}>
          {STATUS[h.status]?.rotulo ?? h.status}
        </Badge>
      ),
    },
    { id: "proc", titulo: "Processados", tipo: "numero", valor: (h) => h.quantidade_processada },
    { id: "imp", titulo: "Importados", tipo: "numero", valor: (h) => h.quantidade_importada },
    { id: "atu", titulo: "Atualizados", tipo: "numero", valor: (h) => h.quantidade_atualizada },
    { id: "rej", titulo: "Rejeitados", tipo: "numero", valor: (h) => h.quantidade_rejeitada },
    {
      id: "msg",
      titulo: "Mensagem",
      valor: (h) => h.resultado,
      classe: "max-w-[360px] truncate text-xs text-muted-foreground",
    },
  ];

  const detalhes = (aberto?.detalhes_erros_json ?? []) as Detalhe[];

  return (
    <div>
      <CabecalhoPagina
        titulo="Histórico de Importações"
        descricao="Registro de todas as importações de XML e planilhas, com data, usuário, arquivo e resultado. Arquivos com falha podem ser corrigidos e enviados novamente sem duplicar dados."
      />
      {consulta.error ? (
        <MensagemErro erro={mensagemErro(consulta.error)} />
      ) : consulta.isLoading ? (
        <Carregando />
      ) : !consulta.data?.length ? (
        <EstadoVazio icone={History} titulo="Nenhuma importação registrada" />
      ) : (
        <TabelaDados
          dados={dados}
          colunas={colunas}
          chave={(h) => h.id}
          nomeExportacao="historico-importacoes"
          ordenacaoInicial={{ id: "data", direcao: "desc" }}
          aoClicarLinha={setAberto}
          barraExtra={
            <>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {Object.entries(TIPOS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os resultados</SelectItem>
                  {Object.entries(STATUS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />
      )}

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="break-all">{aberto?.nome_arquivo}</DialogTitle>
            <DialogDescription>
              {aberto &&
                `${TIPOS[aberto.tipo_importacao]} · ${formatarDataHora(aberto.data_importacao)}`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">{aberto?.resultado}</p>
          {faturaDoHistorico.data && (
            <Link
              to="/faturas/$id"
              params={{ id: faturaDoHistorico.data.id }}
              className="text-sm text-primary underline"
            >
              Abrir fatura nº {faturaDoHistorico.data.numero_documento ?? "—"}
            </Link>
          )}
          {detalhes.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {detalhes.map((d, i) => (
                <li key={i} className="rounded-md border p-2">
                  <span
                    className={d.tipo === "aviso" ? "text-warning-foreground" : "text-destructive"}
                  >
                    {d.linha != null &&
                      `Linha ${d.linha}${d.numero_uc ? ` (UC ${d.numero_uc})` : ""}: `}
                    {d.tipo === "aviso" && "Aviso: "}
                  </span>
                  {d.mensagem ?? d.motivo}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Sem erros ou avisos registrados.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
