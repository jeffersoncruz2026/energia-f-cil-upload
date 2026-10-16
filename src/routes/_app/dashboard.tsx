import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  CircleDollarSign,
  BadgePercent,
  Gauge,
  Handshake,
  PiggyBank,
  Receipt,
  Scale,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  CabecalhoPagina,
  CartaoIndicador,
  Carregando,
  EstadoVazio,
  MensagemErro,
} from "@/components/app/comuns";
import { BarraFiltros } from "@/components/app/filtros";
import {
  CartaoGrafico,
  COR_CONSUMO,
  COR_CUSTO,
  GraficoBarrasHorizontais,
  GraficoIndexado,
  GraficoMensal,
} from "@/components/app/graficos";
import { BotaoMetodologia } from "@/components/app/metodologia";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  agruparPor,
  calcularIndicadores,
  creditosDaFatura,
  custoDaFatura,
  ROTULOS_BASE_CUSTO,
  filtrarFaturas,
  mesDaFatura,
  serieMensal,
  type FaturaAnalise,
} from "@/lib/analise/calculos";
import { useFiltrosAnalise } from "@/lib/analise/use-filtros";
import { ehAmbienteEdicao } from "@/lib/ambiente";
import { useAuth } from "@/lib/auth";
import { mensagemErro, useConfiguracoes, useFaturasAnalise, useUcs } from "@/lib/consultas";
import {
  formatarCompetencia,
  formatarCustoKwh,
  formatarKwh,
  formatarMoeda,
  formatarMoedaCompacta,
  formatarNumero,
  formatarPercentual,
  rotuloMes,
} from "@/lib/formatacao";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Controle Energia" }] }),
  component: Dashboard,
});

