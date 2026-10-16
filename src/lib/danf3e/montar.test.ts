import { describe, expect, it } from "vitest";

import { gerarNF3e } from "@/test/fixtures/nf3e";

import { formatarNumeroUc, montarDanf3e } from "./montar";

describe("DANF3E a partir do XML", () => {
  it("formata o número da UC como na fatura", () => {
    expect(formatarNumeroUc("000172458701255")).toBe("1.724.587.012-55");
    expect(formatarNumeroUc("000123456")).toBe("1.234-56");
  });

  it("monta cabeçalho, cliente, classificação e valores", () => {
    const d = montarDanf3e(gerarNF3e({ uc: "000172458701255", competencia: "202604" }));
    expect(d.numeroUc).toBe("1.724.587.012-55");
    expect(d.competencia).toBe("2026-04");
    expect(d.emitente.nome).toBe("DISTRIBUIDORA DE ENERGIA TESTE S.A.");
    expect(d.emitente.cnpj).toBe("02.341.467/0001-20");
    expect(d.cliente.documento).toBe("11.222.333/0001-81");
    // tpGrpTensao 05, tpClasse 07, subclasse sem descrição conhecida
    expect(d.classificacao).toBe("A A4 RURAL - SUBCLASSE 71");
    expect(d.tipoFornecimento).toBe("TRIFÁSICO");
    expect(d.chaveAcesso).toHaveLength(44);
    expect(d.historico).toEqual([]);
    expect(d.mediaHistorico).toBeNull();
  });

  it("itens com sinal (devolução negativa), totais e tarifa homologada", () => {
    const d = montarDanf3e(
      gerarNF3e({
        itens: [
          { descricao: "CONSUMO", qtd: 100, uMed: "2", vItem: 1.2, vProd: 120, icms: 22.8 },
          { descricao: "CRÉDITO DE CONSUMO", qtd: 1, uMed: "5", vProd: 20, devolucao: true },
        ],
      }),
    );
    expect(d.itens.map((i) => [i.descricao, i.unidade, i.valor])).toEqual([
      ["CONSUMO", "kWh", 120],
      ["CRÉDITO DE CONSUMO", "UN", -20],
    ]);
    expect(d.totalItens.valor).toBe(100);
    expect(d.totalAPagar).toBe(100);
    expect(d.itens[0]!.icms).toBe(22.8);
    expect(d.itens[0]!.tarifaUnitaria).toBe(1.2);
  });
});
