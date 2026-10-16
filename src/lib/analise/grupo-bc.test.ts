import { describe, expect, it } from "vitest";

import { aplicarGrupoBc, calcularGrupoBc, type ItemGrupoBc } from "./grupo-bc";

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
  it("exemplo AGO/2026 UC 157990001258: 73,90 × 1,174665 × 0,80 = 69,45", () => {
    const r = calcularGrupoBc([
      item("CONSUMO NÃO COMPENSADO", 120, { valor_unitario: 1.174665, valor_total: 140.96 }),
      item("INJEÇÃO SCEE - UC 10019756133 - GD II", -73.9, { valor_total: -86.81 }),
    ]);
    expect(r).toEqual({
      kwhInjetados: 73.9,
      tarifa: 1.174665,
      valor: 69.45,
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

  it("sem linha INJEÇÃO SCEE o valor é zero", () => {
    const r = calcularGrupoBc([item("CONSUMO NÃO COMPENSADO", 100, { valor_unitario: 1.1 })]);
    expect(r).toMatchObject({ kwhInjetados: 0, valor: 0, situacao: "sem_injecao" });
    expect(calcularGrupoBc([]).valor).toBe(0);
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
    expect(r).toMatchObject({ valor: null, situacao: "tarifa_indisponivel" });
  });

  it("aplica o valor só nas faturas das UCs do Grupo BC", () => {
    const resultados = new Map([
      [
        "f1",
        { kwhInjetados: 73.9, tarifa: 1.174665, valor: 69.45, situacao: "calculado" as const },
      ],
    ]);
    const [a, b] = aplicarGrupoBc(
      [
        { id: "f1", unidade_consumidora_id: "uc-bc" },
        { id: "f1", unidade_consumidora_id: "uc-outra" },
      ],
      new Set(["uc-bc"]),
      resultados,
    );
    expect(a!.valor_grupo_bc).toBe(69.45);
    expect(b!.valor_grupo_bc).toBeNull();
  });
});
