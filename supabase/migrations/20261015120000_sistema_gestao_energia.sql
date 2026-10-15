-- =============================================================================
-- Sistema de Gestão e Análise de Energia Elétrica Rural
-- Estrutura inicial: cadastros, faturas, itens, importações, alertas,
-- permissões, auditoria, armazenamento privado de XML e regras de integridade.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'gestor', 'operador', 'consulta');
create type public.situacao_uc as enum ('ativa', 'inativa');
create type public.status_alerta as enum ('pendente', 'analisado', 'resolvido');

-- -----------------------------------------------------------------------------
-- 2. Funções utilitárias (imutáveis — usadas em colunas geradas e CHECKs)
-- -----------------------------------------------------------------------------

-- Normaliza o número da UC para comparação: remove pontuação/espaços,
-- converte para maiúsculas e remove zeros à esquerda.
-- Deve permanecer idêntica a src/lib/uc.ts (normalizarUc).
create or replace function public.normalizar_uc(_valor text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when _valor is null then null
    when ltrim(upper(regexp_replace(_valor, '[^0-9A-Za-z]', '', 'g')), '0') = ''
      then case when regexp_replace(_valor, '[^0-9A-Za-z]', '', 'g') = '' then null else '0' end
    else ltrim(upper(regexp_replace(_valor, '[^0-9A-Za-z]', '', 'g')), '0')
  end
$$;

-- Normaliza CNPJ: remove máscara e converte para maiúsculas (CNPJ alfanumérico).
create or replace function public.normalizar_cnpj(_valor text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(_valor, ''), '[^0-9A-Za-z]', '', 'g')), '')
$$;

-- Valida CNPJ numérico ou alfanumérico (IN RFB nº 2.229/2024): 12 caracteres
-- alfanuméricos + 2 dígitos verificadores calculados por módulo 11 sobre
-- (código ASCII - 48) de cada caractere.
create or replace function public.cnpj_valido(_cnpj text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  c text := public.normalizar_cnpj(_cnpj);
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  soma int;
  resto int;
  dv1 int;
  dv2 int;
  i int;
begin
  if c is null or c !~ '^[0-9A-Z]{12}[0-9]{2}$' then
    return false;
  end if;
  if c ~ '^(\d)\1{13}$' then
    return false;
  end if;
  soma := 0;
  for i in 1..12 loop
    soma := soma + (ascii(substr(c, i, 1)) - 48) * pesos1[i];
  end loop;
  resto := soma % 11;
  dv1 := case when resto < 2 then 0 else 11 - resto end;
  soma := 0;
  for i in 1..13 loop
    soma := soma + (ascii(substr(c, i, 1)) - 48) * pesos2[i];
  end loop;
  resto := soma % 11;
  dv2 := case when resto < 2 then 0 else 11 - resto end;
  return substr(c, 13, 1)::int = dv1 and substr(c, 14, 1)::int = dv2;
end;
$$;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Usuários, perfis e permissões
-- -----------------------------------------------------------------------------
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  email text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

-- Matriz de permissões:
--   visualizar  : admin, gestor, operador, consulta
--   cadastrar   : admin, gestor, operador
--   importar    : admin, gestor, operador
--   editar      : admin, gestor
--   excluir     : admin
--   configurar  : admin
create or replace function public.tem_permissao(_permissao text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = any (
        case _permissao
          when 'visualizar' then array['admin','gestor','operador','consulta']::public.app_role[]
          when 'cadastrar'  then array['admin','gestor','operador']::public.app_role[]
          when 'importar'   then array['admin','gestor','operador']::public.app_role[]
          when 'editar'     then array['admin','gestor']::public.app_role[]
          when 'excluir'    then array['admin']::public.app_role[]
          when 'configurar' then array['admin']::public.app_role[]
          else array[]::public.app_role[]
        end
      )
  )
$$;

create or replace function public.exigir_permissao(_permissao text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.tem_permissao(_permissao) then
    raise exception 'Permissão insuficiente para esta operação (%).', _permissao
      using errcode = '42501';
  end if;
end;
$$;

-- Novo usuário: cria perfil. O primeiro usuário do sistema torna-se administrador;
-- os demais entram como "consulta" até que um administrador altere o papel.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.handle_new_user'));
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email), new.email)
  on conflict (id) do nothing;

  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'consulta');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 4. Configurações
-- -----------------------------------------------------------------------------
create table public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.configuracoes (chave, valor, descricao) values
  ('alertas', jsonb_build_object(
      'consumo_aumento_pct', 20,
      'custo_aumento_pct', 20,
      'custo_kwh_acima_historico_pct', 25,
      'componente_variacao_pct', 30,
      'componente_variacao_valor_min', 50,
      'custo_semelhantes_pct', 30,
      'historico_minimo_meses', 3,
      'considerar_dias_faturados', true,
      'considerar_sazonalidade', true
    ), 'Limites das regras de análise e identificação de anomalias'),
  ('cadastro_uc', jsonb_build_object(
      'endereco_obrigatorio', false,
      'filial_obrigatoria', true
    ), 'Campos configuráveis do cadastro de unidades consumidoras'),
  ('consolidacao', jsonb_build_object(
      'criterio_padrao', 'competencia'
    ), 'Critério padrão de consolidação das faturas (competencia ou emissao)');

-- -----------------------------------------------------------------------------
-- 5. Unidades consumidoras
-- -----------------------------------------------------------------------------
create table public.unidades_consumidoras (
  id uuid primary key default gen_random_uuid(),
  numero_uc text not null,
  numero_uc_normalizado text generated always as (public.normalizar_uc(numero_uc)) stored,
  fazenda text not null,
  cnpj text not null,
  endereco text,
  filial text,
  situacao public.situacao_uc not null default 'ativa',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint uc_numero_preenchido check (length(btrim(numero_uc)) > 0 and numero_uc_normalizado is not null),
  constraint uc_fazenda_preenchida check (length(btrim(fazenda)) > 0),
  constraint uc_cnpj_formato check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  constraint uc_cnpj_valido check (public.cnpj_valido(cnpj)),
  constraint uc_numero_unico unique (numero_uc_normalizado)
);

create index idx_uc_fazenda on public.unidades_consumidoras (fazenda);
create index idx_uc_filial on public.unidades_consumidoras (filial);
create index idx_uc_cnpj on public.unidades_consumidoras (cnpj);
create index idx_uc_situacao on public.unidades_consumidoras (situacao);

create or replace function public.tg_uc_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.numero_uc := btrim(new.numero_uc);
  new.fazenda := btrim(new.fazenda);
  new.cnpj := public.normalizar_cnpj(new.cnpj);
  new.endereco := nullif(btrim(coalesce(new.endereco, '')), '');
  new.filial := nullif(btrim(coalesce(new.filial, '')), '');
  new.observacoes := nullif(btrim(coalesce(new.observacoes, '')), '');
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger trg_uc_normalizar
  before insert or update on public.unidades_consumidoras
  for each row execute function public.tg_uc_normalizar();

