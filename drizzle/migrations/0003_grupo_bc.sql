-- =============================================================================
-- Grupo BC: unidades consumidoras que recebem energia injetada por terceiros.
-- Para essas UCs o sistema calcula, a partir dos itens da fatura:
--   Valor Grupo BC = kWh injetados (INJEÇÃO SCEE) × tarifa do CONSUMO NÃO
--                    COMPENSADO (preço unitário com tributos) × 0,80
-- O cálculo é feito na leitura (faturas já importadas não precisam ser
-- reprocessadas); aqui fica apenas a marcação da UC.
-- =============================================================================

alter table public.unidades_consumidoras
  add column if not exists grupo_bc boolean not null default false;

create index if not exists idx_uc_grupo_bc
  on public.unidades_consumidoras (grupo_bc) where grupo_bc;
