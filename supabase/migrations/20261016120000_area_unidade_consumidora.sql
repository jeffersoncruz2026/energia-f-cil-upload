-- =============================================================================
-- Área da unidade consumidora (Agrícola, Pecuária, Seringal, Administrativo,
-- Oficina…) para análise e filtros por área de cada fazenda.
-- A planilha de cadastro passa a aceitar também as colunas Situação e Área.
-- =============================================================================

alter table public.unidades_consumidoras add column if not exists area text;
create index if not exists idx_uc_area on public.unidades_consumidoras (area);

-- Áreas sugeridas (configuráveis) e obrigatoriedade do campo
update public.configuracoes
   set valor = jsonb_build_object(
         'area_obrigatoria', false,
         'areas', jsonb_build_array('Agrícola', 'Pecuária', 'Seringal', 'Administrativo', 'Oficina')
       ) || valor
 where chave = 'cadastro_uc';

-- Chave de comparação sem acentos, espaços extras ou diferença de maiúsculas
create or replace function public.chave_texto(_t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    lower(regexp_replace(translate(btrim(coalesce(_t, '')),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'), '\s+', ' ', 'g')),
    '')
$$;

-- Grafia padrão da área: usa a da lista configurada ou a de uma UC já cadastrada,
-- evitando "agricola" e "Agrícola" como áreas diferentes nos filtros.
create or replace function public.area_canonica(_area text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.chave_texto(_area) is null then null else coalesce(
    (select a
       from public.configuracoes c, jsonb_array_elements_text(coalesce(c.valor -> 'areas', '[]'::jsonb)) a
      where c.chave = 'cadastro_uc' and public.chave_texto(a) = public.chave_texto(_area)
      limit 1),
    (select u.area
       from public.unidades_consumidoras u
      where public.chave_texto(u.area) = public.chave_texto(_area)
      order by u.created_at
      limit 1),
    regexp_replace(btrim(_area), '\s+', ' ', 'g')) end
$$;

-- Situação informada em texto (planilha): ativa/ativo/inativa/inativo
create or replace function public.situacao_texto(_t text)
returns public.situacao_uc
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text := public.chave_texto(_t);
begin
  if k is null then
    return null;
  elsif k in ('ativa', 'ativo', 'a', 'sim', 's') then
    return 'ativa';
  elsif k in ('inativa', 'inativo', 'i', 'nao', 'n') then
    return 'inativa';
  end if;
  raise exception 'Situação inválida (%). Use Ativa ou Inativa.', _t using errcode = '22023';
end;
$$;

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
  new.area := public.area_canonica(new.area);
  new.observacoes := nullif(btrim(coalesce(new.observacoes, '')), '');
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Importação por planilha: inclui Situação e Área. Colunas ausentes na planilha
-- (chave ausente no JSON) não alteram o cadastro existente.
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
  v_situacao public.situacao_uc;
  v_area text;
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
           nullif(btrim(coalesce(x ->> 'filial', '')), '') as filial,
           x ? 'situacao' as tem_situacao,
           x ->> 'situacao' as situacao,
           x ? 'area' as tem_area,
           x ->> 'area' as area
      from jsonb_array_elements(p_registros) as x
  loop
    v_total := v_total + 1;
    v_msg := null;
    v_situacao := null;
    v_norm := public.normalizar_uc(r.numero_uc);
    v_cnpj := public.normalizar_cnpj(r.cnpj);
    v_area := public.area_canonica(r.area);

    begin
      v_situacao := public.situacao_texto(r.situacao);
    exception when sqlstate '22023' then
      v_msg := 'Situação inválida (' || r.situacao || '). Use Ativa ou Inativa.';
    end;

    if v_msg is not null then
      null;
    elsif v_norm is null then
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
    elsif coalesce((v_cfg ->> 'area_obrigatoria')::boolean, false) and r.tem_area and v_area is null then
      v_msg := 'Área não informada.';
    elsif v_norm = any (v_vistos) then
      v_msg := 'UC duplicada na planilha (' || r.numero_uc || ').';
    end if;

    if v_msg is null then
      v_vistos := array_append(v_vistos, v_norm);
      select * into v_existente from public.unidades_consumidoras where numero_uc_normalizado = v_norm;
      if found then
        if p_modo = 'incluir' then
          v_msg := 'UC já cadastrada (modo inclusão não altera cadastros existentes).';
        else
          if not r.tem_area then
            v_area := v_existente.area;
          end if;
          if v_situacao is null then
            v_situacao := v_existente.situacao;
          end if;
          if coalesce((v_cfg ->> 'area_obrigatoria')::boolean, false) and v_area is null then
            v_msg := 'Área não informada.';
          elsif v_existente.fazenda = r.fazenda and v_existente.cnpj = v_cnpj
                and v_existente.endereco is not distinct from r.endereco
                and v_existente.filial is not distinct from r.filial
                and v_existente.area is not distinct from v_area
                and v_existente.situacao = v_situacao then
            v_sem_alteracao := v_sem_alteracao + 1;
          else
            update public.unidades_consumidoras
               set fazenda = r.fazenda, cnpj = v_cnpj, endereco = r.endereco, filial = r.filial,
                   area = v_area, situacao = v_situacao
             where id = v_existente.id;
            v_atualizadas := v_atualizadas + 1;
          end if;
        end if;
      else
        if p_modo = 'atualizar' then
          v_msg := 'UC não cadastrada (modo atualização não inclui novas UCs).';
        elsif coalesce((v_cfg ->> 'area_obrigatoria')::boolean, false) and v_area is null then
          v_msg := 'Área não informada.';
        else
          insert into public.unidades_consumidoras (numero_uc, fazenda, cnpj, endereco, filial, area, situacao)
          values (r.numero_uc, r.fazenda, v_cnpj, r.endereco, r.filial, v_area, coalesce(v_situacao, 'ativa'));
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

revoke execute on function public.importar_ucs(jsonb, text, text) from public, anon;
grant execute on function public.importar_ucs(jsonb, text, text) to authenticated;
revoke execute on function public.area_canonica(text) from public, anon;
grant execute on function public.area_canonica(text) to authenticated;
