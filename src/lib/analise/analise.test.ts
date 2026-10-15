import { describe, expect, it } from "vitest";

import { CONFIG_ALERTAS_PADRAO } from "../tipos";
import { gerarAlertas } from "./alertas";
import {
  calcularIndicadores,
  calcularTotais,
  creditosDaFatura,
  custoDaFatura,
  FILTROS_VAZIOS,
  serieMensal,
  type FaturaAnalise,
  type UcAnalise,
} from "./calculos";
import { periodoAnterior, variacaoPercentual } from "./periodos";

let seq = 0;
function fatura(p: Partial<FaturaAnalise>): FaturaAnalise {
  seq++;
  return {
    id: `f${seq}`,
    unidade_consumidora_id: "uc1",
    periodo_referencia: "2026-01-01",
    data_emissao: "2026-02-05",
    valor_total: 1000,
    consumo_kwh: 1000,
    dias_faturados: 30,
    status_documento: "autorizada",
    status_processamento: "processada",
    excluida: false,
    finalidade: "normal",
    numero_documento: String(seq),
    valor_tusd: null,
    valor_te: null,
    valor_icms: null,
    valor_pis: null,
    valor_cofins: null,
    valor_cip: null,
    valor_bandeira: null,
    valor_demanda: null,
    valor_reativo: null,
    valor_multas: null,
    valor_juros: null,
    valor_encargos: null,
    valor_descontos: null,
    valor_compensacao: null,
    valor_energia: null,
    valor_outros: null,
    energia_injetada_kwh: null,
    energia_compensada_kwh: null,
    demanda_medida_kw: null,
    demanda_contratada_kw: null,
    demanda_faturada_kw: null,
    divergencias: [],
    ...p,
  };
}

const ucs: UcAnalise[] = [
  {
    id: "uc1",
    numero_uc: "1",
    fazenda: "Fazenda A",
    cnpj: "11222333000181",
    filial: "F1",
    situacao: "ativa",
    area: "Agrícola",
  },
  {
    id: "uc2",
    numero_uc: "2",
    fazenda: "Fazenda B",
    cnpj: "11444777000161",
    filial: "F1",
    situacao: "ativa",
    area: "Pecuária",
  },
  {
    id: "uc3",
    numero_uc: "3",
    fazenda: "Fazenda B",
    cnpj: "11444777000161",
    filial: "F2",
    situacao: "inativa",
    area: null,
  },
];

