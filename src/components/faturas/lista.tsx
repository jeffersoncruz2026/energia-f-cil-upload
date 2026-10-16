import { useQuery } from "@tanstack/react-query";

import { BadgeStatusDocumento, BadgeStatusProcessamento } from "@/components/app/comuns";
import type { Coluna } from "@/components/app/tabela-dados";
import { supabase } from "@/integrations/supabase/client";
import { creditosDaFatura, custoDaFatura } from "@/lib/analise/calculos";
import { buscarTodos, comGrupoBc } from "@/lib/consulta-paginada";
import { CHAVES } from "@/lib/consultas";
import { formatarCnpj } from "@/lib/formatacao";
import type { Fatura } from "@/lib/tipos";

export type FaturaLista = Omit<Fatura, "dados_extraidos_json"> & {
  uc: {
    numero_uc: string;
    fazenda: string;
    filial: string | null;
    area: string | null;
    cnpj: string;
  } | null;
  /** Valor Grupo BC (só nas UCs do Grupo BC); soma ao custo da energia. */
  valor_grupo_bc?: number | null;
  kwh_grupo_bc?: number | null;
};

export const CAMPOS_LISTA = [
  "id",
  "unidade_consumidora_id",
  "numero_uc_extraido",
  "chave_acesso",
  "modelo_documento",
  "tipo_documento",
  "finalidade",
  "numero_documento",
  "serie",
  "data_emissao",
  "periodo_referencia",
  "data_vencimento",
  "dias_faturados",
  "cnpj_emitente",
  "nome_fornecedor",
  "cnpj_destinatario",
  "nome_destinatario",
  "consumo_kwh",
  "energia_injetada_kwh",
  "energia_compensada_kwh",
  "demanda_contratada_kw",
  "demanda_medida_kw",
  "valor_total",
  "valor_energia",
  "valor_tusd",
  "valor_te",
  "valor_demanda",
  "valor_reativo",
  "valor_bandeira",
  "valor_icms",
  "valor_pis",
  "valor_cofins",
  "valor_cip",
  "valor_multas",
  "valor_juros",
  "valor_encargos",
  "valor_descontos",
  "valor_compensacao",
  "valor_outros",
  "status_documento",
  "status_processamento",
  "divergencias",
  "pagamento_confirmado",
  "data_pagamento",
  "valor_pago",
  "nome_arquivo",
  "excluida",
  "motivo_exclusao",
  "created_at",
  "uc:unidades_consumidoras(numero_uc,fazenda,filial,area,cnpj)",
].join(",");

export function useFaturasLista() {
  return useQuery({
    queryKey: [...CHAVES.faturas, "lista"],
    queryFn: async () =>
      (
        await comGrupoBc(
          supabase,
          await buscarTodos<FaturaLista>(supabase, "faturas", CAMPOS_LISTA),
        )
      ).faturas,
  });
}

export function colunasFatura(): Coluna<FaturaLista>[] {
  return [
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
    { id: "filial", titulo: "Filial", valor: (f) => f.uc?.filial ?? null, oculta: true },
    {
      id: "cnpj",
      titulo: "CNPJ (UC)",
      valor: (f) => (f.uc ? formatarCnpj(f.uc.cnpj) : null),
      oculta: true,
    },
    { id: "emissao", titulo: "Emissão", tipo: "data", valor: (f) => f.data_emissao },
    { id: "vencimento", titulo: "Vencimento", tipo: "data", valor: (f) => f.data_vencimento },
    { id: "fornecedor", titulo: "Fornecedor", valor: (f) => f.nome_fornecedor, oculta: true },
    { id: "tipo", titulo: "Modelo", valor: (f) => f.tipo_documento, oculta: true },
    { id: "chave", titulo: "Chave de acesso", valor: (f) => f.chave_acesso, oculta: true },
    { id: "consumo", titulo: "Consumo (kWh)", tipo: "kwh", valor: (f) => f.consumo_kwh },
    { id: "dias", titulo: "Dias", tipo: "numero", valor: (f) => f.dias_faturados, oculta: true },
    {
      id: "custo",
      titulo: "Custo da energia",
      tipo: "moeda",
      valor: (f) => custoDaFatura(f),
    },
    {
      id: "creditos",
      titulo: "Créditos abatidos",
      tipo: "moeda",
      valor: (f) => creditosDaFatura(f) || null,
    },
    {
      id: "grupoBc",
      titulo: "Grupo BC",
      tipo: "moeda",
      valor: (f) => f.valor_grupo_bc ?? null,
    },
    { id: "valor", titulo: "Valor faturado", tipo: "moeda", valor: (f) => f.valor_total },
    { id: "icms", titulo: "ICMS", tipo: "moeda", valor: (f) => f.valor_icms, oculta: true },
    { id: "pis", titulo: "PIS", tipo: "moeda", valor: (f) => f.valor_pis, oculta: true },
    { id: "cofins", titulo: "COFINS", tipo: "moeda", valor: (f) => f.valor_cofins, oculta: true },
    { id: "cip", titulo: "CIP/COSIP", tipo: "moeda", valor: (f) => f.valor_cip, oculta: true },
    {
      id: "pagamento",
      titulo: "Pagamento",
      valor: (f) => (f.pagamento_confirmado ? "Confirmado" : "Não confirmado"),
      celula: (f) =>
        f.pagamento_confirmado ? (
          <span className="text-success">Confirmado</span>
        ) : (
          <span className="text-muted-foreground">Não confirmado</span>
        ),
    },
    {
      id: "status_doc",
      titulo: "Documento",
      valor: (f) => f.status_documento,
      celula: (f) => <BadgeStatusDocumento status={f.status_documento} />,
    },
    {
      id: "status_proc",
      titulo: "Identificação",
      valor: (f) => f.status_processamento,
      celula: (f) => <BadgeStatusProcessamento status={f.status_processamento} />,
    },
    {
      id: "importada",
      titulo: "Importada em",
      tipo: "datahora",
      valor: (f) => f.created_at,
      oculta: true,
    },
  ];
}