function Dashboard() {
  const faturasQ = useFaturasAnalise();
  const ucsQ = useUcs();
  const { data: cfg } = useConfiguracoes();
  const { pode } = useAuth();
  const navigate = useNavigate();
  const [filtros, setFiltros] = useFiltrosAnalise(
    faturasQ.data,
    cfg?.criterio ?? (cfg ? "competencia" : undefined),
  );
  const [mesDetalhe, setMesDetalhe] = useState<string | null>(null);

  const ucs = useMemo(() => ucsQ.data ?? [], [ucsQ.data]);
  const faturas = useMemo(() => faturasQ.data ?? [], [faturasQ.data]);
  const ucsPorId = useMemo(() => new Map(ucs.map((u) => [u.id, u])), [ucs]);

  const analise = useMemo(() => {
    const ind = calcularIndicadores(faturas, ucs, filtros);
    const doPeriodo = filtrarFaturas(faturas, ucsPorId, filtros);
    const serie = serieMensal(doPeriodo, filtros.criterio, ind.intervalo, filtros.baseCusto);
    const porFazenda = agruparPor(
      doPeriodo,
      ucsPorId,
      (u) => ({
        chave: u.fazenda,
        rotulo: u.fazenda,
      }),
      filtros.baseCusto,
    );
    const porFilial = agruparPor(
      doPeriodo,
      ucsPorId,
      (u) => ({
        chave: u.filial ?? "—",
        rotulo: u.filial ?? "Sem filial",
      }),
      filtros.baseCusto,
    );
    const porArea = agruparPor(
      doPeriodo,
      ucsPorId,
      (u) => ({
        chave: u.area ?? "",
        rotulo: u.area ?? "Sem área definida",
      }),
      filtros.baseCusto,
    );
    const porUc = agruparPor(
      doPeriodo,
      ucsPorId,
      (u) => ({
        chave: u.id,
        rotulo: `UC ${u.numero_uc}`,
      }),
      filtros.baseCusto,
    );
    return { ind, doPeriodo, serie, porFazenda, porFilial, porArea, porUc };
  }, [faturas, ucs, ucsPorId, filtros]);

  if (faturasQ.error || ucsQ.error) {
    return (
      <MensagemErro
        erro={mensagemErro(faturasQ.error ?? ucsQ.error, "Não foi possível carregar os dados.")}
      />
    );
  }
  if (faturasQ.isLoading || ucsQ.isLoading) return <Carregando />;

  const semFaturas = faturas.length === 0;
  const { ind } = analise;
  const periodoTexto = ind.intervalo
    ? `${formatarCompetencia(`${ind.intervalo.inicio}-01`)} a ${formatarCompetencia(`${ind.intervalo.fim}-01`)}`
    : "todo o histórico";
  const anteriorTexto = ind.intervaloAnterior
    ? `vs. ${formatarCompetencia(`${ind.intervaloAnterior.inicio}-01`)}–${formatarCompetencia(`${ind.intervaloAnterior.fim}-01`)}`
    : undefined;

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Dashboard executivo"
        descricao={`Indicadores calculados a partir das faturas importadas · ${periodoTexto} · por ${
          filtros.criterio === "competencia" ? "competência" : "data de emissão"
        }`}
        acoes={
          <>
            <BotaoMetodologia />
            {pode("importar") && ehAmbienteEdicao() && (
              <Button asChild size="sm">
                <Link to="/importar">
                  <Upload className="mr-1.5 h-4 w-4" /> Importar XML
                </Link>
              </Button>
            )}
          </>
        }
      />

      {semFaturas ? (
        <EstadoVazio
          icone={Zap}
          titulo="Nenhuma fatura importada ainda"
          descricao={
            ucs.length
              ? "Importe os XMLs das contas de energia para que os indicadores e gráficos sejam calculados com dados reais."
              : "Comece cadastrando as unidades consumidoras e depois importe os XMLs das contas de energia."
          }
          acao={
            ehAmbienteEdicao() && (
              <div className="flex flex-wrap justify-center gap-2">
                {!ucs.length && (
                  <Button variant="outline" asChild>
                    <Link to="/unidades">
                      <Building2 className="mr-2 h-4 w-4" /> Cadastrar UCs
                    </Link>
                  </Button>
                )}
                <Button asChild>
                  <Link to="/importar">
                    <Upload className="mr-2 h-4 w-4" /> Importar primeiras faturas
                  </Link>
                </Button>
              </div>
            )
          }
        />
      ) : (
        <>
          <BarraFiltros filtros={filtros} aoMudar={setFiltros} ucs={ucs} />

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              <CartaoIndicador
                titulo={
                  filtros.baseCusto === "energia" ? "Custo da energia" : "Valor faturado total"
                }
                icone={CircleDollarSign}
                valor={formatarMoeda(ind.custoTotal)}
                variacao={ind.variacaoCusto}
                detalhe={anteriorTexto}
                ajuda={
                  filtros.baseCusto === "energia"
                    ? "Fatura sem valor a pagar: valor faturado + créditos abatidos pela distribuidora. Fatura com valor a pagar: valor faturado. Nas UCs do Grupo BC soma-se o custo cheio do Grupo BC."
                    : "Soma do valor líquido faturado (vNF) das faturas válidas do período. Valor faturado, não necessariamente pago."
                }
              />
              <CartaoIndicador
                titulo="Valor faturado (líquido)"
                icone={Receipt}
                valor={formatarMoeda(ind.valorFaturado)}
                detalhe="efetivamente cobrado (vNF)"
                ajuda="Valor total dos documentos, já descontados os créditos. Nas faturas com valor a pagar, o custo da energia é igual ao valor faturado. Não significa pagamento confirmado."
              />
              <CartaoIndicador
                titulo="Créditos abatidos"
                icone={PiggyBank}
                valor={formatarMoeda(ind.creditos)}
                detalhe={
                  ind.custoTotal > 0 && filtros.baseCusto === "energia"
                    ? `${formatarNumero((ind.creditos / ind.custoTotal) * 100, 1)}% do custo da energia`
                    : "compensação de geração distribuída"
                }
                ajuda="Créditos lançados pela distribuidora (crédito de consumo, compensação DIC/FIC) somados ao custo das faturas sem valor a pagar. Créditos de energia solar ficam na aba Energia Solar."
              />
              <CartaoIndicador
                titulo="Consumo total"
                icone={Zap}
                valor={formatarKwh(ind.consumoTotal)}
                variacao={ind.variacaoConsumo}
                detalhe={anteriorTexto}
                ajuda="Soma do consumo em kWh das faturas válidas com consumo informado."
              />
              <CartaoIndicador
                titulo="Custo médio por kWh"
                icone={Gauge}
                valor={ind.custoKwh != null ? `R$ ${formatarNumero(ind.custoKwh, 4)}` : "—"}
                detalhe={`por kWh · ${ind.faturasComConsumo} de ${ind.quantidadeFaturas} faturas com consumo`}
                ajuda={`${filtros.baseCusto === "energia" ? "Custo da energia (antes dos créditos)" : "Valor faturado"} ÷ consumo, somente das faturas com consumo positivo (mesmo conjunto no numerador e denominador).`}
              />
              <CartaoIndicador
                titulo="Custo médio por UC"
                icone={Receipt}
                valor={formatarMoeda(ind.custoMedioUc)}
                detalhe="no período"
                ajuda="Custo total ÷ UCs com faturas válidas no período."
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <CartaoIndicador
                titulo="Variação do custo"
                icone={TrendingUp}
                valor={formatarPercentual(ind.variacaoCusto)}
                detalhe={
                  ind.anterior
                    ? `anterior: ${formatarMoedaCompacta(ind.anterior.custoTotal)}`
                    : "sem período anterior"
                }
                ajuda="(custo atual − custo do período anterior de mesma duração) ÷ custo anterior × 100."
              />
              <CartaoIndicador
                titulo="Variação do consumo"
                icone={Activity}
                valor={formatarPercentual(ind.variacaoConsumo)}
                detalhe={
                  ind.anterior
                    ? `anterior: ${formatarKwh(ind.anterior.consumoTotal)}`
                    : "sem período anterior"
                }
                ajuda="(consumo atual − consumo do período anterior) ÷ consumo anterior × 100."
              />
              <CartaoIndicador
                titulo="Grupo BC"
                icone={Handshake}
                valor={formatarMoeda(ind.grupoBc)}
                detalhe={`${formatarKwh(ind.kwhGrupoBc)} injetados por terceiros`}
                ajuda="Valor pago ao Grupo BC: kWh injetados (INJEÇÃO SCEE) × tarifa do consumo não compensado (com tributos) × 0,80."
              />
              <CartaoIndicador
                titulo="Desconto Grupo BC"
                icone={BadgePercent}
                valor={formatarMoeda(ind.descontoGrupoBc)}
                detalhe={
                  ind.custoCheioGrupoBc > 0
                    ? `${formatarNumero((ind.descontoGrupoBc / ind.custoCheioGrupoBc) * 100, 1)}% do custo cheio`
                    : "economia com o Grupo BC"
                }
                ajuda="kWh injetados × (tarifa do consumo não compensado + tarifa ADC BANDEIRA) − Valor Grupo BC."
              />
              <CartaoIndicador
                titulo="Custo cheio Grupo BC"
                icone={Scale}
                valor={formatarMoeda(ind.custoCheioGrupoBc)}
                detalhe="incluído no custo da energia"
                ajuda="Valor Grupo BC + Desconto: custo da energia injetada pela tarifa cheia (consumo não compensado + bandeira). É o valor do Grupo BC somado ao custo da energia."
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CartaoGrafico
              titulo="Evolução mensal do custo"
              descricao={`${ROTULOS_BASE_CUSTO[filtros.baseCusto]}. Clique em um mês para ver as faturas.`}
            >
              <GraficoMensal
                dados={analise.serie}
                campo="custo"
                cor={COR_CUSTO}
                rotulo="Custo"
                formatar={formatarMoedaCompacta}
                aoClicarMes={setMesDetalhe}
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Evolução mensal do consumo"
              descricao="Clique em um mês para ver as faturas."
            >
              <GraficoMensal
                dados={analise.serie}
                campo="consumo"
                cor={COR_CONSUMO}
                rotulo="Consumo"
                formatar={(v) => `${formatarNumero(v)} kWh`}
                formatarEixo={(v) => formatarNumero(v)}
                aoClicarMes={setMesDetalhe}
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Custo × consumo ao longo do tempo"
              descricao="Índice (primeiro mês com dados = 100) para comparar as tendências em um único eixo."
            >
              <GraficoIndexado dados={analise.serie} />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Distribuição do custo por filial"
              descricao="Participação no custo total do período."
            >
              <GraficoBarrasHorizontais
                dados={analise.porFilial.map((g) => ({
                  chave: g.chave,
                  rotulo: g.rotulo,
                  valor: g.custo,
                }))}
                cor={COR_CUSTO}
                rotulo="Custo"
                formatar={formatarMoeda}
                mostrarPercentual
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Custo por área"
              descricao="Agrícola, pecuária, seringal, administrativo, oficina… Clique para filtrar."
            >
              <GraficoBarrasHorizontais
                dados={analise.porArea.map((g) => ({
                  chave: g.chave,
                  rotulo: g.rotulo,
                  valor: g.custo,
                  detalhe: `${g.ucs} UC(s) · ${formatarCustoKwh(g.custoKwh)}`,
                }))}
                cor={COR_CUSTO}
                rotulo="Custo"
                formatar={formatarMoeda}
                mostrarPercentual
                aoClicar={(area) => setFiltros({ ...filtros, areas: [area] })}
              />
            </CartaoGrafico>
            <CartaoGrafico titulo="Consumo por área" descricao="Clique para filtrar.">
              <GraficoBarrasHorizontais
                dados={analise.porArea.map((g) => ({
                  chave: g.chave,
                  rotulo: g.rotulo,
                  valor: g.consumo,
                  detalhe: `${g.ucs} UC(s)`,
                }))}
                cor={COR_CONSUMO}
                rotulo="Consumo"
                formatar={(v) => `${formatarNumero(v)} kWh`}
                mostrarPercentual
                aoClicar={(area) => setFiltros({ ...filtros, areas: [area] })}
              />
            </CartaoGrafico>
            <CartaoGrafico titulo="Comparativo de custo entre fazendas">
              <GraficoBarrasHorizontais
                dados={analise.porFazenda.map((g) => ({
                  chave: g.chave,
                  rotulo: g.rotulo,
                  valor: g.custo,
                  detalhe: `${g.ucs} UC(s) · ${formatarCustoKwh(g.custoKwh)}`,
                }))}
                cor={COR_CUSTO}
                rotulo="Custo"
                formatar={formatarMoedaCompacta}
                aoClicar={(fazenda) => setFiltros({ ...filtros, fazendas: [fazenda] })}
              />
            </CartaoGrafico>
            <CartaoGrafico titulo="Comparativo de consumo entre fazendas">
              <GraficoBarrasHorizontais
                dados={analise.porFazenda.map((g) => ({
                  chave: g.chave,
                  rotulo: g.rotulo,
                  valor: g.consumo,
                }))}
                cor={COR_CONSUMO}
                rotulo="Consumo"
                formatar={(v) => `${formatarNumero(v)} kWh`}
                aoClicar={(fazenda) => setFiltros({ ...filtros, fazendas: [fazenda] })}
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Ranking das UCs com maior custo"
              descricao="Clique para abrir a análise da UC."
            >
              <GraficoBarrasHorizontais
                dados={analise.porUc.map((g) => ({
                  chave: g.chave,
                  rotulo: g.rotulo,
                  valor: g.custo,
                  detalhe: ucsPorId.get(g.chave)?.fazenda ?? "",
                }))}
                cor={COR_CUSTO}
                rotulo="Custo"
                formatar={formatarMoedaCompacta}
                aoClicar={(id) => navigate({ to: "/unidades/$id", params: { id } })}
              />
            </CartaoGrafico>
            <CartaoGrafico
              titulo="Ranking das UCs com maior consumo"
              descricao="Clique para abrir a análise da UC."
            >
              <GraficoBarrasHorizontais
                dados={analise.porUc.map((g) => ({
                  chave: g.chave,
                  rotulo: g.rotulo,
                  valor: g.consumo,
                  detalhe: ucsPorId.get(g.chave)?.fazenda ?? "",
                }))}
                cor={COR_CONSUMO}
                rotulo="Consumo"
                formatar={(v) => `${formatarNumero(v)} kWh`}
                aoClicar={(id) => navigate({ to: "/unidades/$id", params: { id } })}
              />
            </CartaoGrafico>
          </div>

          <CartaoGrafico
            titulo="Dados mensais"
            descricao="Tabela equivalente aos gráficos mensais."
          >
            <TabelaDados
              dados={analise.serie}
              chave={(p) => p.mes}
              busca={false}
              nomeExportacao="dashboard-mensal"
              aoClicarLinha={(p) => setMesDetalhe(p.mes)}
              colunas={[
                { id: "mes", titulo: "Mês", valor: (p) => rotuloMes(p.mes) },
                {
                  id: "custo",
                  titulo: filtros.baseCusto === "energia" ? "Custo da energia" : "Valor faturado",
                  tipo: "moeda",
                  valor: (p) => p.custo,
                },
                {
                  id: "faturado",
                  titulo: "Valor faturado",
                  tipo: "moeda",
                  valor: (p) => p.valorFaturado,
                },
                {
                  id: "creditos",
                  titulo: "Créditos abatidos",
                  tipo: "moeda",
                  valor: (p) => p.creditos,
                },
                { id: "grupoBc", titulo: "Grupo BC", tipo: "moeda", valor: (p) => p.grupoBc },
                {
                  id: "descontoGrupoBc",
                  titulo: "Desconto Grupo BC",
                  tipo: "moeda",
                  valor: (p) => p.descontoGrupoBc,
                },
                {
                  id: "custoCheioGrupoBc",
                  titulo: "Custo cheio Grupo BC",
                  tipo: "moeda",
                  valor: (p) => p.custoCheioGrupoBc,
                },
                { id: "consumo", titulo: "Consumo (kWh)", tipo: "kwh", valor: (p) => p.consumo },
                { id: "kwh", titulo: "R$/kWh", tipo: "decimal4", valor: (p) => p.custoKwh },
                { id: "faturas", titulo: "Faturas", tipo: "numero", valor: (p) => p.faturas },
                { id: "ucs", titulo: "UCs", tipo: "numero", valor: (p) => p.ucs },
              ]}
            />
          </CartaoGrafico>
        </>
      )}

      <DetalheMes
        mes={mesDetalhe}
        aoFechar={() => setMesDetalhe(null)}
        faturas={analise.doPeriodo.filter(
          (f) => mesDetalhe && mesDaFatura(f, filtros.criterio) === mesDetalhe,
        )}
        ucsPorId={ucsPorId}
      />
    </div>
  );
}