create trigger trg_uc_updated_at
  before update on public.unidades_consumidoras
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Histórico de importações
-- -----------------------------------------------------------------------------
create table public.historico_importacoes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid,
  nome_arquivo text not null,
  tipo_importacao text not null check (tipo_importacao in ('xml_fatura', 'planilha_uc', 'reprocessamento')),
  data_importacao timestamptz not null default now(),
  quantidade_processada integer not null default 0,
  quantidade_importada integer not null default 0,
  quantidade_atualizada integer not null default 0,
  quantidade_rejeitada integer not null default 0,
  status text not null check (status in ('sucesso', 'parcial', 'falha', 'duplicado', 'pendente')),
  resultado text,
  detalhes_erros_json jsonb not null default '[]'::jsonb,
  usuario_id uuid references auth.users (id) on delete set null default auth.uid()
);

create index idx_hist_data on public.historico_importacoes (data_importacao desc);
create index idx_hist_lote on public.historico_importacoes (lote_id);

-- -----------------------------------------------------------------------------
-- 7. Faturas
-- -----------------------------------------------------------------------------
create table public.faturas (
  id uuid primary key default gen_random_uuid(),
  unidade_consumidora_id uuid references public.unidades_consumidoras (id) on delete restrict,
  numero_uc_extraido text,
  numero_uc_extraido_normalizado text generated always as (public.normalizar_uc(numero_uc_extraido)) stored,

  -- Identificação
  chave_acesso text,
  hash_arquivo text not null,
  modelo_documento text,
  tipo_documento text,
  finalidade text,
  numero_documento text,
  serie text,
  data_emissao date,
  periodo_referencia date,
  data_vencimento date,
  data_leitura_anterior date,
  data_leitura_atual date,
  dias_faturados integer,
  cnpj_emitente text,
  nome_fornecedor text,
  cnpj_destinatario text,
  nome_destinatario text,
  endereco_destinatario text,
  municipio text,
  uf text,
  classe_consumo text,
  protocolo_autorizacao text,
  chave_substituida text,

  -- Consumo e medição (null = indisponível no documento)
  consumo_kwh numeric(16, 3),
  consumo_medido_kwh numeric(16, 3),
  consumo_faturado_kwh numeric(16, 3),
  origem_consumo text,
  energia_injetada_kwh numeric(16, 3),
  energia_compensada_kwh numeric(16, 3),
  demanda_contratada_kw numeric(16, 3),
  demanda_medida_kw numeric(16, 3),
  demanda_faturada_kw numeric(16, 3),
  energia_reativa_kvarh numeric(16, 3),

  -- Valores financeiros (null = não discriminado no documento)
  valor_total numeric(14, 2),
  valor_energia numeric(14, 2),
  valor_tusd numeric(14, 2),
  valor_te numeric(14, 2),
  valor_demanda numeric(14, 2),
  valor_reativo numeric(14, 2),
  valor_bandeira numeric(14, 2),
  valor_icms numeric(14, 2),
  valor_pis numeric(14, 2),
  valor_cofins numeric(14, 2),
  valor_cip numeric(14, 2),
  valor_multas numeric(14, 2),
  valor_juros numeric(14, 2),
  valor_encargos numeric(14, 2),
  valor_descontos numeric(14, 2),
  valor_compensacao numeric(14, 2),
  valor_outros numeric(14, 2),

  -- Situação
  status_documento text not null default 'sem_protocolo'
    check (status_documento in ('autorizada', 'sem_protocolo', 'cancelada', 'substituida')),
  status_processamento text not null default 'processada'
    check (status_processamento in ('processada', 'pendente_identificacao', 'erro')),
  divergencias jsonb not null default '[]'::jsonb,

  -- Pagamento: valor faturado não é tratado como valor pago
  pagamento_confirmado boolean not null default false,
  data_pagamento date,
  valor_pago numeric(14, 2),
  pagamento_registrado_por uuid references auth.users (id) on delete set null,

  -- Auditoria e origem
  dados_extraidos_json jsonb not null default '{}'::jsonb,
  arquivo_xml_path text,
  nome_arquivo text,
  importacao_id uuid references public.historico_importacoes (id) on delete set null,

  -- Exclusão lógica
  excluida boolean not null default false,
  excluida_em timestamptz,
  excluida_por uuid references auth.users (id) on delete set null,
  motivo_exclusao text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),

  constraint fatura_hash_unico unique (hash_arquivo),
  constraint fatura_pagamento_consistente check (
    (pagamento_confirmado and data_pagamento is not null and valor_pago is not null and valor_pago >= 0)
    or (not pagamento_confirmado and data_pagamento is null and valor_pago is null)
  ),
  constraint fatura_pendente_sem_uc check (
    status_processamento <> 'processada' or unidade_consumidora_id is not null
  )
);

create unique index fatura_chave_unica on public.faturas (chave_acesso) where chave_acesso is not null;
-- Documentos sem chave de acesso: emitente + modelo + série + número identificam o documento
create unique index fatura_numero_unico_sem_chave
  on public.faturas (cnpj_emitente, modelo_documento, serie, numero_documento)
  where chave_acesso is null and numero_documento is not null and cnpj_emitente is not null;
create index idx_fatura_uc on public.faturas (unidade_consumidora_id);
create index idx_fatura_periodo on public.faturas (periodo_referencia);
create index idx_fatura_emissao on public.faturas (data_emissao);
create index idx_fatura_uc_periodo on public.faturas (unidade_consumidora_id, periodo_referencia);
create index idx_fatura_status on public.faturas (status_processamento) where not excluida;
create index idx_fatura_uc_extraida on public.faturas (numero_uc_extraido_normalizado);
create index idx_fatura_numero on public.faturas (numero_documento);
create index idx_fatura_cnpj_dest on public.faturas (cnpj_destinatario);

create trigger trg_fatura_updated_at
  before update on public.faturas
  for each row execute function public.tg_set_updated_at();

