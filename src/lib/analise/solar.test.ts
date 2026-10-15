import { describe, expect, it } from "vitest";

import { gerarNF3e } from "@/test/fixtures/nf3e";

import { CONFIG_ALERTAS_PADRAO } from "../tipos";
import { lerXml } from "../xml/leitor-fatura";
import type { UcAnalise } from "./calculos";
import {
  calcularIndicadoresSolar,
  extrairGd,
  gerarAlertasSolar,
  lerSCEE,
  resumirPorUc,
  serieMensalSolar,
  type DadosGd,
  type FaturaSolarEntrada,
  type ItemGd,
} from "./solar";

/** Simula o que fica gravado no banco após importar o XML. */
function importar(xml: string, id: string, ucId = "uc1") {
  const r = lerXml(xml);
  if (r.tipo !== "fatura") throw new Error("esperava fatura");
  const f = r.fatura;
  const entrada: FaturaSolarEntrada = {
    id,
    unidade_consumidora_id: ucId,
    periodo_referencia: f.periodo_referencia,
    data_emissao: f.data_emissao,
    valor_total: f.valor_total,
    consumo_kwh: f.consumo_kwh,
    dias_faturados: f.dias_faturados,
    status_documento: f.status_documento,
    excluida: false,
    energia_injetada_kwh: f.energia_injetada_kwh,
    energia_compensada_kwh: f.energia_compensada_kwh,
    valor_compensacao: f.valor_compensacao,
    gd_compensacao: JSON.parse(JSON.stringify(f.dados_extraidos_json["compensacao"] ?? null)),
    gd_medicoes: JSON.parse(JSON.stringify(f.dados_extraidos_json["medicoes"] ?? null)),
  };
  const itens: ItemGd[] = r.itens
    .filter((i) => i.tipo_item === "injecao" || i.tipo_item === "compensacao")
    .map((i) => ({ ...i, fatura_id: id }));
  return { entrada, itens };
}

function xmlGd(
  competencia: string,
  injetada: number,
  compensada: number,
  saldo: number,
  extra = {},
) {
  return gerarNF3e({
    numero: Number(competencia),
    competencia,
    itens: [
      { descricao: "Consumo Ativo TUSD", qtd: 5000, uMed: "2", vProd: 2000 },
      { descricao: "Consumo Ativo TE", qtd: 5000, uMed: "2", vProd: 1500 },
      {
        descricao: "Energia Ativa Injetada TUSD",
        qtd: compensada,
        uMed: "2",
        vProd: compensada * 0.4,
        devolucao: true,
        medida: { tpGrMed: "04", uMed: "2", ant: 0, atu: injetada },
      },
      {
        descricao: "Energia Ativa Injetada TE",
        qtd: compensada,
        uMed: "2",
        vProd: compensada * 0.3,
        devolucao: true,
        medida: { tpGrMed: "04", uMed: "2", ant: 0, atu: injetada },
      },
    ],
    scee: { vPotInst: 75, vSaldAnt: saldo - 500, vSaldAtual: saldo, ...extra },
  });
}

const ucs: UcAnalise[] = [
  {
    id: "uc1",
    numero_uc: "1",
    fazenda: "A",
    cnpj: "11222333000181",
    filial: "F",
    situacao: "ativa",
    area: "Agrícola",
  },
];

