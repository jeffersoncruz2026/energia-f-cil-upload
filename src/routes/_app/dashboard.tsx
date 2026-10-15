import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  CircleDollarSign,
  FileStack,
  Gauge,
  Inbox,
  PlugZap,
  Receipt,
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
  filtrarFaturas,
  mesDaFatura,
  serieMensal,
  type FaturaAnalise,
} from "@/lib/analise/calculos";
import { useFiltrosAnalise } from "@/lib/analise/use-filtros";
import { useAuth } from "@/lib/auth";
import {
  mensagemErro,
  useConfiguracoes,
  useFaturasAnalise,
  usePendentesCount,
  useUcs,
} from "@/lib/consultas";
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
  const { data: pendentes } = usePendentesCount();
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
    const serie = serieMensal(doPeriodo, filtros.criterio, ind.intervalo);
    const porFazenda = agruparPor(doPeriodo, ucsPorId, (u) => ({
      chave: u.fazenda,
      rotulo: u.fazenda,
    }));
    const porFilial = agruparPor(doPeriodo, ucsPorId, (u) => ({
      chave: u.filial ?? "—",
      rotulo: u.filial ?? "Sem filial",
    }));
    const porUc = agruparPor(doPeriodo, ucsPorId, (u) => ({
      chave: u.id,
      rotulo: `UC ${u.numero_uc} · ${u.fazenda}`,
    }));
    const comDivergencia = doPeriodo.filter(
      (f) => f.divergencias?.length > 0 || f.status_documento === "sem_protocolo",
    ).length;
    return { ind, doPeriodo, serie, porFazenda, porFilial, porUc, comDivergencia };
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
            {pode("importar") && (
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
          }
        />
      ) : (
        <>
          <BarraFiltros filtros={filtros} aoMudar={setFiltros} ucs={ucs} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <CartaoIndicador
              titulo="Custo total faturado"
              icone={CircleDollarSign}
              valor={formatarMoeda(ind.custoTotal)}
              variacao={ind.variacaoCusto}
              detalhe={anteriorTexto}
              ajuda="Soma do valor total das faturas válidas do período. Valor faturado, não necessariamente pago."
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
              ajuda="Valor total ÷ consumo, somente das faturas com consumo positivo (mesmo conjunto no numerador e denominador)."
            />
            <CartaoIndicador
              titulo="Custo médio por UC"
              icone={Receipt}
              valor={formatarMoeda(ind.custoMedioUc)}
              detalhe="no período"
              ajuda="Custo total ÷ UCs com faturas válidas no período."
            />
            <CartaoIndicador
              titulo="Faturas no período"
              icone={FileStack}
              valor={formatarNumero(ind.quantidadeFaturas)}
              detalhe={`${faturas.length} importada(s) no total`}
            />
            <CartaoIndicador
              titulo="UCs ativas"
              icone={Building2}
              valor={formatarNumero(ind.ucsAtivas)}
              detalhe="cadastradas (com filtros)"
            />
            <CartaoIndicador
              titulo="UCs com faturas"
              icone={PlugZap}
              valor={formatarNumero(ind.ucsComFaturas)}
              detalhe="no período"
            />
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
              titulo="Pendências"
              icone={Inbox}
              valor={formatarNumero((pendentes ?? 0) + analise.comDivergencia)}
              detalhe={
                <Link to="/pendencias" className="underline-offset-2 hover:underline">
                  {pendentes ?? 0} de identificação · {analise.comDivergencia} a validar
                </Link>
              }
              ajuda="Faturas sem UC identificada (fora dos indicadores) + faturas do período com divergência ou sem protocolo de autorização."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CartaoGrafico
              titulo="Evolução mensal do custo"
              descricao="Clique em um mês para ver as faturas."
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
                { id: "custo", titulo: "Custo", tipo: "moeda", valor: (p) => p.custo },
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
    { id: "valor", titulo: "Valor", tipo: "moeda", valor: (f) => f.valor_total },
    { id: "consumo", titulo: "Consumo", tipo: "kwh", valor: (f) => f.consumo_kwh },
    {
      id: "kwh",
      titulo: "R$/kWh",
      tipo: "decimal4",
      valor: (f) =>
        f.consumo_kwh && f.consumo_kwh > 0 && f.valor_total != null
          ? f.valor_total / f.consumo_kwh
          : null,
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
          ordenacaoInicial={{ id: "valor", direcao: "desc" }}
          aoClicarLinha={(f) => navigate({ to: "/faturas/$id", params: { id: f.id } })}
        />
      </DialogContent>
    </Dialog>
  );
}
