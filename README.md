# Controle Energia Elétrica — Gestão e Análise de Energia Rural

Aplicação web para gestão, controle e análise das despesas e do consumo de energia elétrica
de uma fazenda com diversas unidades consumidoras (UCs). Importa os XMLs reais das notas
fiscais de energia (NF3e), relaciona cada fatura à sua UC e gera indicadores, gráficos,
alertas e relatórios exportáveis.

Projeto conectado ao [Lovable](https://lovable.dev/projects/51e4de4a-aac7-4385-90e3-552f6886771f).

## Funcionalidades

| Menu                            | O que faz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                   | 10 indicadores e 8 gráficos calculados a partir das faturas importadas, com filtros por período, fazenda, UC, filial, CNPJ, situação da UC e critério de consolidação (competência ou emissão). Clique em um mês para ver as faturas.                                                                                                                                                                                                                                                                |
| **Unidades Consumidoras**       | Cadastro, edição, inativação e exclusão (somente sem faturas). Cada UC tem uma **Área** (Agrícola, Pecuária, Seringal, Administrativo, Oficina… — lista configurável) para analisar e filtrar por área de cada fazenda. Importação por planilha XLSX/CSV no padrão _Numero da UC, Fazenda, CNPJ, Endereço, Filial, Situação, Área_, com modelo para download, identificação automática de colunas, prévia (inclusões, alterações campo a campo, rejeições por linha) e modos inclusão / atualização. |
| **Importar XML**                | Upload de vários XMLs (arrastar e soltar). Os arquivos são lidos **no servidor**, pré-analisados (duplicidade, UC, valores, avisos) e só gravados após confirmação. XML original guardado em armazenamento privado.                                                                                                                                                                                                                                                                                  |
| **Faturas**                     | Lista com filtros; detalhe com dados extraídos, itens, XML original, reprocessamento, associação/correção da UC, confirmação de pagamento e exclusão lógica.                                                                                                                                                                                                                                                                                                                                         |
| **Pendências de Identificação** | Faturas cuja UC não está cadastrada: selecionar UC existente, cadastrar nova UC, reprocessar identificação ou o XML.                                                                                                                                                                                                                                                                                                                                                                                 |
| **Energia Solar (GD)**          | Energia injetada na rede (medição), créditos compensados, economia em R$, % do consumo compensado, valor médio do kWh compensado, saldo de créditos, créditos a expirar e expirados, potência instalada e injeção por kWp (grupo gSCEE da NF3e). Alertas de queda de injeção (possível falha, sujeira ou sombreamento, considerando sazonalidade), créditos a expirar/expirados e saldo acumulado elevado. A fatura mostra o excedente injetado, não a geração total.                                |
| **Análises e Alertas**          | Regras configuráveis (consumo, custo, R$/kWh, ausência de fatura, duplicidade, consumo zerado/negativo, componentes tarifários, UCs semelhantes) com status pendente/analisado/resolvido.                                                                                                                                                                                                                                                                                                            |
| **Relatórios**                  | 10 relatórios com filtros, seleção de colunas, ordenação e exportação Excel/CSV apenas dos registros filtrados.                                                                                                                                                                                                                                                                                                                                                                                      |
| **Histórico de Importações**    | Data, usuário, arquivo, resultado, erros e avisos de cada importação.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Configurações**               | Limites das regras de análise, campos obrigatórios do cadastro, critério padrão, usuários e perfis, registro de operações (auditoria) e metodologia.                                                                                                                                                                                                                                                                                                                                                 |

Busca global (Ctrl+K) por número da UC, fazenda, CNPJ, filial e número/chave da fatura.

### Projeto publicado × edição no Lovable

No **projeto publicado** os usuários veem apenas **Dashboard, Faturas, Energia Solar (GD), Análises e
Alertas e Relatórios** (a análise de uma UC continua acessível pelos gráficos). **Unidades Consumidoras,
Importar XML, Pendências, Histórico de Importações e Configurações** aparecem só no **preview do editor
Lovable** (`*.lovableproject.com`, `id-preview--…`/`preview--…`) e no desenvolvimento local; no publicado,
esses endereços redirecionam ao Dashboard (`src/lib/ambiente.ts`). O controle de acesso aos dados
continua sendo feito pelos perfis.

## Arquitetura

- **Frontend**: TanStack Start (React 19, roteamento por arquivos em `src/routes`), Tailwind 4, shadcn/ui, Recharts.
- **Backend**: Supabase (PostgreSQL, Auth, Storage) + _server functions_ do TanStack Start (`src/backend/faturas.functions.ts`).
- **Banco**: migrações em `drizzle/migrations/` (Lovable Cloud), espelhadas em `supabase/migrations/`.

### Fluxo de importação de XML

1. O navegador envia o conteúdo do arquivo para a server function com o token da sessão.
2. O servidor valida o usuário e a permissão, rejeita DOCTYPE/ENTITY (XXE), valida a estrutura e
   identifica o leiaute (`src/lib/xml/leitor-fatura.ts`).
3. Extrai os campos **efetivamente presentes** (o que não existe fica `null` = indisponível).
4. Calcula o hash SHA-256 do arquivo e guarda o XML original no bucket privado `faturas-xml`.
5. Chama a função do banco `registrar_fatura`, que em uma única transação: impede duplicidade
   (chave de acesso → hash → emitente+modelo+série+número), associa a UC **somente pelo número da UC**
   (CNPJ e endereço são usados apenas para apontar divergências), grava fatura + itens, aplica
   cancelamentos/substituições conhecidos e registra o resultado no histórico.
6. Os alertas são recalculados e os indicadores atualizados.

### Leiautes suportados

- **NF3e (modelo 66)** — `nf3eProc` (com protocolo) ou `NF3e`; grupos `ide`, `emit`, `dest`,
  `acessante/idAcesso` (UC), `gSub`, `gGrContrat`, `gMed`, `NFdet/det/detItem` (`gTarif`, `prod`,
  `gMedicao/gMedida`, `imposto`), `total`, `gFat`, `gSCEE`, `gANEEL`, `infAdic`, `protNF3e`.
- **Eventos** — `procEventoNF3e`/`procEventoNFe`; cancelamento (110111) homologado marca a fatura como cancelada (também se o evento chegar antes da fatura).
- **NF-e (modelo 55) de energia** — UC e competência buscadas nas informações complementares; quantidade em MWh convertida para kWh.
- Substituição (`finNF3e=2` + `gSub/chNF3e`) marca o documento original como substituído.

### Classificação dos itens

Os itens são classificados pela descrição (`src/lib/xml/classificacao-itens.ts`): consumo (TUSD/TE),
demanda, reativo, energia injetada, compensação, bandeira, CIP/COSIP, multa, juros, encargos,
descontos e outros. `indDevolucao=1` é tratado como valor negativo. Créditos de GD são apenas os lançamentos **negativos** de injeção/compensação: a energia “SCEE”/“GD” cobrada pelo preço cheio é consumo, e item de energia negativo em fatura com `gSCEE` é crédito. Créditos lançados pela distribuidora (ex.: “CRÉDITO DE CONSUMO”, “DEV. ICMS COB. A MAIOR (-)”, “COMPENSAÇÃO DE DIC”) são abatimentos que entram no custo da fatura zerada; créditos de energia solar não entram. Quando os abatimentos (créditos, injeção/compensação SCEE ou cClass do grupo 5) vêm com `vProd` positivo e sem `indDevolucao` (caso da Equatorial), o sinal é invertido se assim a soma dos itens fecha com o vNF; fatura zerada sem nenhum crédito identificado gera aviso. Após mudanças nas regras, use **Configurações → Cadastro e consolidação → Reprocessar todas as faturas**. Quando a soma dos itens difere
do total do documento, um aviso é registrado — o total do documento (vNF) é sempre a referência.

## Regras de cálculo

- **Faturas válidas**: não excluídas, não canceladas, não substituídas, associadas a uma UC e com valor total. Pendentes de identificação não entram nos indicadores.
- **Custo da energia (base padrão)**: fatura **sem valor a pagar** (vNF zerado) → vNF **+ créditos abatidos pela distribuidora** (crédito de consumo, compensação DIC/FIC); créditos de **energia solar (GD) não são somados** — a geração própria reduz o custo e é analisada na aba Energia Solar; fatura **com valor a pagar** → custo da energia = valor faturado (créditos não somados). Nos filtros (e em Configurações) é possível trocar para **Valor faturado (líquido)**. Dashboard, faturas, UCs e relatórios mostram lado a lado custo da energia, créditos e valor faturado. Componentes e tributos nunca são somados ao total.
- **Grupo BC** (energia injetada por terceiros): as **usinas (UCs geradoras)** do Grupo BC são cadastradas na guia **Grupo BC** (só no editor) e, em cada fatura, entram só as linhas “INJEÇÃO SCEE – UC <usina do Grupo BC>”: **Valor Grupo BC** = kWh injetados × tarifa do CONSUMO NÃO COMPENSADO × 0,80; **Desconto** = kWh injetados × (tarifa do CONSUMO NÃO COMPENSADO + tarifa ADC BANDEIRA) − Valor Grupo BC; **Custo cheio** = Valor + Desconto. kWh = essas linhas, sem repetir a mesma energia de TE/TUSD; tarifas = preço unitário com tributos (sem bandeira = 0); arredondamento só no final; sem injeção = 0. O **custo cheio** soma ao custo da energia; os três valores aparecem em cartões e colunas no Dashboard, Faturas e Relatórios. Calculado na leitura (não precisa reprocessar).
- **Consumo total**: soma do consumo (kWh) das faturas com consumo disponível. O consumo vem dos itens de energia ativa faturada sem somar duas vezes a mesma energia cobrada em TUSD e TE; na ausência, da medição (sem duplicar medições repetidas em vários itens).
- **Custo médio por UC**: custo total ÷ UCs com faturas válidas no período.
- **Custo por kWh**: valor total ÷ consumo, apenas faturas com consumo positivo (mesmo conjunto no numerador e no denominador).
- **Variação %**: (atual − anterior) ÷ anterior × 100, quando anterior ≠ 0; período anterior de mesma duração.
- **Período**: por competência (CompetFat) ou por data de emissão, escolhido nos filtros.
- **Valor faturado ≠ pago**: o pagamento só é confirmado manualmente (data e valor pago).

### Alertas

Comparações por competência; consumo e custo comparados por **média diária** quando há dias
faturados. _Alerta confirmado_ = desvio em duas referências (mês anterior **e** mesmo mês do ano
anterior ou média histórica). _Possível anomalia_ = uma referência, histórico insuficiente ou
variação compatível com sazonalidade. Alertas não afirmam desperdício; indicam o que verificar.
Ao recalcular, status e observações já registrados são preservados.

## Segurança

- Autenticação Supabase; o **primeiro usuário cadastrado vira administrador**, os demais entram como _consulta_.
- Perfis: **admin** (tudo), **gestor** (visualizar, cadastrar, importar, editar), **operador** (visualizar, cadastrar, importar), **consulta** (visualizar/exportar).
- RLS em todas as tabelas; faturas, itens e alertas só são gravados por funções do banco que verificam permissão.
- Bucket `faturas-xml` privado; limites de 5 MB por XML, 200 arquivos por lote, 10 MB e 5.000 linhas por planilha.
- Exclusão lógica de faturas (com motivo, restaurável); UCs com faturas só podem ser inativadas.
- Auditoria (`log_operacoes`) de alterações em UCs, faturas, permissões, configurações e alertas.
- Somente a chave pública (publishable/anon) é usada; nenhuma chave administrativa no frontend ou no servidor.

## Configuração

1. Conecte um projeto Supabase (no Lovable: ative o **Lovable Cloud**/integração Supabase).
2. Aplique a migração de `supabase/migrations/`.
3. Variáveis de ambiente (veja `.env.example`): `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Crie o primeiro usuário em `/login` → aba “Criar acesso” (ele será administrador).

## Desenvolvimento

```sh
bun install       # ou npm i
bun run dev       # servidor local
bun run test      # testes unitários (parser NF3e, cálculos, alertas, planilhas)
bun run lint
bun run build
```
