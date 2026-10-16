import { describe, expect, it } from "vitest";

import {
  aplicarGrupoBc,
  calcularGrupoBc,
  calcularGrupoBcPorFatura,
  faturasComInjecaoGrupoBc,
  geradoraDaLinha,
  geradorasEncontradas,
  normalizarNumeroUc,
  classificarUsina,
  type ItemGrupoBc,
  type RegraGrupoBc,
  usinasGrupoBc,
} from "./grupo-bc";

const item = (descricao: string, quantidade: number, extra: Partial<ItemGrupoBc> = {}) => ({
  fatura_id: "f1",
  descricao,
  quantidade,
  valor_unitario: null,
  valor_total: null,
  posto_tarifario: null,
  ...extra,
});

describe("Grupo BC", () => {
  it("exemplo AGO/2026 UC 157990001258: valor 69,45, desconto 19,19, custo cheio 88,64", () => {
    const r = calcularGrupoBc([
      item("CONSUMO NÃO COMPENSADO", 120, { valor_unitario: 1.174665, valor_total: 140.96 }),
      item("ADC BANDEIRA AMARELA", 120, { valor_unitario: 0.024828, valor_total: 2.98 }),
      item("INJEÇÃO SCEE - UC 10019756133 - GD II", -73.9, { valor_total: -86.81 }),
    ]);
    // 73,90 × 1,174665 × 0,80 = 69,45
    // 73,90 × (1,174665 + 0,024828) − 69,45 = 88,6425 − 69,45 = 19,19
    expect(r).toEqual({
      kwhInjetados: 73.9,
      tarifa: 1.174665,
      tarifaBandeira: 0.024828,
      valor: 69.45,
      desconto: 19.19,
      custoCheio: 88.64,
      situacao: "calculado",
    });
  });

  it("arredonda só o resultado final", () => {
    // 73,90 × 1,174665 = 86,8077… × 0,80 = 69,4462 → 69,45 (sem arredondar a tarifa antes)
    const r = calcularGrupoBc([
      item("CONSUMO NAO COMPENSADO", 10, { valor_unitario: 1.174665 }),
      item("INJECAO SCEE", 73.9),
    ]);
    expect(r.valor).toBe(69.45);
  });

  it("sem linha ADC BANDEIRA (bandeira verde) a tarifa da bandeira é zero", () => {
    const r = calcularGrupoBc([
      item("CONSUMO NÃO COMPENSADO", 120, { valor_unitario: 1.174665 }),
      item("INJEÇÃO SCEE", 73.9),
    ]);
    // 73,90 × 1,174665 = 86,8077 − 69,45 = 17,36
    expect(r).toMatchObject({
      tarifaBandeira: 0,
      valor: 69.45,
      desconto: 17.36,
      custoCheio: 86.81,
    });
  });

  it("várias linhas de bandeira: tarifa ponderada pelo kWh", () => {
    const r = calcularGrupoBc([
      item("CONSUMO NÃO COMPENSADO", 100, { valor_unitario: 1 }),
      item("ADC BANDEIRA AMARELA", 50, { valor_unitario: 0.02, valor_total: 1 }),
      item("ADC BANDEIRA VERMELHA P1", 50, { valor_unitario: 0.06, valor_total: 3 }),
      item("INJEÇÃO SCEE", 100),
    ]);
    expect(r.tarifaBandeira).toBeCloseTo(0.04);
    expect(r).toMatchObject({ valor: 80, desconto: 24, custoCheio: 104 });
  });

  it("sem linha INJEÇÃO SCEE o valor é zero", () => {
    const r = calcularGrupoBc([item("CONSUMO NÃO COMPENSADO", 100, { valor_unitario: 1.1 })]);
    expect(r).toMatchObject({
      kwhInjetados: 0,
      valor: 0,
      desconto: 0,
      custoCheio: 0,
      situacao: "sem_injecao",
    });
    expect(calcularGrupoBc([]).custoCheio).toBe(0);
  });

  it("não repete a energia lançada em TE e TUSD (estrutura Equatorial)", () => {
    const r = calcularGrupoBc([
      item("INJEÇÃO SCEE FP - TE - UC 10019756133 - GD I", -191.88),
      item("INJEÇÃO SCEE FP - TUSD - UC 10019756133 - GD I", -191.88),
      item("INJEÇÃO SCEE FP - TUSD - UC 10019756133 - GD I", -191.88),
      item("INJEÇÃO SCEE HR - TE - UC 10019756133 - GD I - 80%", -98.4),
      item("INJEÇÃO SCEE HR - TUSD - UC 10019756133 - GD I - 80%", -98.4),
      item("INJEÇÃO SCEE P - TE - UC 10019756133 - GD I", -31.53),
      item("INJEÇÃO SCEE P - TUSD - UC 10019756133 - GD I", -31.53),
      item("CONSUMO NÃO COMPENSADO", 50, { valor_unitario: 1 }),
    ]);
    expect(r.kwhInjetados).toBe(321.81);
    expect(r.valor).toBe(257.45); // 321,81 × 1 × 0,80 = 257,448
  });

  it("soma as linhas de geradoras diferentes", () => {
    const r = calcularGrupoBc([
      item("INJEÇÃO SCEE - UC 111 - GD II", 40),
      item("INJEÇÃO SCEE - UC 222 - GD II", 33.9),
      item("CONSUMO NÃO COMPENSADO", 10, { valor_unitario: 1.174665 }),
    ]);
    expect(r.kwhInjetados).toBe(73.9);
    expect(r.valor).toBe(69.45);
  });

  it("com injeção mas sem CONSUMO NÃO COMPENSADO a tarifa fica indisponível", () => {
    const r = calcularGrupoBc([item("INJEÇÃO SCEE - UC 1", 10)]);
    expect(r).toMatchObject({
      valor: null,
      desconto: null,
      custoCheio: null,
      situacao: "tarifa_indisponivel",
    });
  });

  it("caso real 04/2026 UC 000172458701255: só a usina do Grupo BC entra (438,40 + 109,60 = 548,00)", () => {
    const itens = [
      item("CONSUMO NÃO COMPENSADO", 30.0021, { valor_unitario: 1.125925, valor_total: 33.78 }),
      item("CONSUMO SCEE", 490.9079, { valor_unitario: 0.77396, valor_total: 379.94 }),
      item("INJEÇÃO SCEE - UC 000128066501220 - GD I", 4.2, { valor_total: 3.25 }),
      item("INJEÇÃO SCEE - UC 000405731001244 - GD I", 486.7079, { valor_total: 376.69 }),
    ];
    const r = calcularGrupoBc(itens, new Set(["405731001244"]));
    // 486,7079 × 1,125925 = 548,00 → 438,40 a pagar + 109,60 de desconto
    expect(r).toMatchObject({
      kwhInjetados: 486.708,
      valor: 438.4,
      desconto: 109.6,
      custoCheio: 548,
    });
    // somando as duas geradoras (comportamento anterior) daria 442,18 + 110,55
    expect(calcularGrupoBc(itens)).toMatchObject({ valor: 442.18, desconto: 110.55 });
  });

  it("número da usina casa com ou sem zeros à esquerda", () => {
    expect(normalizarNumeroUc("000405731001244")).toBe("405731001244");
    expect(geradoraDaLinha("INJEÇÃO SCEE - UC 000405731001244 - GD I")).toBe("405731001244");
    expect(geradoraDaLinha("INJEÇÃO SCEE FP - TE")).toBeNull();
  });

  it("só calcula as faturas com injeção de usina cadastrada", () => {
    const itens = [
      { ...item("INJEÇÃO SCEE - UC 000405731001244 - GD I", 10), fatura_id: "a" },
      { ...item("CONSUMO NÃO COMPENSADO", 5, { valor_unitario: 1 }), fatura_id: "a" },
      { ...item("INJEÇÃO SCEE - UC 000128066501220 - GD I", 10), fatura_id: "b" },
      { ...item("CONSUMO NÃO COMPENSADO", 5, { valor_unitario: 1 }), fatura_id: "b" },
    ];
    const geradoras = new Set([normalizarNumeroUc("000405731001244")]);
    expect(faturasComInjecaoGrupoBc(itens, geradoras)).toEqual(["a"]);
    const r = calcularGrupoBcPorFatura(itens, geradoras);
    expect([...r.keys()]).toEqual(["a"]);
    expect(r.get("a")).toMatchObject({ valor: 8, desconto: 2, custoCheio: 10 });
  });

  it("lista as usinas encontradas nas faturas", () => {
    const g = geradorasEncontradas([
      { ...item("INJEÇÃO SCEE - UC 000405731001244 - GD I", 486.7079), fatura_id: "a" },
      { ...item("INJEÇÃO SCEE - UC 000405731001244 - GD I", 100), fatura_id: "b" },
      { ...item("INJEÇÃO SCEE - UC 000128066501220 - GD I", 4.2), fatura_id: "a" },
    ]);
    expect(g.map((x) => [x.numeroOriginal, x.kwhInjetados, x.faturas])).toEqual([
      ["000405731001244", 586.708, 2],
      ["000128066501220", 4.2, 1],
    ]);
  });

  it("aplica os valores só nas faturas com resultado", () => {
    const resultados = new Map([
      [
        "f1",
        {
          kwhInjetados: 73.9,
          tarifa: 1.174665,
          tarifaBandeira: 0.024828,
          valor: 69.45,
          desconto: 19.19,
          custoCheio: 88.64,
          situacao: "calculado" as const,
        },
      ],
    ]);
    const [a, b] = aplicarGrupoBc([{ id: "f1" }, { id: "f2" }], resultados);
    expect(a).toMatchObject({
      valor_grupo_bc: 69.45,
      desconto_grupo_bc: 19.19,
      custo_cheio_grupo_bc: 88.64,
      kwh_grupo_bc: 73.9,
    });
    expect(b!.custo_cheio_grupo_bc).toBeNull();
  });

  describe("regra automática (usina que não é UC cadastrada = terceiro)", () => {
    const itensReais = [
      item("CONSUMO NÃO COMPENSADO", 30.0021, { valor_unitario: 1.125925, valor_total: 33.78 }),
      item("CONSUMO SCEE", 490.9079, { valor_unitario: 0.77396, valor_total: 379.94 }),
      item("INJEÇÃO SCEE - UC 000128066501220 - GD I", 4.2, { valor_total: 3.25 }),
      item("INJEÇÃO SCEE - UC 000405731001244 - GD I", 486.7079, { valor_total: 376.69 }),
    ];
    const regraBase = (): RegraGrupoBc => ({
      // UCs cadastradas: a consumidora e a Fábrica de Ração (geradora própria)
      proprias: new Set(["172458701255", "128066501220"]),
      incluir: new Set(),
      excluir: new Set(),
    });

    it("caso real sem cadastrar usina: 438,40 + 109,60 = 548,00", () => {
      const geradoras = usinasGrupoBc(itensReais, regraBase());
      expect([...geradoras]).toEqual(["405731001244"]);
      expect(calcularGrupoBc(itensReais, geradoras)).toMatchObject({
        valor: 438.4,
        desconto: 109.6,
        custoCheio: 548,
      });
    });

    it("exceções: excluir tira um terceiro; incluir coloca uma UC própria", () => {
      const r = regraBase();
      r.excluir.add("405731001244");
      expect(usinasGrupoBc(itensReais, r).size).toBe(0);
      r.incluir.add("128066501220");
      expect([...usinasGrupoBc(itensReais, r)]).toEqual(["128066501220"]);
    });

    it("classifica a usina com o motivo", () => {
      const r = regraBase();
      expect(classificarUsina("000405731001244", r)).toEqual({
        grupoBc: true,
        motivo: "terceiro",
        automatico: true,
      });
      expect(classificarUsina("000128066501220", r)).toMatchObject({
        grupoBc: false,
        motivo: "propria",
      });
      r.excluir.add("405731001244");
      expect(classificarUsina("405731001244", r)).toMatchObject({
        grupoBc: false,
        motivo: "excluida_manual",
        automatico: true,
      });
    });
  });
});