describe("energia solar (geração distribuída)", () => {
  it("lê o grupo gSCEE", () => {
    const s = lerSCEE({
      tpPartComp: "2",
      gConsumidor: [{ idAcessGer: "999", vPotInst: "112.5", tpFonteEnergia: "2", enerAloc: "800" }],
      gSaldoCred: [
        {
          vSaldAnt: "100",
          vSaldAtual: "300",
          vCredExpirado: "0",
          vCredExpirar: "50",
          CompetExpirar: "202702",
        },
        { vSaldAnt: "10", vSaldAtual: "20", vCredExpirado: "5", vCredExpirar: "0" },
      ],
    });
    expect(s).toMatchObject({
      participacao: "Autoconsumo remoto",
      potenciaKw: 112.5,
      fonte: "Solar fotovoltaica",
      ucGeradora: "999",
      energiaAlocadaKwh: 800,
      saldoAnteriorKwh: 110,
      saldoAtualKwh: 320,
      creditosExpiradosKwh: 5,
      creditosExpirarKwh: 50,
      competenciaExpirar: "2027-02",
    });
    expect(lerSCEE(null)).toBeNull();
  });

  it("separa energia injetada (medição) de créditos compensados (itens) sem duplicar TUSD/TE", () => {
    const { entrada, itens } = importar(xmlGd("202601", 4200, 3000, 1500), "f1");
    const d = extrairGd(entrada, itens)!;
    expect(d.injetadaKwh).toBe(4200);
    expect(d.creditosKwh).toBe(3000);
    expect(d.economia).toBe(2100);
    expect(d.consumoKwh).toBe(5000);
    expect(d.saldoAtualKwh).toBe(1500);
    expect(d.potenciaKw).toBe(75);
    expect(d.fonte).toBe("Solar fotovoltaica");
  });

  it("ignora faturas sem nenhum sinal de geração distribuída", () => {
    const { entrada, itens } = importar(gerarNF3e(), "f0");
    expect(extrairGd(entrada, itens)).toBeNull();
  });

  it("consolida indicadores, série mensal e resumo por UC", () => {
    const dados = [
      importar(xmlGd("202601", 4000, 3000, 1000), "f1"),
      importar(xmlGd("202602", 5000, 3500, 2500), "f2"),
    ].map(({ entrada, itens }) => extrairGd(entrada, itens)!);
    const ind = calcularIndicadoresSolar(dados);
    expect(ind.injetadaKwh).toBe(9000);
    expect(ind.creditosKwh).toBe(6500);
    expect(ind.economia).toBe(4550);
    expect(ind.saldoAtualKwh).toBe(2500); // saldo é posição: último mês, não soma
    expect(ind.percentualCompensado).toBe(65);
    expect(ind.valorMedioKwhCompensado).toBeCloseTo(0.7);
    expect(ind.custoSemCreditos).toBeCloseTo(ind.custo + 4550);
    const serie = serieMensalSolar(dados);
    expect(serie.map((m) => m.mes)).toEqual(["2026-01", "2026-02"]);
    expect(ind.potenciaKw).toBe(75);
    const comBeneficiaria = calcularIndicadoresSolar([
      ...dados,
      { ...dados[0]!, faturaId: "b1", ucId: "uc2", injetadaKwh: null },
    ]);
    // Beneficiária repete a potência da mesma usina geradora: não soma em dobro
    expect(comBeneficiaria.potenciaKw).toBe(75);
    const [uc] = resumirPorUc(dados);
    expect(uc?.papel).toBe("Geradora e consumidora de créditos");
    expect(uc?.injecaoPorKwpMes).toBeCloseTo(9000 / 75 / 2);
  });

  it("alerta queda de injeção, créditos expirados, a expirar e saldo elevado", () => {
    const base = (mes: string, inj: number, extra: Partial<DadosGd> = {}): DadosGd => ({
      faturaId: `f${mes}`,
      ucId: "uc1",
      mes,
      dias: 30,
      consumoKwh: 1000,
      valorTotal: 500,
      injetadaKwh: inj,
      creditosKwh: 800,
      economia: 400,
      saldoAnteriorKwh: null,
      saldoAtualKwh: null,
      creditosExpirarKwh: null,
      competenciaExpirar: null,
      creditosExpiradosKwh: null,
      potenciaKw: 75,
      fonte: "Solar fotovoltaica",
      participacao: null,
      ucGeradora: null,
      energiaAlocadaKwh: null,
      ...extra,
    });
    const dados = [
      base("2025-10", 9000),
      base("2025-11", 9200),
      base("2025-12", 8800),
      base("2026-01", 4000),
      base("2026-02", 0, {
        creditosExpiradosKwh: 120,
        saldoAtualKwh: 9000,
        creditosExpirarKwh: 300,
        competenciaExpirar: "2026-06",
      }),
    ];
    const alertas = gerarAlertasSolar(dados, ucs, CONFIG_ALERTAS_PADRAO);
    const quedas = alertas.filter((a) => a.tipo_alerta === "queda_injecao_solar");
    expect(quedas.map((a) => [a.periodo, a.classificacao])).toEqual([
      ["2026-01-01", "possivel"],
      ["2026-02-01", "confirmado"],
    ]);
    expect(quedas[0]?.descricao).not.toMatch(/desperd/i);
    expect(alertas.find((a) => a.tipo_alerta === "creditos_expirados")?.valor_atual).toBe(120);
    expect(alertas.find((a) => a.tipo_alerta === "creditos_a_expirar")?.descricao).toMatch(
      /06\/2026/,
    );
    expect(alertas.some((a) => a.tipo_alerta === "saldo_creditos_elevado")).toBe(true);
    expect(new Set(alertas.map((a) => a.chave_unica)).size).toBe(alertas.length);
  });

  it("não confirma queda quando o mesmo mês do ano anterior também foi baixo (sazonalidade)", () => {
    const d = (mes: string, inj: number): DadosGd => ({
      faturaId: mes,
      ucId: "uc1",
      mes,
      dias: null,
      consumoKwh: null,
      valorTotal: 0,
      injetadaKwh: inj,
      creditosKwh: null,
      economia: null,
      saldoAnteriorKwh: null,
      saldoAtualKwh: null,
      creditosExpirarKwh: null,
      competenciaExpirar: null,
      creditosExpiradosKwh: null,
      potenciaKw: null,
      fonte: null,
      participacao: null,
      ucGeradora: null,
      energiaAlocadaKwh: null,
    });
    const dados = [
      d("2025-06", 5000),
      d("2026-02", 9000),
      d("2026-03", 9000),
      d("2026-04", 9000),
      d("2026-05", 9000),
      d("2026-06", 5200),
    ];
    const queda = gerarAlertasSolar(dados, ucs, CONFIG_ALERTAS_PADRAO).find(
      (a) => a.tipo_alerta === "queda_injecao_solar",
    );
    expect(queda?.classificacao).toBe("possivel");
    expect(queda?.descricao).toMatch(/sazonal/);
  });
});
