// Tipos de domínio espelhando as tabelas do banco (supabase/migrations).

export type Papel = "admin" | "gestor" | "operador" | "consulta";
export type Permissao =
  "visualizar" | "cadastrar" | "importar" | "editar" | "excluir" | "configurar";
export type SituacaoUc = "ativa" | "inativa";
export type StatusDocumento = "autorizada" | "sem_protocolo" | "cancelada" | "substituida";
export type StatusProcessamento = "processada" | "pendente_identificacao" | "erro";
export type StatusAlerta = "pendente" | "analisado" | "resolvido";

export interface UnidadeConsumidora {
  id: string;
  numero_uc: string;
  numero_uc_normalizado: string;
  fazenda: string;
  cnpj: string;
  endereco: string | null;
  filial: string | null;
  area: string | null;
  /** UC que recebe energia injetada por terceiros (Grupo BC). */
  grupo_bc?: boolean;
  situacao: SituacaoUc;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

/** Campos numéricos/financeiros extraídos de uma fatura (null = indisponível). */
export interface CamposValoresFatura {
  consumo_kwh: number | null;
  consumo_medido_kwh: number | null;
  consumo_faturado_kwh: number | null;
  origem_consumo: string | null;
  energia_injetada_kwh: number | null;
  energia_compensada_kwh: number | null;
  demanda_contratada_kw: number | null;
  demanda_medida_kw: number | null;
  demanda_faturada_kw: number | null;
  energia_reativa_kvarh: number | null;
  valor_total: number | null;
  valor_energia: number | null;
  valor_tusd: number | null;
  valor_te: number | null;
  valor_demanda: number | null;
  valor_reativo: number | null;
  valor_bandeira: number | null;
  valor_icms: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  valor_cip: number | null;
  valor_multas: number | null;
  valor_juros: number | null;
  valor_encargos: number | null;
  valor_descontos: number | null;
  valor_compensacao: number | null;
  valor_outros: number | null;
}

export interface Fatura extends CamposValoresFatura {
  id: string;
  unidade_consumidora_id: string | null;
  numero_uc_extraido: string | null;
  chave_acesso: string | null;
  hash_arquivo: string;
  modelo_documento: string | null;
  tipo_documento: string | null;
  finalidade: string | null;
  numero_documento: string | null;
  serie: string | null;
  data_emissao: string | null;
  periodo_referencia: string | null;
  data_vencimento: string | null;
  data_leitura_anterior: string | null;
  data_leitura_atual: string | null;
  dias_faturados: number | null;
  cnpj_emitente: string | null;
  nome_fornecedor: string | null;
  cnpj_destinatario: string | null;
  nome_destinatario: string | null;
  endereco_destinatario: string | null;
  municipio: string | null;
  uf: string | null;
  classe_consumo: string | null;
  protocolo_autorizacao: string | null;
  chave_substituida: string | null;
  status_documento: StatusDocumento;
  status_processamento: StatusProcessamento;
  divergencias: { tipo: string; mensagem: string }[];
  pagamento_confirmado: boolean;
  data_pagamento: string | null;
  valor_pago: number | null;
  dados_extraidos_json: Record<string, unknown>;
  arquivo_xml_path: string | null;
  nome_arquivo: string | null;
  importacao_id: string | null;
  excluida: boolean;
  excluida_em: string | null;
  motivo_exclusao: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemFatura {
  id: string;
  fatura_id: string;
  numero_item: number | null;
  codigo_produto: string | null;
  codigo_classificacao: string | null;
  descricao: string | null;
  quantidade: number | null;
  unidade_medida: string | null;
  valor_unitario: number | null;
  valor_total: number | null;
  tipo_item: string;
  componente: string | null;
  posto_tarifario: string | null;
  valor_icms: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  dados_adicionais_json: Record<string, unknown>;
}

export interface HistoricoImportacao {
  id: string;
  lote_id: string | null;
  nome_arquivo: string;
  tipo_importacao: "xml_fatura" | "planilha_uc" | "reprocessamento";
  data_importacao: string;
  quantidade_processada: number;
  quantidade_importada: number;
  quantidade_atualizada: number;
  quantidade_rejeitada: number;
  status: "sucesso" | "parcial" | "falha" | "duplicado" | "pendente";
  resultado: string | null;
  detalhes_erros_json: unknown[];
  usuario_id: string | null;
}

export interface Alerta {
  id: string;
  chave_unica: string;
  unidade_consumidora_id: string | null;
  fatura_id: string | null;
  tipo_alerta: string;
  classificacao: "confirmado" | "possivel";
  indicador: string | null;
  periodo: string | null;
  valor_atual: number | null;
  valor_comparacao: number | null;
  variacao_percentual: number | null;
  descricao: string;
  status: StatusAlerta;
  observacao_analise: string | null;
  analisado_em: string | null;
  ativo: boolean;
  created_at: string;
}

export interface ConfigAlertas {
  consumo_aumento_pct: number;
  custo_aumento_pct: number;
  custo_kwh_acima_historico_pct: number;
  componente_variacao_pct: number;
  componente_variacao_valor_min: number;
  custo_semelhantes_pct: number;
  historico_minimo_meses: number;
  considerar_dias_faturados: boolean;
  considerar_sazonalidade: boolean;
  /** Queda da energia injetada (GD) em relação à média histórica, em %. */
  solar_queda_injecao_pct: number;
  /** Saldo de créditos acima de N meses de uso médio gera alerta. */
  solar_meses_saldo_excessivo: number;
}

export const CONFIG_ALERTAS_PADRAO: ConfigAlertas = {
  consumo_aumento_pct: 20,
  custo_aumento_pct: 20,
  custo_kwh_acima_historico_pct: 25,
  componente_variacao_pct: 30,
  componente_variacao_valor_min: 50,
  custo_semelhantes_pct: 30,
  historico_minimo_meses: 3,
  considerar_dias_faturados: true,
  considerar_sazonalidade: true,
  solar_queda_injecao_pct: 30,
  solar_meses_saldo_excessivo: 6,
};

export interface ConfigCadastroUc {
  endereco_obrigatorio: boolean;
  filial_obrigatoria: boolean;
  area_obrigatoria: boolean;
  /** Áreas sugeridas no cadastro (ex.: Agrícola, Pecuária, Seringal…) */
  areas: string[];
}

export const AREAS_PADRAO = ["Agrícola", "Pecuária", "Seringal", "Administrativo", "Oficina"];

export const CONFIG_CADASTRO_PADRAO: ConfigCadastroUc = {
  endereco_obrigatorio: false,
  filial_obrigatoria: true,
  area_obrigatoria: false,
  areas: AREAS_PADRAO,
};

export type CriterioConsolidacao = "competencia" | "emissao";
