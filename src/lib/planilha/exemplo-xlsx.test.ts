// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CONFIG_CADASTRO_PADRAO } from "../tipos";
import { gerarPrevia, interpretarLinhas } from "./importacao-ucs";

describe("planilha padrão de UCs (XLSX)", () => {
  it("lê a planilha padrão com Situação e Área", async () => {
    const { readFileSync } = await import("node:fs");
    const { readSheet } = await import("read-excel-file/universal");
    const buffer = readFileSync("src/test/fixtures/exemplo-ucs.xlsx");
    const linhas = await readSheet(new Blob([buffer]));
    const r = interpretarLinhas(linhas as unknown[][]);
    expect(r.erros).toEqual([]);
    expect(r.colunasIgnoradas).toEqual([]);
    expect(Object.keys(r.mapeamento)).toEqual(
      expect.arrayContaining([
        "numero_uc",
        "fazenda",
        "cnpj",
        "endereco",
        "filial",
        "situacao",
        "area",
      ]),
    );
    expect(r.registros[0]).toMatchObject({
      linha: 2,
      numero_uc: "211747701200",
      fazenda: "Faz. Lavrinha Pivot",
      cnpj: "02.685.006/0020-38",
      filial: "6",
      situacao: "ativa",
      area: "Agrícola",
    });
    const previa = gerarPrevia(r.registros, [], "incluir", CONFIG_CADASTRO_PADRAO);
    expect(previa.incluir).toBe(3);
    expect(previa.linhas.map((l) => l.registro.area)).toEqual(["Agrícola", "Pecuária", "Pecuária"]);
  });
});