create table public.itens_fatura (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references public.faturas (id) on delete cascade,
  numero_item integer,
  codigo_produto text,
  codigo_classificacao text,
  descricao text,
  quantidade numeric(18, 6),
  unidade_medida text,
  valor_unitario numeric(18, 8),
  valor_total numeric(14, 2),
  tipo_item text not null default 'outros',
  componente text,
  posto_tarifario text,
  valor_icms numeric(14, 2),
  valor_pis numeric(14, 2),
  valor_cofins numeric(14, 2),
  dados_adicionais_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_itens_fatura on public.itens_fatura (fatura_id);
create index idx_itens_tipo on public.itens_fatura (tipo_item);

-- Eventos fiscais (cancelamento etc.) — guardados mesmo que a fatura ainda
-- não tenha sido importada, para serem aplicados quando ela chegar.
create table public.eventos_fiscais (
  id uuid primary key default gen_random_uuid(),
  chave_acesso text not null,
  tipo_evento text not null,
  descricao text,
  data_evento timestamptz,
  protocolo text,
  hash_arquivo text not null unique,
  dados_json jsonb not null default '{}'::jsonb,
  arquivo_xml_path text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);

create index idx_eventos_chave on public.eventos_fiscais (chave_acesso);

-- -----------------------------------------------------------------------------
-- 8. Alertas
-- -----------------------------------------------------------------------------
create table public.alertas (
  id uuid primary key default gen_random_uuid(),
  chave_unica text not null unique,
  unidade_consumidora_id uuid references public.unidades_consumidoras (id) on delete cascade,
  fatura_id uuid references public.faturas (id) on delete cascade,
  tipo_alerta text not null,
  classificacao text not null default 'possivel' check (classificacao in ('confirmado', 'possivel')),
  indicador text,
  periodo date,
  valor_atual numeric(18, 4),
  valor_comparacao numeric(18, 4),
  variacao_percentual numeric(12, 2),
  descricao text not null,
  status public.status_alerta not null default 'pendente',
  observacao_analise text,
  analisado_por uuid references auth.users (id) on delete set null,
  analisado_em timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_alertas_uc on public.alertas (unidade_consumidora_id);
create index idx_alertas_status on public.alertas (status);
create index idx_alertas_periodo on public.alertas (periodo);

create trigger trg_alertas_updated_at
  before update on public.alertas
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 9. Registro de operações (auditoria)
-- -----------------------------------------------------------------------------
create table public.log_operacoes (
  id bigint generated always as identity primary key,
  usuario_id uuid default auth.uid(),
  acao text not null,
  tabela text not null,
  registro_id text,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz not null default now()
);

create index idx_log_data on public.log_operacoes (created_at desc);
create index idx_log_registro on public.log_operacoes (tabela, registro_id);

create or replace function public.tg_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  anterior jsonb;
  novo jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    anterior := to_jsonb(old) - 'dados_extraidos_json';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    novo := to_jsonb(new) - 'dados_extraidos_json';
  end if;
  if tg_op = 'UPDATE' and anterior - 'updated_at' = novo - 'updated_at' then
    return new;
  end if;
  insert into public.log_operacoes (usuario_id, acao, tabela, registro_id, dados_anteriores, dados_novos)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(novo ->> 'id', anterior ->> 'id', novo ->> 'chave', anterior ->> 'chave'),
          anterior, novo);
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_uc after insert or update or delete on public.unidades_consumidoras
  for each row execute function public.tg_auditoria();
create trigger trg_audit_faturas after update or delete on public.faturas
  for each row execute function public.tg_auditoria();
create trigger trg_audit_roles after insert or update or delete on public.user_roles
  for each row execute function public.tg_auditoria();
create trigger trg_audit_config after insert or update or delete on public.configuracoes
  for each row execute function public.tg_auditoria();
create trigger trg_audit_alertas after update of status on public.alertas
  for each row execute function public.tg_auditoria();

-- -----------------------------------------------------------------------------
-- 10. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.user_roles enable row level security;
alter table public.configuracoes enable row level security;
alter table public.unidades_consumidoras enable row level security;
alter table public.historico_importacoes enable row level security;
alter table public.faturas enable row level security;
alter table public.itens_fatura enable row level security;
alter table public.eventos_fiscais enable row level security;
alter table public.alertas enable row level security;
alter table public.log_operacoes enable row level security;

-- Perfis: o próprio usuário e quem pode visualizar o sistema
create policy perfis_select on public.perfis for select to authenticated
  using (id = auth.uid() or public.tem_permissao('visualizar'));
create policy perfis_update_proprio on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Papéis: cada usuário vê os seus; administradores gerenciam todos
create policy roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.tem_permissao('configurar'));
create policy roles_insert on public.user_roles for insert to authenticated
  with check (public.tem_permissao('configurar'));
create policy roles_delete on public.user_roles for delete to authenticated
  using (public.tem_permissao('configurar'));

-- Configurações
create policy config_select on public.configuracoes for select to authenticated
  using (public.tem_permissao('visualizar'));
create policy config_update on public.configuracoes for update to authenticated
  using (public.tem_permissao('configurar')) with check (public.tem_permissao('configurar'));

-- Unidades consumidoras
create policy uc_select on public.unidades_consumidoras for select to authenticated
  using (public.tem_permissao('visualizar'));
create policy uc_insert on public.unidades_consumidoras for insert to authenticated
  with check (public.tem_permissao('cadastrar'));
create policy uc_update on public.unidades_consumidoras for update to authenticated
  using (public.tem_permissao('editar')) with check (public.tem_permissao('editar'));
create policy uc_delete on public.unidades_consumidoras for delete to authenticated
  using (public.tem_permissao('excluir'));

-- Histórico de importações
create policy hist_select on public.historico_importacoes for select to authenticated
  using (public.tem_permissao('visualizar'));
create policy hist_insert on public.historico_importacoes for insert to authenticated
  with check (public.tem_permissao('importar') and usuario_id = auth.uid());
create policy hist_update on public.historico_importacoes for update to authenticated
  using (public.tem_permissao('importar') and usuario_id = auth.uid())
  with check (public.tem_permissao('importar') and usuario_id = auth.uid());

-- Faturas e itens: leitura direta; gravação somente por funções controladas
create policy faturas_select on public.faturas for select to authenticated
  using (public.tem_permissao('visualizar'));
create policy itens_select on public.itens_fatura for select to authenticated
  using (public.tem_permissao('visualizar'));
create policy eventos_select on public.eventos_fiscais for select to authenticated
  using (public.tem_permissao('visualizar'));

-- Alertas: leitura; análise (status/observação) por quem pode editar
create policy alertas_select on public.alertas for select to authenticated
  using (public.tem_permissao('visualizar'));
create policy alertas_update on public.alertas for update to authenticated
  using (public.tem_permissao('editar')) with check (public.tem_permissao('editar'));

-- Log de operações: somente administradores
create policy log_select on public.log_operacoes for select to authenticated
  using (public.tem_permissao('configurar'));

-- Restringe colunas que o usuário pode alterar diretamente nos alertas
revoke update on public.alertas from authenticated;
grant update (status, observacao_analise, analisado_por, analisado_em) on public.alertas to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Funções de negócio (gravação controlada)
-- -----------------------------------------------------------------------------

