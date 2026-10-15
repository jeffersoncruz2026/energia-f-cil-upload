export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          analisado_em: string | null
          analisado_por: string | null
          ativo: boolean
          chave_unica: string
          classificacao: string
          created_at: string
          descricao: string
          fatura_id: string | null
          id: string
          indicador: string | null
          observacao_analise: string | null
          periodo: string | null
          status: Database["public"]["Enums"]["status_alerta"]
          tipo_alerta: string
          unidade_consumidora_id: string | null
          updated_at: string
          valor_atual: number | null
          valor_comparacao: number | null
          variacao_percentual: number | null
        }
        Insert: {
          analisado_em?: string | null
          analisado_por?: string | null
          ativo?: boolean
          chave_unica: string
          classificacao?: string
          created_at?: string
          descricao: string
          fatura_id?: string | null
          id?: string
          indicador?: string | null
          observacao_analise?: string | null
          periodo?: string | null
          status?: Database["public"]["Enums"]["status_alerta"]
          tipo_alerta: string
          unidade_consumidora_id?: string | null
          updated_at?: string
          valor_atual?: number | null
          valor_comparacao?: number | null
          variacao_percentual?: number | null
        }
        Update: {
          analisado_em?: string | null
          analisado_por?: string | null
          ativo?: boolean
          chave_unica?: string
          classificacao?: string
          created_at?: string
          descricao?: string
          fatura_id?: string | null
          id?: string
          indicador?: string | null
          observacao_analise?: string | null
          periodo?: string | null
          status?: Database["public"]["Enums"]["status_alerta"]
          tipo_alerta?: string
          unidade_consumidora_id?: string | null
          updated_at?: string
          valor_atual?: number | null
          valor_comparacao?: number | null
          variacao_percentual?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_unidade_consumidora_id_fkey"
            columns: ["unidade_consumidora_id"]
            isOneToOne: false
            referencedRelation: "unidades_consumidoras"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          chave: string
          descricao: string | null
          updated_at: string
          updated_by: string | null
          valor: Json
        }
        Insert: {
          chave: string
          descricao?: string | null
          updated_at?: string
          updated_by?: string | null
          valor: Json
        }
        Update: {
          chave?: string
          descricao?: string | null
          updated_at?: string
          updated_by?: string | null
          valor?: Json
        }
        Relationships: []
      }
      eventos_fiscais: {
        Row: {
          arquivo_xml_path: string | null
          chave_acesso: string
          created_at: string
          created_by: string | null
          dados_json: Json
          data_evento: string | null
          descricao: string | null
          hash_arquivo: string
          id: string
          protocolo: string | null
          tipo_evento: string
        }
        Insert: {
          arquivo_xml_path?: string | null
          chave_acesso: string
          created_at?: string
          created_by?: string | null
          dados_json?: Json
          data_evento?: string | null
          descricao?: string | null
          hash_arquivo: string
          id?: string
          protocolo?: string | null
          tipo_evento: string
        }
        Update: {
          arquivo_xml_path?: string | null
          chave_acesso?: string
          created_at?: string
          created_by?: string | null
          dados_json?: Json
          data_evento?: string | null
          descricao?: string | null
          hash_arquivo?: string
          id?: string
          protocolo?: string | null
          tipo_evento?: string
        }
        Relationships: []
      }
      faturas: {
        Row: {
          arquivo_xml_path: string | null
          chave_acesso: string | null
          chave_substituida: string | null
          classe_consumo: string | null
          cnpj_destinatario: string | null
          cnpj_emitente: string | null
          consumo_faturado_kwh: number | null
          consumo_kwh: number | null
          consumo_medido_kwh: number | null
          created_at: string
          created_by: string | null
          dados_extraidos_json: Json
          data_emissao: string | null
          data_leitura_anterior: string | null
          data_leitura_atual: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          demanda_contratada_kw: number | null
          demanda_faturada_kw: number | null
          demanda_medida_kw: number | null
          dias_faturados: number | null
          divergencias: Json
          endereco_destinatario: string | null
          energia_compensada_kwh: number | null
          energia_injetada_kwh: number | null
          energia_reativa_kvarh: number | null
          excluida: boolean
          excluida_em: string | null
          excluida_por: string | null
          finalidade: string | null
          hash_arquivo: string
          id: string
          importacao_id: string | null
          modelo_documento: string | null
          motivo_exclusao: string | null
          municipio: string | null
          nome_arquivo: string | null
          nome_destinatario: string | null
          nome_fornecedor: string | null
          numero_documento: string | null
          numero_uc_extraido: string | null
          numero_uc_extraido_normalizado: string | null
          origem_consumo: string | null
          pagamento_confirmado: boolean
          pagamento_registrado_por: string | null
          periodo_referencia: string | null
          protocolo_autorizacao: string | null
          serie: string | null
          status_documento: string
          status_processamento: string
          tipo_documento: string | null
          uf: string | null
          unidade_consumidora_id: string | null
          updated_at: string
          valor_bandeira: number | null
          valor_cip: number | null
          valor_cofins: number | null
          valor_compensacao: number | null
          valor_demanda: number | null
          valor_descontos: number | null
          valor_encargos: number | null
          valor_energia: number | null
          valor_icms: number | null
          valor_juros: number | null
          valor_multas: number | null
          valor_outros: number | null
          valor_pago: number | null
          valor_pis: number | null
          valor_reativo: number | null
          valor_te: number | null
          valor_total: number | null
          valor_tusd: number | null
        }
        Insert: {
          arquivo_xml_path?: string | null
          chave_acesso?: string | null
          chave_substituida?: string | null
          classe_consumo?: string | null
          cnpj_destinatario?: string | null
          cnpj_emitente?: string | null
          consumo_faturado_kwh?: number | null
          consumo_kwh?: number | null
          consumo_medido_kwh?: number | null
          created_at?: string
          created_by?: string | null
          dados_extraidos_json?: Json
          data_emissao?: string | null
          data_leitura_anterior?: string | null
          data_leitura_atual?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          demanda_contratada_kw?: number | null
          demanda_faturada_kw?: number | null
          demanda_medida_kw?: number | null
          dias_faturados?: number | null
          divergencias?: Json
          endereco_destinatario?: string | null
          energia_compensada_kwh?: number | null
          energia_injetada_kwh?: number | null
          energia_reativa_kvarh?: number | null
          excluida?: boolean
          excluida_em?: string | null
          excluida_por?: string | null
          finalidade?: string | null
          hash_arquivo: string
          id?: string
          importacao_id?: string | null
          modelo_documento?: string | null
          motivo_exclusao?: string | null
          municipio?: string | null
          nome_arquivo?: string | null
          nome_destinatario?: string | null
          nome_fornecedor?: string | null
          numero_documento?: string | null
          numero_uc_extraido?: string | null
          numero_uc_extraido_normalizado?: string | null
          origem_consumo?: string | null
          pagamento_confirmado?: boolean
          pagamento_registrado_por?: string | null
          periodo_referencia?: string | null
          protocolo_autorizacao?: string | null
          serie?: string | null
          status_documento?: string
          status_processamento?: string
          tipo_documento?: string | null
          uf?: string | null
          unidade_consumidora_id?: string | null
          updated_at?: string
          valor_bandeira?: number | null
          valor_cip?: number | null
          valor_cofins?: number | null
          valor_compensacao?: number | null
          valor_demanda?: number | null
          valor_descontos?: number | null
          valor_encargos?: number | null
          valor_energia?: number | null
          valor_icms?: number | null
          valor_juros?: number | null
          valor_multas?: number | null
          valor_outros?: number | null
          valor_pago?: number | null
          valor_pis?: number | null
          valor_reativo?: number | null
          valor_te?: number | null
          valor_total?: number | null
          valor_tusd?: number | null
        }
        Update: {
          arquivo_xml_path?: string | null
          chave_acesso?: string | null
          chave_substituida?: string | null
          classe_consumo?: string | null
          cnpj_destinatario?: string | null
          cnpj_emitente?: string | null
          consumo_faturado_kwh?: number | null
          consumo_kwh?: number | null
          consumo_medido_kwh?: number | null
          created_at?: string
          created_by?: string | null
          dados_extraidos_json?: Json
          data_emissao?: string | null
          data_leitura_anterior?: string | null
          data_leitura_atual?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          demanda_contratada_kw?: number | null
          demanda_faturada_kw?: number | null
          demanda_medida_kw?: number | null
          dias_faturados?: number | null
          divergencias?: Json
          endereco_destinatario?: string | null
          energia_compensada_kwh?: number | null
          energia_injetada_kwh?: number | null
          energia_reativa_kvarh?: number | null
          excluida?: boolean
          excluida_em?: string | null
          excluida_por?: string | null
          finalidade?: string | null
          hash_arquivo?: string
          id?: string
          importacao_id?: string | null
          modelo_documento?: string | null
          motivo_exclusao?: string | null
          municipio?: string | null
          nome_arquivo?: string | null
          nome_destinatario?: string | null
          nome_fornecedor?: string | null
          numero_documento?: string | null
          numero_uc_extraido?: string | null
          numero_uc_extraido_normalizado?: string | null
          origem_consumo?: string | null
          pagamento_confirmado?: boolean
          pagamento_registrado_por?: string | null
          periodo_referencia?: string | null
          protocolo_autorizacao?: string | null
          serie?: string | null
          status_documento?: string
          status_processamento?: string
          tipo_documento?: string | null
          uf?: string | null
          unidade_consumidora_id?: string | null
          updated_at?: string
          valor_bandeira?: number | null
          valor_cip?: number | null
          valor_cofins?: number | null
          valor_compensacao?: number | null
          valor_demanda?: number | null
          valor_descontos?: number | null
          valor_encargos?: number | null
          valor_energia?: number | null
          valor_icms?: number | null
          valor_juros?: number | null
          valor_multas?: number | null
          valor_outros?: number | null
          valor_pago?: number | null
          valor_pis?: number | null
          valor_reativo?: number | null
          valor_te?: number | null
          valor_total?: number | null
          valor_tusd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "historico_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_unidade_consumidora_id_fkey"
            columns: ["unidade_consumidora_id"]
            isOneToOne: false
            referencedRelation: "unidades_consumidoras"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_importacoes: {
        Row: {
          data_importacao: string
          detalhes_erros_json: Json
          id: string
          lote_id: string | null
          nome_arquivo: string
          quantidade_atualizada: number
          quantidade_importada: number
          quantidade_processada: number
          quantidade_rejeitada: number
          resultado: string | null
          status: string
          tipo_importacao: string
          usuario_id: string | null
        }
        Insert: {
          data_importacao?: string
          detalhes_erros_json?: Json
          id?: string
          lote_id?: string | null
          nome_arquivo: string
          quantidade_atualizada?: number
          quantidade_importada?: number
          quantidade_processada?: number
          quantidade_rejeitada?: number
          resultado?: string | null
          status: string
          tipo_importacao: string
          usuario_id?: string | null
        }
        Update: {
          data_importacao?: string
          detalhes_erros_json?: Json
          id?: string
          lote_id?: string | null
          nome_arquivo?: string
          quantidade_atualizada?: number
          quantidade_importada?: number
          quantidade_processada?: number
          quantidade_rejeitada?: number
          resultado?: string | null
          status?: string
          tipo_importacao?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      itens_fatura: {
        Row: {
          codigo_classificacao: string | null
          codigo_produto: string | null
          componente: string | null
          created_at: string
          dados_adicionais_json: Json
          descricao: string | null
          fatura_id: string
          id: string
          numero_item: number | null
          posto_tarifario: string | null
          quantidade: number | null
          tipo_item: string
          unidade_medida: string | null
          valor_cofins: number | null
          valor_icms: number | null
          valor_pis: number | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          codigo_classificacao?: string | null
          codigo_produto?: string | null
          componente?: string | null
          created_at?: string
          dados_adicionais_json?: Json
          descricao?: string | null
          fatura_id: string
          id?: string
          numero_item?: number | null
          posto_tarifario?: string | null
          quantidade?: number | null
          tipo_item?: string
          unidade_medida?: string | null
          valor_cofins?: number | null
          valor_icms?: number | null
          valor_pis?: number | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          codigo_classificacao?: string | null
          codigo_produto?: string | null
          componente?: string | null
          created_at?: string
          dados_adicionais_json?: Json
          descricao?: string | null
          fatura_id?: string
          id?: string
          numero_item?: number | null
          posto_tarifario?: string | null
          quantidade?: number | null
          tipo_item?: string
          unidade_medida?: string | null
          valor_cofins?: number | null
          valor_icms?: number | null
          valor_pis?: number | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_fatura_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
        ]
      }
      log_operacoes: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: number
          registro_id: string | null
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: never
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: never
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      perfis: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      unidades_consumidoras: {
        Row: {
          area: string | null
          cnpj: string
          created_at: string
          created_by: string | null
          endereco: string | null
          fazenda: string
          filial: string | null
          id: string
          numero_uc: string
          numero_uc_normalizado: string | null
          observacoes: string | null
          situacao: Database["public"]["Enums"]["situacao_uc"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area?: string | null
          cnpj: string
          created_at?: string
          created_by?: string | null
          endereco?: string | null
          fazenda: string
          filial?: string | null
          id?: string
          numero_uc: string
          numero_uc_normalizado?: string | null
          observacoes?: string | null
          situacao?: Database["public"]["Enums"]["situacao_uc"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area?: string | null
          cnpj?: string
          created_at?: string
          created_by?: string | null
          endereco?: string | null
          fazenda?: string
          filial?: string | null
          id?: string
          numero_uc?: string
          numero_uc_normalizado?: string | null
          observacoes?: string | null
          situacao?: Database["public"]["Enums"]["situacao_uc"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      area_canonica: { Args: { _area: string }; Returns: string }
      associar_fatura_uc: {
        Args: { p_fatura_id: string; p_uc_id: string }
        Returns: Json
      }
      calcular_divergencias: {
        Args: {
          _fatura: Database["public"]["Tables"]["faturas"]["Row"]
          _uc: Database["public"]["Tables"]["unidades_consumidoras"]["Row"]
        }
        Returns: Json
      }
      chave_texto: { Args: { _t: string }; Returns: string }
      cnpj_valido: { Args: { _cnpj: string }; Returns: boolean }
      definir_papel_usuario: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      excluir_fatura: {
        Args: { p_fatura_id: string; p_motivo: string }
        Returns: undefined
      }
      exigir_permissao: { Args: { _permissao: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      importar_ucs: {
        Args: { p_modo: string; p_nome_arquivo: string; p_registros: Json }
        Returns: Json
      }
      normalizar_cnpj: { Args: { _valor: string }; Returns: string }
      normalizar_uc: { Args: { _valor: string }; Returns: string }
      registrar_evento_fiscal: { Args: { p_evento: Json }; Returns: Json }
      registrar_fatura: {
        Args: {
          p_fatura: Json
          p_importacao_id?: string
          p_itens: Json
          p_reprocessar_id?: string
        }
        Returns: Json
      }
      registrar_pagamento: {
        Args: { p_data: string; p_fatura_id: string; p_valor: number }
        Returns: undefined
      }
      reidentificar_pendentes: { Args: never; Returns: Json }
      restaurar_fatura: { Args: { p_fatura_id: string }; Returns: undefined }
      salvar_alertas: { Args: { p_alertas: Json }; Returns: Json }
      situacao_texto: {
        Args: { _t: string }
        Returns: Database["public"]["Enums"]["situacao_uc"]
      }
      tem_permissao: { Args: { _permissao: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "gestor" | "operador" | "consulta"
      situacao_uc: "ativa" | "inativa"
      status_alerta: "pendente" | "analisado" | "resolvido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gestor", "operador", "consulta"],
      situacao_uc: ["ativa", "inativa"],
      status_alerta: ["pendente", "analisado", "resolvido"],
    },
  },
} as const
