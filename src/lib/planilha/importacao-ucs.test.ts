import { describe, expect, it } from "vitest";

import { cnpjValido, normalizarUc } from "../documentos";
import { CONFIG_CADASTRO_PADRAO, type UnidadeConsumidora } from "../tipos";
import { gerarCsv } from "./arquivos";
import {
  celulaParaTexto,
  decodificarTexto,
  gerarPrevia,
  identificarColuna,
  interpretarLinhas,
} from "./importacao-ucs";

const existente: UnidadeConsumidora = {
  id: "1",
  numero_uc: "000123",
  numero_uc_normalizado: "123",
  fazenda: "Fazenda Velha",
  cnpj: "11222333000181",
  endereco: null,
  filial: "Matriz",
  area: null,
  situacao: "ativa",
  observacoes: null,
  created_at: "",
  updated_at: "",
};

describe("documentos", () => {
  it("valida CNPJ numérico e alfanumérico", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
  });

  it("normaliza o número da UC", () => {
    expect(normalizarUc(" 000.123-4 ")).toBe("1234");
    expect(normalizarUc("000")).toBe("0");
    expect(normalizarUc("--")).toBeNull();
  });
});

describe("planilha de UCs", () => {
  it("identifica colunas com diferenças de acentuação e maiúsculas", () => {
    expect(identificarColuna("Número da UC")).toBe("numero_uc");
    expect(identificarColuna("NUMERO DA UC")).toBe("numero_uc");
    expect(identificarColuna("endereço")).toBe("endereco");
    expect(identificarColuna(" Filial ")).toBe("filial");
    expect(identificarColuna("Observação")).toBeNull();
  });

  it("interpreta linhas, preserva zeros e ignora linhas vazias", () => {
    const r = interpretarLinhas([
      ["Relatório de UCs"],
      ["NÚMERO DA UC", "FAZENDA", "CNPJ", "ENDERECO", "FILIAL", "Extra"],
      ["000123", "Fazenda Nova", 11222333000181, "Rod. SP 100", "Matriz", "x"],
      [null, null, null, null, null, null],
      [987654321012, "Fazenda B", "11.444.777/0001-61", "", "Filial 2", ""],
    ]);
    expect(r.erros).toEqual([]);
    expect(r.colunasIgnoradas).toEqual(["Extra"]);
    expect(r.registros).toHaveLength(2);
    expect(r.registros[0]).toMatchObject({ linha: 3, numero_uc: "000123", cnpj: "11222333000181" });
    expect(r.registros[1]).toMatchObject({ linha: 5, numero_uc: "987654321012" });
  });

  it("recupera zeros à esquerda de CNPJ numérico", () => {
    expect(celulaParaTexto(1234567000189, "cnpj")).toBe("01234567000189");
  });

  it("aponta colunas obrigatórias ausentes", () => {
    const r = interpretarLinhas([
      ["Fazenda", "Filial"],
      ["A", "B"],
    ]);
    expect(r.erros.join(" ")).toMatch(/Numero da UC/);
  });

  it("gera prévia com inclusões, atualizações e rejeições por linha", () => {
    const { registros } = interpretarLinhas([
      ["Numero da UC", "Fazenda", "CNPJ", "Endereço", "Filial"],
      ["555", "Fazenda C", "11444777000161", "", "F1"],
      ["123", "Fazenda Velha", "11222333000181", "", "Matriz"],
      ["0123", "Fazenda Renomeada", "11222333000181", "Estrada 1", "Matriz"],
      ["777", "Fazenda D", "11222333000182", "", "F1"],
      ["555", "Duplicada", "11444777000161", "", "F1"],
      ["888", "", "11444777000161", "", "F1"],
      ["999", "Sem filial", "11444777000161", "", ""],
    ]);
    const previa = gerarPrevia(registros, [existente], "incluir_atualizar", CONFIG_CADASTRO_PADRAO);
    expect(previa.incluir).toBe(1);
    expect(previa.semAlteracao).toBe(1);
    expect(previa.atualizar).toBe(0);
    expect(previa.rejeitar).toBe(5);
    const motivos = previa.linhas
      .filter((l) => l.acao === "rejeitar")
      .map((l) => `${l.registro.linha}:${l.motivo}`);
    expect(motivos).toEqual([
      "4:UC duplicada na planilha (0123).",
      "5:CNPJ inválido (11222333000182).",
      "6:UC duplicada na planilha (555).",
      "7:Fazenda não informada.",
      "8:Filial não informada.",
    ]);

    const soAtualiza = gerarPrevia(
      registros.slice(2, 3),
      [existente],
      "atualizar",
      CONFIG_CADASTRO_PADRAO,
    );
    expect(soAtualiza.atualizar).toBe(1);
    expect(soAtualiza.linhas[0]?.alteracoes).toEqual([
      { campo: "fazenda", de: "Fazenda Velha", para: "Fazenda Renomeada" },
      { campo: "endereco", de: null, para: "Estrada 1" },
    ]);

    const soInclui = gerarPrevia(
      registros.slice(1, 2),
      [existente],
      "incluir",
      CONFIG_CADASTRO_PADRAO,
    );
    expect(soInclui.rejeitar).toBe(1);
  });

  it("decodifica CSV em Windows-1252", () => {
    const bytes = new Uint8Array([0x45, 0x6e, 0x64, 0x65, 0x72, 0x65, 0xe7, 0x6f]); // "Endereço" em latin1
    expect(decodificarTexto(bytes.buffer)).toBe("Endereço");
  });

  it("exporta CSV no padrão brasileiro", () => {
    const csv = gerarCsv(
      [
        { id: "a", titulo: "Valor", tipo: "moeda", valor: (l: { v: number; d: string }) => l.v },
        { id: "b", titulo: "Data", tipo: "data", valor: (l: { v: number; d: string }) => l.d },
      ],
      [{ v: 1234.5, d: "2026-01-31" }],
    );
    expect(csv).toBe('"Valor";"Data"\r\n"1234,5";"31/01/2026"');
  });

  it("padroniza a área, valida a situação e mantém valores de colunas ausentes", () => {
    const { registros } = interpretarLinhas([
      ["Numero da UC", "Fazenda", "CNPJ", "Filial", "Situação", "Área"],
      ["555", "Faz C", "11444777000161", "F1", "Inativo", "  pecuaria "],
      ["556", "Faz C", "11444777000161", "F1", "talvez", "Agrícola"],
      ["123", "Fazenda Velha", "11222333000181", "Matriz", "", "seringal"],
    ]);
    const previa = gerarPrevia(registros, [existente], "incluir_atualizar", CONFIG_CADASTRO_PADRAO);
    expect(previa.linhas[0]).toMatchObject({ acao: "incluir", registro: { area: "Pecuária" } });
    expect(previa.linhas[1]?.motivo).toBe("Situação inválida (talvez). Use Ativa ou Inativa.");
    expect(previa.linhas[2]?.alteracoes).toEqual([{ campo: "area", de: null, para: "Seringal" }]);

    const semColunas = interpretarLinhas([
      ["Numero da UC", "Fazenda", "CNPJ", "Filial"],
      ["123", "Fazenda Velha", "11222333000181", "Matriz"],
    ]);
    expect(semColunas.registros[0]).not.toHaveProperty("area");
    const p2 = gerarPrevia(
      semColunas.registros,
      [{ ...existente, area: "Oficina", situacao: "inativa" }],
      "atualizar",
      CONFIG_CADASTRO_PADRAO,
    );
    expect(p2.linhas[0]?.acao).toBe("sem_alteracao");
  });
});