-- Monta a lista de divergências entre a fatura e o cadastro da UC.
create or replace function public.calcular_divergencias(_fatura public.faturas, _uc public.unidades_consumidoras)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  d jsonb := '[]'::jsonb;
begin
  if _uc.id is null then
    return d;
  end if;
  if _fatura.cnpj_destinatario is not null
     and public.normalizar_cnpj(_fatura.cnpj_destinatario) <> _uc.cnpj then
    d := d || jsonb_build_array(jsonb_build_object(
      'tipo', 'cnpj_divergente',
      'mensagem', format('CNPJ/CPF do destinatário no XML (%s) difere do CNPJ cadastrado na UC (%s).',
                         _fatura.cnpj_destinatario, _uc.cnpj)));
  end if;
  if _uc.situacao = 'inativa' then
    d := d || jsonb_build_array(jsonb_build_object(
      'tipo', 'uc_inativa',
      'mensagem', 'A unidade consumidora associada está cadastrada como inativa.'));
  end if;
  return d;
end;
$$;

-- Registra (ou reprocessa) uma fatura a partir dos dados extraídos do XML pelo backend.
-- Garante: sem duplicidade (chave de acesso / hash / número), associação somente pelo
-- número da UC, gravação atômica de fatura + itens, aplicação de eventos de
-- cancelamento/substituição já conhecidos.
create or replace function public.registrar_fatura(
  p_fatura jsonb,
  p_itens jsonb,
  p_importacao_id uuid default null,
  p_reprocessar_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existente public.faturas;
  v_uc public.unidades_consumidoras;
  v_fatura public.faturas;
  v_id uuid;
  v_chave text := nullif(btrim(p_fatura ->> 'chave_acesso'), '');
  v_hash text := nullif(btrim(p_fatura ->> 'hash_arquivo'), '');
  v_status_doc text;
  v_resultado text;
begin
  perform public.exigir_permissao('importar');

  if v_hash is null then
    raise exception 'Hash do arquivo não informado.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then
    raise exception 'Itens da fatura em formato inválido.' using errcode = '22023';
  end if;

  if p_reprocessar_id is null then
    -- Verificação de duplicidade
    select * into v_existente from public.faturas f
     where (v_chave is not null and f.chave_acesso = v_chave)
        or f.hash_arquivo = v_hash
        or (v_chave is null
            and f.chave_acesso is null
            and f.numero_documento = p_fatura ->> 'numero_documento'
            and f.cnpj_emitente = p_fatura ->> 'cnpj_emitente'
            and f.modelo_documento is not distinct from p_fatura ->> 'modelo_documento'
            and f.serie is not distinct from p_fatura ->> 'serie')
     limit 1;
    if found then
      return jsonb_build_object(
        'resultado', 'duplicada',
        'fatura_id', v_existente.id,
        'mensagem', case when v_existente.excluida
          then 'Documento já importado anteriormente (registro excluído logicamente). Nenhum valor foi somado novamente.'
          else 'Documento já importado anteriormente. Nenhum valor foi somado novamente.' end);
    end if;
  else
    select * into v_existente from public.faturas where id = p_reprocessar_id for update;
    if not found then
      raise exception 'Fatura para reprocessamento não encontrada.' using errcode = 'P0002';
    end if;
    if v_chave is distinct from v_existente.chave_acesso and v_existente.chave_acesso is not null then
      raise exception 'O XML reprocessado não corresponde à fatura original (chave diferente).' using errcode = '22023';
    end if;
  end if;

  -- Associação pelo número da UC (nunca apenas pelo CNPJ)
  if p_reprocessar_id is not null and v_existente.unidade_consumidora_id is not null then
    select * into v_uc from public.unidades_consumidoras where id = v_existente.unidade_consumidora_id;
  else
    select * into v_uc from public.unidades_consumidoras
     where numero_uc_normalizado = public.normalizar_uc(p_fatura ->> 'numero_uc_extraido')
     limit 1;
  end if;

  -- Situação do documento
  v_status_doc := coalesce(nullif(p_fatura ->> 'status_documento', ''), 'sem_protocolo');
  if v_status_doc not in ('autorizada', 'sem_protocolo') then
    v_status_doc := 'sem_protocolo';
  end if;
  if v_chave is not null then
    if exists (select 1 from public.eventos_fiscais e where e.chave_acesso = v_chave and e.tipo_evento = 'cancelamento') then
      v_status_doc := 'cancelada';
    elsif exists (select 1 from public.faturas f where f.chave_substituida = v_chave and not f.excluida
                    and (p_reprocessar_id is null or f.id <> p_reprocessar_id)) then
      v_status_doc := 'substituida';
    end if;
  end if;
  if p_reprocessar_id is not null and v_existente.status_documento in ('cancelada', 'substituida') then
    v_status_doc := v_existente.status_documento;
  end if;

  if p_reprocessar_id is null then
    insert into public.faturas (
      unidade_consumidora_id, numero_uc_extraido, chave_acesso, hash_arquivo,
      modelo_documento, tipo_documento, finalidade, numero_documento, serie,
      data_emissao, periodo_referencia, data_vencimento, data_leitura_anterior, data_leitura_atual, dias_faturados,
      cnpj_emitente, nome_fornecedor, cnpj_destinatario, nome_destinatario, endereco_destinatario,
      municipio, uf, classe_consumo, protocolo_autorizacao, chave_substituida,
      consumo_kwh, consumo_medido_kwh, consumo_faturado_kwh, origem_consumo,
      energia_injetada_kwh, energia_compensada_kwh, demanda_contratada_kw, demanda_medida_kw,
      demanda_faturada_kw, energia_reativa_kvarh,
      valor_total, valor_energia, valor_tusd, valor_te, valor_demanda, valor_reativo, valor_bandeira,
      valor_icms, valor_pis, valor_cofins, valor_cip, valor_multas, valor_juros, valor_encargos,
      valor_descontos, valor_compensacao, valor_outros,
      status_documento, status_processamento,
      dados_extraidos_json, arquivo_xml_path, nome_arquivo, importacao_id, created_by
    ) values (
      v_uc.id, p_fatura ->> 'numero_uc_extraido', v_chave, v_hash,
      p_fatura ->> 'modelo_documento', p_fatura ->> 'tipo_documento', p_fatura ->> 'finalidade',
      p_fatura ->> 'numero_documento', p_fatura ->> 'serie',
      (p_fatura ->> 'data_emissao')::date, (p_fatura ->> 'periodo_referencia')::date,
      (p_fatura ->> 'data_vencimento')::date, (p_fatura ->> 'data_leitura_anterior')::date,
      (p_fatura ->> 'data_leitura_atual')::date, (p_fatura ->> 'dias_faturados')::integer,
      p_fatura ->> 'cnpj_emitente', p_fatura ->> 'nome_fornecedor', p_fatura ->> 'cnpj_destinatario',
      p_fatura ->> 'nome_destinatario', p_fatura ->> 'endereco_destinatario',
      p_fatura ->> 'municipio', p_fatura ->> 'uf', p_fatura ->> 'classe_consumo',
      p_fatura ->> 'protocolo_autorizacao', nullif(p_fatura ->> 'chave_substituida', ''),
      (p_fatura ->> 'consumo_kwh')::numeric, (p_fatura ->> 'consumo_medido_kwh')::numeric,
      (p_fatura ->> 'consumo_faturado_kwh')::numeric, p_fatura ->> 'origem_consumo',
      (p_fatura ->> 'energia_injetada_kwh')::numeric, (p_fatura ->> 'energia_compensada_kwh')::numeric,
      (p_fatura ->> 'demanda_contratada_kw')::numeric, (p_fatura ->> 'demanda_medida_kw')::numeric,
      (p_fatura ->> 'demanda_faturada_kw')::numeric, (p_fatura ->> 'energia_reativa_kvarh')::numeric,
      (p_fatura ->> 'valor_total')::numeric, (p_fatura ->> 'valor_energia')::numeric,
      (p_fatura ->> 'valor_tusd')::numeric, (p_fatura ->> 'valor_te')::numeric,
      (p_fatura ->> 'valor_demanda')::numeric, (p_fatura ->> 'valor_reativo')::numeric,
      (p_fatura ->> 'valor_bandeira')::numeric, (p_fatura ->> 'valor_icms')::numeric,
      (p_fatura ->> 'valor_pis')::numeric, (p_fatura ->> 'valor_cofins')::numeric,
      (p_fatura ->> 'valor_cip')::numeric, (p_fatura ->> 'valor_multas')::numeric,
      (p_fatura ->> 'valor_juros')::numeric, (p_fatura ->> 'valor_encargos')::numeric,
      (p_fatura ->> 'valor_descontos')::numeric, (p_fatura ->> 'valor_compensacao')::numeric,
      (p_fatura ->> 'valor_outros')::numeric,
      v_status_doc,
      case when v_uc.id is null then 'pendente_identificacao' else 'processada' end,
      coalesce(p_fatura -> 'dados_extraidos_json', '{}'::jsonb),
      p_fatura ->> 'arquivo_xml_path', p_fatura ->> 'nome_arquivo', p_importacao_id, auth.uid()
    )
    returning * into v_fatura;
    v_resultado := case when v_uc.id is null then 'pendente_identificacao' else 'importada' end;
  else
    update public.faturas set
      unidade_consumidora_id = v_uc.id,
      numero_uc_extraido = p_fatura ->> 'numero_uc_extraido',
      chave_acesso = v_chave,
      modelo_documento = p_fatura ->> 'modelo_documento',
      tipo_documento = p_fatura ->> 'tipo_documento',
      finalidade = p_fatura ->> 'finalidade',
      numero_documento = p_fatura ->> 'numero_documento',
      serie = p_fatura ->> 'serie',
      data_emissao = (p_fatura ->> 'data_emissao')::date,
      periodo_referencia = (p_fatura ->> 'periodo_referencia')::date,
      data_vencimento = (p_fatura ->> 'data_vencimento')::date,
      data_leitura_anterior = (p_fatura ->> 'data_leitura_anterior')::date,
      data_leitura_atual = (p_fatura ->> 'data_leitura_atual')::date,
      dias_faturados = (p_fatura ->> 'dias_faturados')::integer,
      cnpj_emitente = p_fatura ->> 'cnpj_emitente',
      nome_fornecedor = p_fatura ->> 'nome_fornecedor',
      cnpj_destinatario = p_fatura ->> 'cnpj_destinatario',
      nome_destinatario = p_fatura ->> 'nome_destinatario',
      endereco_destinatario = p_fatura ->> 'endereco_destinatario',
      municipio = p_fatura ->> 'municipio',
      uf = p_fatura ->> 'uf',
      classe_consumo = p_fatura ->> 'classe_consumo',
      protocolo_autorizacao = p_fatura ->> 'protocolo_autorizacao',
      chave_substituida = nullif(p_fatura ->> 'chave_substituida', ''),
      consumo_kwh = (p_fatura ->> 'consumo_kwh')::numeric,
      consumo_medido_kwh = (p_fatura ->> 'consumo_medido_kwh')::numeric,
      consumo_faturado_kwh = (p_fatura ->> 'consumo_faturado_kwh')::numeric,
      origem_consumo = p_fatura ->> 'origem_consumo',
      energia_injetada_kwh = (p_fatura ->> 'energia_injetada_kwh')::numeric,
      energia_compensada_kwh = (p_fatura ->> 'energia_compensada_kwh')::numeric,
      demanda_contratada_kw = (p_fatura ->> 'demanda_contratada_kw')::numeric,
      demanda_medida_kw = (p_fatura ->> 'demanda_medida_kw')::numeric,
      demanda_faturada_kw = (p_fatura ->> 'demanda_faturada_kw')::numeric,
      energia_reativa_kvarh = (p_fatura ->> 'energia_reativa_kvarh')::numeric,
      valor_total = (p_fatura ->> 'valor_total')::numeric,
      valor_energia = (p_fatura ->> 'valor_energia')::numeric,
      valor_tusd = (p_fatura ->> 'valor_tusd')::numeric,
      valor_te = (p_fatura ->> 'valor_te')::numeric,
      valor_demanda = (p_fatura ->> 'valor_demanda')::numeric,
      valor_reativo = (p_fatura ->> 'valor_reativo')::numeric,
      valor_bandeira = (p_fatura ->> 'valor_bandeira')::numeric,
      valor_icms = (p_fatura ->> 'valor_icms')::numeric,
      valor_pis = (p_fatura ->> 'valor_pis')::numeric,
      valor_cofins = (p_fatura ->> 'valor_cofins')::numeric,
      valor_cip = (p_fatura ->> 'valor_cip')::numeric,
      valor_multas = (p_fatura ->> 'valor_multas')::numeric,
      valor_juros = (p_fatura ->> 'valor_juros')::numeric,
      valor_encargos = (p_fatura ->> 'valor_encargos')::numeric,
      valor_descontos = (p_fatura ->> 'valor_descontos')::numeric,
      valor_compensacao = (p_fatura ->> 'valor_compensacao')::numeric,
      valor_outros = (p_fatura ->> 'valor_outros')::numeric,
      status_documento = v_status_doc,
      status_processamento = case when v_uc.id is null then 'pendente_identificacao' else 'processada' end,
      dados_extraidos_json = coalesce(p_fatura -> 'dados_extraidos_json', '{}'::jsonb)
    where id = p_reprocessar_id
    returning * into v_fatura;
    delete from public.itens_fatura where fatura_id = p_reprocessar_id;
    v_resultado := 'reprocessada';
  end if;

  update public.faturas
     set divergencias = public.calcular_divergencias(v_fatura, v_uc)
   where id = v_fatura.id;

  insert into public.itens_fatura (
    fatura_id, numero_item, codigo_produto, codigo_classificacao, descricao, quantidade,
    unidade_medida, valor_unitario, valor_total, tipo_item, componente, posto_tarifario,
    valor_icms, valor_pis, valor_cofins, dados_adicionais_json
  )
  select v_fatura.id, x.numero_item, x.codigo_produto, x.codigo_classificacao, x.descricao, x.quantidade,
         x.unidade_medida, x.valor_unitario, x.valor_total, coalesce(x.tipo_item, 'outros'), x.componente,
         x.posto_tarifario, x.valor_icms, x.valor_pis, x.valor_cofins,
         coalesce(x.dados_adicionais_json, '{}'::jsonb)
    from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as x(
      numero_item integer, codigo_produto text, codigo_classificacao text, descricao text,
      quantidade numeric, unidade_medida text, valor_unitario numeric, valor_total numeric,
      tipo_item text, componente text, posto_tarifario text, valor_icms numeric,
      valor_pis numeric, valor_cofins numeric, dados_adicionais_json jsonb);

  -- Documento substituto: marca o documento original como substituído
  if v_fatura.chave_substituida is not null then
    update public.faturas
       set status_documento = 'substituida'
     where chave_acesso = v_fatura.chave_substituida
       and status_documento <> 'substituida';
  end if;

  return jsonb_build_object(
    'resultado', v_resultado,
    'fatura_id', v_fatura.id,
    'unidade_consumidora_id', v_uc.id,
    'status_documento', v_status_doc,
    'mensagem', case v_resultado
      when 'importada' then 'Fatura importada e associada à UC ' || v_uc.numero_uc || '.'
      when 'pendente_identificacao' then 'UC ' || coalesce(p_fatura ->> 'numero_uc_extraido', '(não identificada)')
                                         || ' não cadastrada. Fatura enviada para Pendências de Identificação.'
      else 'Fatura reprocessada.' end);
end;
$$;

-- Registra evento fiscal (ex.: cancelamento) e aplica à fatura, se já importada.
create or replace function public.registrar_evento_fiscal(p_evento jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := nullif(btrim(p_evento ->> 'chave_acesso'), '');
  v_tipo text := p_evento ->> 'tipo_evento';
  v_hash text := p_evento ->> 'hash_arquivo';
  v_qtd integer := 0;
begin
  perform public.exigir_permissao('importar');
  if v_chave is null or v_hash is null or v_tipo is null then
    raise exception 'Evento fiscal incompleto.' using errcode = '22023';
  end if;

  if exists (select 1 from public.eventos_fiscais where hash_arquivo = v_hash) then
    return jsonb_build_object('resultado', 'duplicada', 'mensagem', 'Evento já registrado anteriormente.');
  end if;

  insert into public.eventos_fiscais (chave_acesso, tipo_evento, descricao, data_evento, protocolo, hash_arquivo, dados_json, arquivo_xml_path)
  values (v_chave, v_tipo, p_evento ->> 'descricao', (p_evento ->> 'data_evento')::timestamptz,
          p_evento ->> 'protocolo', v_hash, coalesce(p_evento -> 'dados_json', '{}'::jsonb), p_evento ->> 'arquivo_xml_path');

  if v_tipo = 'cancelamento' then
    update public.faturas set status_documento = 'cancelada' where chave_acesso = v_chave;
    get diagnostics v_qtd = row_count;
  end if;

  return jsonb_build_object(
    'resultado', 'evento_registrado',
    'faturas_afetadas', v_qtd,
    'mensagem', case
      when v_tipo = 'cancelamento' and v_qtd > 0 then 'Cancelamento registrado. A fatura foi marcada como cancelada e deixa de compor os indicadores.'
      when v_tipo = 'cancelamento' then 'Cancelamento registrado. Será aplicado quando a fatura correspondente for importada.'
      else 'Evento fiscal registrado.' end);
end;
$$;

-- Associação manual de fatura pendente (ou correção de associação)
create or replace function public.associar_fatura_uc(p_fatura_id uuid, p_uc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fatura public.faturas;
  v_uc public.unidades_consumidoras;
begin
  perform public.exigir_permissao('importar');
  select * into v_fatura from public.faturas where id = p_fatura_id and not excluida for update;
  if not found then
    raise exception 'Fatura não encontrada.' using errcode = 'P0002';
  end if;
  if v_fatura.unidade_consumidora_id is not null and v_fatura.unidade_consumidora_id <> p_uc_id
     and not public.tem_permissao('editar') then
    raise exception 'Somente gestores podem corrigir uma associação já existente.' using errcode = '42501';
  end if;
  select * into v_uc from public.unidades_consumidoras where id = p_uc_id;
  if not found then
    raise exception 'Unidade consumidora não encontrada.' using errcode = 'P0002';
  end if;

  update public.faturas
     set unidade_consumidora_id = v_uc.id,
         status_processamento = 'processada'
   where id = p_fatura_id
  returning * into v_fatura;

  update public.faturas
     set divergencias = public.calcular_divergencias(v_fatura, v_uc)
           || case when public.normalizar_uc(v_fatura.numero_uc_extraido) is distinct from v_uc.numero_uc_normalizado
                   then jsonb_build_array(jsonb_build_object(
                          'tipo', 'associacao_manual',
                          'mensagem', format('Associação manual: UC no XML "%s" ≠ UC cadastrada "%s".',
                                             coalesce(v_fatura.numero_uc_extraido, '—'), v_uc.numero_uc)))
                   else '[]'::jsonb end
   where id = p_fatura_id;

  return jsonb_build_object('resultado', 'associada', 'fatura_id', p_fatura_id, 'unidade_consumidora_id', v_uc.id);
end;
$$;

-- Tenta identificar novamente faturas pendentes (ex.: após cadastrar novas UCs)
create or replace function public.reidentificar_pendentes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_qtd integer := 0;
  v_uc public.unidades_consumidoras;
  v_fatura public.faturas;
begin
  perform public.exigir_permissao('importar');
  for r in
    select f.id, f.numero_uc_extraido_normalizado
      from public.faturas f
     where f.status_processamento = 'pendente_identificacao' and not f.excluida
       and f.numero_uc_extraido_normalizado is not null
  loop
    select * into v_uc from public.unidades_consumidoras where numero_uc_normalizado = r.numero_uc_extraido_normalizado;
    if found then
      update public.faturas set unidade_consumidora_id = v_uc.id, status_processamento = 'processada'
       where id = r.id returning * into v_fatura;
      update public.faturas set divergencias = public.calcular_divergencias(v_fatura, v_uc) where id = r.id;
      v_qtd := v_qtd + 1;
    end if;
  end loop;
  return jsonb_build_object('associadas', v_qtd);
end;
$$;

-- Exclusão lógica (documentos já usados em análises não são apagados fisicamente)
create or replace function public.excluir_fatura(p_fatura_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_permissao('excluir');
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusão.' using errcode = '22023';
  end if;
  update public.faturas
     set excluida = true, excluida_em = now(), excluida_por = auth.uid(), motivo_exclusao = btrim(p_motivo)
   where id = p_fatura_id and not excluida;
  if not found then
    raise exception 'Fatura não encontrada ou já excluída.' using errcode = 'P0002';
  end if;
  update public.alertas set ativo = false where fatura_id = p_fatura_id;
end;
$$;

create or replace function public.restaurar_fatura(p_fatura_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_permissao('excluir');
  update public.faturas
     set excluida = false, excluida_em = null, excluida_por = null, motivo_exclusao = null
   where id = p_fatura_id and excluida;
  if not found then
    raise exception 'Fatura não encontrada ou não está excluída.' using errcode = 'P0002';
  end if;
end;
$$;

-- Pagamento: confirmação explícita, separada do valor faturado
create or replace function public.registrar_pagamento(p_fatura_id uuid, p_data date, p_valor numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_permissao('editar');
  if p_data is null then
    update public.faturas
       set pagamento_confirmado = false, data_pagamento = null, valor_pago = null, pagamento_registrado_por = auth.uid()
     where id = p_fatura_id;
  else
    if p_valor is null or p_valor < 0 then
      raise exception 'Valor pago inválido.' using errcode = '22023';
    end if;
    update public.faturas
       set pagamento_confirmado = true, data_pagamento = p_data, valor_pago = round(p_valor, 2),
           pagamento_registrado_por = auth.uid()
     where id = p_fatura_id;
  end if;
  if not found then
    raise exception 'Fatura não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

-- Importação de UCs por planilha: validação definitiva no banco.
-- p_modo: 'incluir' (somente novas), 'atualizar' (somente existentes), 'incluir_atualizar'.
create or replace function public.importar_ucs(p_registros jsonb, p_modo text, p_nome_arquivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_cfg jsonb;
  v_erros jsonb := '[]'::jsonb;
  v_vistos text[] := array[]::text[];
  v_norm text;
  v_cnpj text;
  v_existente public.unidades_consumidoras;
  v_incluidas integer := 0;
  v_atualizadas integer := 0;
  v_sem_alteracao integer := 0;
  v_rejeitadas integer := 0;
  v_total integer := 0;
  v_msg text;
  v_hist uuid;
  v_status text;
begin
  if p_modo not in ('incluir', 'atualizar', 'incluir_atualizar') then
    raise exception 'Modo de importação inválido.' using errcode = '22023';
  end if;
  if p_modo in ('incluir', 'incluir_atualizar') then
    perform public.exigir_permissao('cadastrar');
  end if;
  if p_modo in ('atualizar', 'incluir_atualizar') then
    perform public.exigir_permissao('editar');
  end if;
  if jsonb_typeof(p_registros) <> 'array' then
    raise exception 'Registros em formato inválido.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_registros) > 5000 then
    raise exception 'Limite de 5.000 linhas por importação excedido.' using errcode = '22023';
  end if;

  select valor into v_cfg from public.configuracoes where chave = 'cadastro_uc';

  for r in
    select (x ->> 'linha')::int as linha,
           btrim(coalesce(x ->> 'numero_uc', '')) as numero_uc,
           btrim(coalesce(x ->> 'fazenda', '')) as fazenda,
           coalesce(x ->> 'cnpj', '') as cnpj,
           nullif(btrim(coalesce(x ->> 'endereco', '')), '') as endereco,
           nullif(btrim(coalesce(x ->> 'filial', '')), '') as filial
      from jsonb_array_elements(p_registros) as x
  loop
    v_total := v_total + 1;
    v_msg := null;
    v_norm := public.normalizar_uc(r.numero_uc);
    v_cnpj := public.normalizar_cnpj(r.cnpj);

    if v_norm is null then
      v_msg := 'Número da UC não informado.';
    elsif r.fazenda = '' then
      v_msg := 'Fazenda não informada.';
    elsif v_cnpj is null then
      v_msg := 'CNPJ não informado.';
    elsif not public.cnpj_valido(v_cnpj) then
      v_msg := 'CNPJ inválido (' || r.cnpj || ').';
    elsif coalesce((v_cfg ->> 'filial_obrigatoria')::boolean, false) and r.filial is null then
      v_msg := 'Filial não informada.';
    elsif coalesce((v_cfg ->> 'endereco_obrigatorio')::boolean, false) and r.endereco is null then
      v_msg := 'Endereço não informado.';
    elsif v_norm = any (v_vistos) then
      v_msg := 'UC duplicada na planilha (' || r.numero_uc || ').';
    end if;

    if v_msg is null then
      v_vistos := array_append(v_vistos, v_norm);
      select * into v_existente from public.unidades_consumidoras where numero_uc_normalizado = v_norm;
      if found then
        if p_modo = 'incluir' then
          v_msg := 'UC já cadastrada (modo inclusão não altera cadastros existentes).';
        elsif v_existente.fazenda = r.fazenda and v_existente.cnpj = v_cnpj
              and v_existente.endereco is not distinct from r.endereco
              and v_existente.filial is not distinct from r.filial then
          v_sem_alteracao := v_sem_alteracao + 1;
        else
          update public.unidades_consumidoras
             set fazenda = r.fazenda, cnpj = v_cnpj, endereco = r.endereco, filial = r.filial
           where id = v_existente.id;
          v_atualizadas := v_atualizadas + 1;
        end if;
      else
        if p_modo = 'atualizar' then
          v_msg := 'UC não cadastrada (modo atualização não inclui novas UCs).';
        else
          insert into public.unidades_consumidoras (numero_uc, fazenda, cnpj, endereco, filial)
          values (r.numero_uc, r.fazenda, v_cnpj, r.endereco, r.filial);
          v_incluidas := v_incluidas + 1;
        end if;
      end if;
    end if;

    if v_msg is not null then
      v_rejeitadas := v_rejeitadas + 1;
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'linha', r.linha, 'numero_uc', r.numero_uc, 'motivo', v_msg));
    end if;
  end loop;

  v_status := case
    when v_rejeitadas = 0 then 'sucesso'
    when v_incluidas + v_atualizadas + v_sem_alteracao = 0 then 'falha'
    else 'parcial' end;

  insert into public.historico_importacoes (
    nome_arquivo, tipo_importacao, quantidade_processada, quantidade_importada,
    quantidade_atualizada, quantidade_rejeitada, status, resultado, detalhes_erros_json, usuario_id)
  values (coalesce(p_nome_arquivo, 'planilha'), 'planilha_uc', v_total, v_incluidas, v_atualizadas,
          v_rejeitadas, v_status,
          format('%s incluída(s), %s atualizada(s), %s sem alteração, %s rejeitada(s). Modo: %s.',
                 v_incluidas, v_atualizadas, v_sem_alteracao, v_rejeitadas, p_modo),
          v_erros, auth.uid())
  returning id into v_hist;

  return jsonb_build_object(
    'historico_id', v_hist,
    'processadas', v_total,
    'incluidas', v_incluidas,
    'atualizadas', v_atualizadas,
    'sem_alteracao', v_sem_alteracao,
    'rejeitadas', v_rejeitadas,
    'erros', v_erros);
end;
$$;

-- Grava o resultado da análise de alertas preservando status/observações já registrados.
-- Alertas pendentes que deixaram de ser detectados são desativados (não apagados).
create or replace function public.salvar_alertas(p_alertas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_novos integer;
  v_desativados integer;
begin
  perform public.exigir_permissao('importar');
  if jsonb_typeof(p_alertas) <> 'array' then
    raise exception 'Alertas em formato inválido.' using errcode = '22023';
  end if;

  with dados as (
    select * from jsonb_to_recordset(p_alertas) as x(
      chave_unica text, unidade_consumidora_id uuid, fatura_id uuid, tipo_alerta text,
      classificacao text, indicador text, periodo date, valor_atual numeric,
      valor_comparacao numeric, variacao_percentual numeric, descricao text)
  ), ins as (
    insert into public.alertas as a (
      chave_unica, unidade_consumidora_id, fatura_id, tipo_alerta, classificacao, indicador,
      periodo, valor_atual, valor_comparacao, variacao_percentual, descricao, ativo)
    select chave_unica, unidade_consumidora_id, fatura_id, tipo_alerta, classificacao, indicador,
           periodo, round(valor_atual, 4), round(valor_comparacao, 4), round(variacao_percentual, 2), descricao, true
      from dados
    on conflict (chave_unica) do update set
      classificacao = excluded.classificacao,
      indicador = excluded.indicador,
      valor_atual = excluded.valor_atual,
      valor_comparacao = excluded.valor_comparacao,
      variacao_percentual = excluded.variacao_percentual,
      descricao = excluded.descricao,
      fatura_id = excluded.fatura_id,
      ativo = true
    returning (xmax = 0) as inserido
  )
  select count(*) filter (where inserido) into v_novos from ins;

  update public.alertas
     set ativo = false
   where ativo
     and status = 'pendente'
     and chave_unica not in (select x ->> 'chave_unica' from jsonb_array_elements(p_alertas) x);
  get diagnostics v_desativados = row_count;

  return jsonb_build_object('novos', v_novos, 'desativados', v_desativados,
                            'total', jsonb_array_length(p_alertas));
end;
$$;

-- Gestão de papéis por administradores (impede remover o último administrador)
create or replace function public.definir_papel_usuario(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_permissao('configurar');
  if p_user_id = auth.uid() and p_role <> 'admin' then
    if (select count(*) from public.user_roles where role = 'admin') <= 1 then
      raise exception 'Não é possível remover o último administrador.' using errcode = '22023';
    end if;
  end if;
  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role) values (p_user_id, p_role);
end;
$$;

-- Permissões de execução: somente usuários autenticados
revoke execute on function public.registrar_fatura(jsonb, jsonb, uuid, uuid) from public, anon;
revoke execute on function public.registrar_evento_fiscal(jsonb) from public, anon;
revoke execute on function public.associar_fatura_uc(uuid, uuid) from public, anon;
revoke execute on function public.reidentificar_pendentes() from public, anon;
revoke execute on function public.excluir_fatura(uuid, text) from public, anon;
revoke execute on function public.restaurar_fatura(uuid) from public, anon;
revoke execute on function public.registrar_pagamento(uuid, date, numeric) from public, anon;
revoke execute on function public.importar_ucs(jsonb, text, text) from public, anon;
revoke execute on function public.salvar_alertas(jsonb) from public, anon;
revoke execute on function public.definir_papel_usuario(uuid, public.app_role) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.registrar_fatura(jsonb, jsonb, uuid, uuid) to authenticated;
grant execute on function public.registrar_evento_fiscal(jsonb) to authenticated;
grant execute on function public.associar_fatura_uc(uuid, uuid) to authenticated;
grant execute on function public.reidentificar_pendentes() to authenticated;
grant execute on function public.excluir_fatura(uuid, text) to authenticated;
grant execute on function public.restaurar_fatura(uuid) to authenticated;
grant execute on function public.registrar_pagamento(uuid, date, numeric) to authenticated;
grant execute on function public.importar_ucs(jsonb, text, text) to authenticated;
grant execute on function public.salvar_alertas(jsonb) to authenticated;
grant execute on function public.definir_papel_usuario(uuid, public.app_role) to authenticated;

-- -----------------------------------------------------------------------------
-- 12. Armazenamento privado dos XMLs
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faturas-xml', 'faturas-xml', false, 5242880,
        array['application/xml', 'text/xml', 'text/plain', 'application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "faturas_xml_select" on storage.objects for select to authenticated
  using (bucket_id = 'faturas-xml' and public.tem_permissao('visualizar'));
create policy "faturas_xml_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'faturas-xml' and public.tem_permissao('importar'));

-- -----------------------------------------------------------------------------
-- 13. Grants do Data API
-- O PostgREST não concede privilégios padrão no schema public, então cada table
-- pública recebe apenas as operações previstas nas políticas RLS acima.
-- -----------------------------------------------------------------------------
grant select, update on public.perfis to authenticated;
grant all on public.perfis to service_role;

grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

grant select, update on public.configuracoes to authenticated;
grant all on public.configuracoes to service_role;

grant select, insert, update, delete on public.unidades_consumidoras to authenticated;
grant all on public.unidades_consumidoras to service_role;

grant select, insert, update on public.historico_importacoes to authenticated;
grant all on public.historico_importacoes to service_role;

grant select on public.faturas to authenticated;
grant all on public.faturas to service_role;

grant select on public.itens_fatura to authenticated;
grant all on public.itens_fatura to service_role;

grant select on public.eventos_fiscais to authenticated;
grant all on public.eventos_fiscais to service_role;

grant select on public.alertas to authenticated;
grant all on public.alertas to service_role;

grant select on public.log_operacoes to authenticated;
grant all on public.log_operacoes to service_role;