function DetalheMes({
  mes,
  aoFechar,
  faturas,
  ucsPorId,
}: {
  mes: string | null;
  aoFechar: () => void;
  faturas: FaturaAnalise[];
  ucsPorId: Map<string, { numero_uc: string; fazenda: string; filial: string | null }>;
}) {
  const navigate = useNavigate();
  const colunas: Coluna<FaturaAnalise>[] = [
    {
      id: "uc",
      titulo: "UC",
      valor: (f) => ucsPorId.get(f.unidade_consumidora_id ?? "")?.numero_uc,
    },
    {
      id: "fazenda",
      titulo: "Fazenda",
      valor: (f) => ucsPorId.get(f.unidade_consumidora_id ?? "")?.fazenda,
    },
    {
      id: "filial",
      titulo: "Filial",
      valor: (f) => ucsPorId.get(f.unidade_consumidora_id ?? "")?.filial,
    },
    { id: "numero", titulo: "Nº", valor: (f) => f.numero_documento },
    { id: "custo", titulo: "Custo da energia", tipo: "moeda", valor: (f) => custoDaFatura(f) },
    { id: "valor", titulo: "Valor faturado", tipo: "moeda", valor: (f) => f.valor_total },
    {
      id: "creditos",
      titulo: "Créditos",
      tipo: "moeda",
      valor: (f) => creditosDaFatura(f) || null,
    },
    { id: "grupoBc", titulo: "Grupo BC", tipo: "moeda", valor: (f) => f.valor_grupo_bc ?? null },
    {
      id: "descontoGrupoBc",
      titulo: "Desconto Grupo BC",
      tipo: "moeda",
      valor: (f) => f.desconto_grupo_bc ?? null,
    },
    {
      id: "custoCheioGrupoBc",
      titulo: "Custo cheio Grupo BC",
      tipo: "moeda",
      valor: (f) => f.custo_cheio_grupo_bc ?? null,
    },
    { id: "consumo", titulo: "Consumo", tipo: "kwh", valor: (f) => f.consumo_kwh },
    {
      id: "kwh",
      titulo: "R$/kWh",
      tipo: "decimal4",
      valor: (f) => {
        const c = custoDaFatura(f);
        return f.consumo_kwh && f.consumo_kwh > 0 && c != null ? c / f.consumo_kwh : null;
      },
    },
  ];
  return (
    <Dialog open={!!mes} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Faturas de {mes ? rotuloMes(mes) : ""}</DialogTitle>
          <DialogDescription>
            Faturas válidas que compõem o mês, respeitando os filtros aplicados.
          </DialogDescription>
        </DialogHeader>
        <TabelaDados
          dados={faturas}
          colunas={colunas}
          chave={(f) => f.id}
          nomeExportacao={`faturas-${mes}`}
          ordenacaoInicial={{ id: "custo", direcao: "desc" }}
          aoClicarLinha={(f) => navigate({ to: "/faturas/$id", params: { id: f.id } })}
        />
      </DialogContent>
    </Dialog>
  );
}
