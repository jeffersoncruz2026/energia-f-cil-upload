-- =============================================================================
-- Grupo BC identificado pela usina (UC geradora): só as linhas
-- "INJEÇÃO SCEE – UC <usina do Grupo BC>" entram no cálculo. A lista de usinas
-- fica em configuracoes.grupo_bc = {"geradoras": ["000405731001244", ...]}.
-- (A coluna unidades_consumidoras.grupo_bc deixa de ser usada pelo sistema.)
-- =============================================================================

insert into public.configuracoes (chave, valor, descricao)
values ('grupo_bc', '{"geradoras": []}'::jsonb, 'UCs geradoras (usinas) do Grupo BC')
on conflict (chave) do nothing;