describe("cálculos", () => {
  it("variação percentual só existe com anterior diferente de zero", () => {
    expect(variacaoPercentual(120, 100)).toBe(20);
    expect(variacaoPercentual(80, 100)).toBe(-20);
    expect(variacaoPercentual(10, 0)).toBeNull();
    expect(variacaoPercentual(null, 10)).toBeNull();
  });

  it("período anterior tem a mesma duração", () => {
    expect(periodoAnterior("2026-01", "2026-03")).toEqual({ inicio: "2025-10", fim: "2025-12" });
    expect(periodoAnterior("2026-01", "2026-12")).toEqual({ inicio: "2025-01", fim: "2025-12" });
  });

  it("custo por kWh usa o mesmo conjunto de faturas no numerador e denominador", () => {
    const t = calcularTotais([
      fatura({ valor_total: 1000, consumo_kwh: 2000 }),
      fatura({ valor_total: 500, consumo_kwh: null }), // sem consumo: fora do custo/kWh
      fatura({ valor_total: 300, consumo_kwh: 0 }),
    ]);
    expect(t.custoTotal).toBe(1800);
    expect(t.consumoTotal).toBe(2000);
    expect(t.custoKwh).toBe(0.5);
    expect(t.faturasComConsumo).toBe(1);
  });

  it("exclui canceladas, substituídas, excluídas e pendentes e aplica filtros", () => {
    const faturas = [
      fatura({ valor_total: 100, periodo_referencia: "2026-01-01" }),
      fatura({ valor_total: 200, periodo_referencia: "2026-02-01", unidade_consumidora_id: "uc2" }),
      fatura({ valor_total: 999, status_documento: "cancelada" }),
      fatura({ valor_total: 999, status_documento: "substituida" }),
      fatura({ valor_total: 999, excluida: true }),
      fatura({
        valor_total: 999,
        unidade_consumidora_id: null,
        status_processamento: "pendente_identificacao",
      }),
      fatura({ valor_total: 50, periodo_referencia: "2025-12-01" }),
      fatura({ valor_total: 400, periodo_referencia: "2026-01-01", unidade_consumidora_id: "uc3" }),
    ];
    const ind = calcularIndicadores(faturas, ucs, {
      ...FILTROS_VAZIOS,
      inicio: "2026-01",
      fim: "2026-02",
    });
    expect(ind.custoTotal).toBe(700);
    expect(ind.quantidadeFaturas).toBe(3);
    expect(ind.ucsComFaturas).toBe(3);
    expect(ind.ucsAtivas).toBe(2);
    expect(ind.custoMedioUc).toBeCloseTo(700 / 3);
    expect(ind.intervaloAnterior).toEqual({ inicio: "2025-11", fim: "2025-12" });
    expect(ind.anterior?.custoTotal).toBe(50);
    expect(ind.variacaoCusto).toBe(1300);

    const soFazendaB = calcularIndicadores(faturas, ucs, {
      ...FILTROS_VAZIOS,
      inicio: "2026-01",
      fim: "2026-02",
      fazendas: ["Fazenda B"],
      situacao: "ativa",
    });
    expect(soFazendaB.custoTotal).toBe(200);

    const soAgricola = calcularIndicadores(faturas, ucs, {
      ...FILTROS_VAZIOS,
      inicio: "2026-01",
      fim: "2026-02",
      areas: ["Agrícola"],
    });
    expect(soAgricola.custoTotal).toBe(100);
    const semArea = calcularIndicadores(faturas, ucs, {
      ...FILTROS_VAZIOS,
      inicio: "2026-01",
      fim: "2026-02",
      areas: [""],
    });
    expect(semArea.custoTotal).toBe(400);
  });

  it("consolida por competência ou por emissão", () => {
    const faturas = [
      fatura({ periodo_referencia: "2026-01-01", data_emissao: "2026-02-03", valor_total: 10 }),
    ];
    expect(serieMensal(faturas, "competencia")[0]?.mes).toBe("2026-01");
    expect(serieMensal(faturas, "emissao")[0]?.mes).toBe("2026-02");
    const serie = serieMensal(faturas, "competencia", { inicio: "2025-12", fim: "2026-02" });
    expect(serie.map((s) => s.custo)).toEqual([0, 10, 0]);
  });
});

describe("custo da energia antes dos créditos", () => {
  it("soma os créditos abatidos ao valor faturado, inclusive quando a fatura sai zerada", () => {
    expect(custoDaFatura({ valor_total: 0, valor_compensacao: -812.5 })).toBe(812.5);
    expect(custoDaFatura({ valor_total: 0, valor_compensacao: -812.5 }, "faturado")).toBe(0);
    expect(custoDaFatura({ valor_total: 300, valor_compensacao: null })).toBe(300);
    expect(custoDaFatura({ valor_total: null, valor_compensacao: -10 })).toBeNull();
    expect(creditosDaFatura({ valor_compensacao: 50 })).toBe(0);
  });

  it("indicadores, série e agrupamentos usam a base escolhida", () => {
    const faturas = [
      fatura({ valor_total: 0, valor_compensacao: -1000, consumo_kwh: 1250 }),
      fatura({
        valor_total: 400,
        valor_compensacao: -600,
        consumo_kwh: 1000,
        unidade_consumidora_id: "uc2",
      }),
    ];
    const energia = calcularIndicadores(faturas, ucs, {
      ...FILTROS_VAZIOS,
      inicio: "2026-01",
      fim: "2026-01",
    });
    expect(energia.custoTotal).toBe(2000);
    expect(energia.valorFaturado).toBe(400);
    expect(energia.creditos).toBe(1600);
    expect(energia.custoKwh).toBeCloseTo(2000 / 2250);
    const faturado = calcularIndicadores(faturas, ucs, {
      ...FILTROS_VAZIOS,
      inicio: "2026-01",
      fim: "2026-01",
      baseCusto: "faturado",
    });
    expect(faturado.custoTotal).toBe(400);
    expect(serieMensal(faturas, "competencia")[0]).toMatchObject({
      custo: 2000,
      valorFaturado: 400,
      creditos: 1600,
    });
  });

  it("alertas comparam o custo da energia, não o valor reduzido pelos créditos", () => {
    const faturas = [
      fatura({
        periodo_referencia: "2025-12-01",
        valor_total: 1000,
        valor_compensacao: null,
        consumo_kwh: 1000,
      }),
      // custo da energia igual, mas créditos zeraram a fatura: não é queda/aumento de custo
      fatura({
        periodo_referencia: "2026-01-01",
        valor_total: 0,
        valor_compensacao: -1000,
        consumo_kwh: 1000,
      }),
      fatura({
        periodo_referencia: "2026-02-01",
        valor_total: 0,
        valor_compensacao: -1500,
        consumo_kwh: 1000,
      }),
    ];
    const alertas = gerarAlertas(faturas, ucs, CONFIG_ALERTAS_PADRAO);
    const custo = alertas.filter((a) => a.tipo_alerta === "aumento_custo");
    expect(custo.map((a) => a.periodo)).toEqual(["2026-02-01"]);
    expect(custo[0]?.descricao).toMatch(/Custo da energia/);
    expect(alertas.some((a) => a.tipo_alerta === "consumo_zerado_negativo")).toBe(false);
  });
});

describe("alertas", () => {
  const cfg = CONFIG_ALERTAS_PADRAO;

  it("aumento de consumo considera dias faturados", () => {
    const faturas = [
      fatura({
        periodo_referencia: "2026-01-01",
        consumo_kwh: 1000,
        dias_faturados: 30,
        valor_total: 1000,
      }),
      // 1300 kWh em 39 dias = mesma média diária → não é anomalia
      fatura({
        periodo_referencia: "2026-02-01",
        consumo_kwh: 1300,
        dias_faturados: 39,
        valor_total: 1300,
      }),
    ];
    const alertas = gerarAlertas(faturas, ucs, cfg);
    expect(alertas.filter((a) => a.tipo_alerta === "aumento_consumo")).toHaveLength(0);

    const semDias = gerarAlertas(faturas, ucs, { ...cfg, considerar_dias_faturados: false });
    expect(semDias.filter((a) => a.tipo_alerta === "aumento_consumo")).toHaveLength(1);
  });

  it("classifica como possível quando compatível com sazonalidade e confirmado quando não", () => {
    const base = [
      fatura({ periodo_referencia: "2025-01-01", consumo_kwh: 1500, valor_total: 1500 }),
      fatura({ periodo_referencia: "2025-12-01", consumo_kwh: 1000, valor_total: 1000 }),
    ];
    const sazonal = gerarAlertas(
      [...base, fatura({ periodo_referencia: "2026-01-01", consumo_kwh: 1500, valor_total: 1500 })],
      ucs,
      cfg,
    ).find((a) => a.tipo_alerta === "aumento_consumo");
    expect(sazonal?.classificacao).toBe("possivel");
    expect(sazonal?.variacao_percentual).toBeCloseTo(50);
    expect(sazonal?.descricao).toMatch(/sazonal/);
    expect(sazonal?.descricao).not.toMatch(/desperd/i);

    const confirmado = gerarAlertas(
      [...base, fatura({ periodo_referencia: "2026-01-01", consumo_kwh: 2500, valor_total: 2500 })],
      ucs,
      cfg,
    ).find((a) => a.tipo_alerta === "aumento_consumo");
    expect(confirmado?.classificacao).toBe("confirmado");
  });

  it("aponta ausência de fatura, duplicidade e consumo zerado", () => {
    const faturas = [
      fatura({ periodo_referencia: "2025-10-01" }),
      fatura({ periodo_referencia: "2025-11-01" }),
      fatura({ periodo_referencia: "2025-12-01" }),
      // janeiro ausente
      fatura({ periodo_referencia: "2026-02-01", valor_total: 1000 }),
      fatura({ periodo_referencia: "2026-02-01", valor_total: 1000 }),
      fatura({ periodo_referencia: "2026-03-01", consumo_kwh: 0, valor_total: 80 }),
    ];
    const alertas = gerarAlertas(faturas, ucs, cfg);
    const ausencia = alertas.find((a) => a.tipo_alerta === "ausencia_fatura");
    expect(ausencia?.periodo).toBe("2026-01-01");
    expect(ausencia?.classificacao).toBe("confirmado");
    expect(alertas.some((a) => a.tipo_alerta === "possivel_duplicidade")).toBe(true);
    const zerado = alertas.find((a) => a.tipo_alerta === "consumo_zerado_negativo");
    expect(zerado?.classificacao).toBe("possivel");
    // chaves únicas não se repetem
    expect(new Set(alertas.map((a) => a.chave_unica)).size).toBe(alertas.length);
  });

  it("detecta custo por kWh acima do histórico e variação de componente", () => {
    const faturas = [
      fatura({
        periodo_referencia: "2025-10-01",
        valor_total: 1000,
        consumo_kwh: 1000,
        valor_cip: 40,
      }),
      fatura({
        periodo_referencia: "2025-11-01",
        valor_total: 1000,
        consumo_kwh: 1000,
        valor_cip: 40,
      }),
      fatura({
        periodo_referencia: "2025-12-01",
        valor_total: 1000,
        consumo_kwh: 1000,
        valor_cip: 40,
      }),
      fatura({
        periodo_referencia: "2026-01-01",
        valor_total: 1100,
        consumo_kwh: 800,
        valor_cip: 140,
        valor_multas: 60,
      }),
    ];
    const alertas = gerarAlertas(faturas, ucs, cfg);
    const kwh = alertas.find((a) => a.tipo_alerta === "custo_kwh_elevado");
    expect(kwh?.valor_atual).toBeCloseTo(1.375);
    expect(kwh?.valor_comparacao).toBeCloseTo(1);
    expect(kwh?.classificacao).toBe("confirmado");
    const comps = alertas
      .filter((a) => a.tipo_alerta === "variacao_componente")
      .map((a) => a.indicador);
    expect(comps).toContain("CIP/COSIP");
    expect(comps).toContain("Multas");
  });

  it("não alerta componente que só acompanha o aumento do custo total", () => {
    const faturas = [
      fatura({
        periodo_referencia: "2025-12-01",
        valor_total: 1000,
        consumo_kwh: 1000,
        valor_tusd: 550,
      }),
      fatura({
        periodo_referencia: "2026-01-01",
        valor_total: 1500,
        consumo_kwh: 1500,
        valor_tusd: 825,
      }),
    ];
    const alertas = gerarAlertas(faturas, ucs, cfg);
    expect(alertas.some((a) => a.tipo_alerta === "variacao_componente")).toBe(false);
    const custo = alertas.find((a) => a.tipo_alerta === "aumento_custo");
    expect(custo?.indicador).toBe("Custo da energia médio diário");
    expect(custo?.valor_atual).toBeCloseTo(50);
  });

  it("compara custo por kWh com UCs semelhantes", () => {
    const outras = ["a", "b", "c"].map((id) => ({
      id,
      numero_uc: id,
      fazenda: "X",
      cnpj: "11222333000181",
      filial: "F9",
      situacao: "ativa" as const,
      area: null,
    }));
    const faturas = [
      ...outras.map((u) =>
        fatura({ unidade_consumidora_id: u.id, valor_total: 1000, consumo_kwh: 1000 }),
      ),
      fatura({ unidade_consumidora_id: "uc1", valor_total: 2000, consumo_kwh: 1000 }),
    ];
    const alertas = gerarAlertas(faturas, [...ucs, ...outras], cfg);
    const a = alertas.find((x) => x.tipo_alerta === "custo_acima_semelhantes");
    expect(a?.unidade_consumidora_id).toBe("uc1");
    expect(a?.variacao_percentual).toBeCloseTo(100);
  });

  it("compara UCs semelhantes primeiro dentro da mesma área", () => {
    const mk = (id: string, area: string) => ({
      id,
      numero_uc: id,
      fazenda: "X",
      cnpj: "11222333000181",
      filial: "F9",
      situacao: "ativa" as const,
      area,
    });
    const pec = ["p1", "p2", "p3", "p4"].map((id) => mk(id, "Pecuária"));
    const agr = ["a1", "a2", "a3", "a4"].map((id) => mk(id, "Agrícola"));
    const faturas = [
      ...pec.map((u) =>
        fatura({ unidade_consumidora_id: u.id, valor_total: 2000, consumo_kwh: 1000 }),
      ),
      ...agr.map((u) =>
        fatura({ unidade_consumidora_id: u.id, valor_total: 1000, consumo_kwh: 1000 }),
      ),
    ];
    // Pecuária custa mais por kWh que Agrícola, mas está alinhada com a própria área
    const alertas = gerarAlertas(faturas, [...pec, ...agr], cfg).filter(
      (a) => a.tipo_alerta === "custo_acima_semelhantes",
    );
    expect(alertas).toHaveLength(0);
  });
});
