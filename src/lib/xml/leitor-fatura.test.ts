import { describe, expect, it } from "vitest";

import { gerarChave, gerarEventoCancelamento, gerarNF3e } from "@/test/fixtures/nf3e";

import { custoDaFatura } from "../analise/calculos";

import { classificarItem, identificarComponente } from "./classificacao-itens";
import { competencia, hashConteudo, lerXml } from "./leitor-fatura";

function lerFatura(xml: string) {
  const r = lerXml(xml);
  if (r.tipo !== "fatura")
    throw new Error(`esperava fatura, obteve ${r.tipo}: ${"erro" in r ? r.erro : ""}`);
  return r;
}

describe("leitura de NF3e", () => {
  it("extrai identificação, UC, datas e situação", () => {
    const { fatura, avisos } = lerFatura(gerarNF3e());
    expect(fatura.tipo_documento).toBe("NF3e");
    expect(fatura.modelo_documento).toBe("66");
    expect(fatura.chave_acesso).toBe(gerarChave(1001));
    expect(fatura.numero_documento).toBe("1001");
    expect(fatura.serie).toBe("1");
    expect(fatura.numero_uc_extraido).toBe("000123456");
    expect(fatura.data_emissao).toBe("2026-02-05");
    expect(fatura.periodo_referencia).toBe("2026-01-01");
    expect(fatura.data_vencimento).toBe("2026-02-20");
    expect(fatura.data_leitura_anterior).toBe("2026-01-03");
    expect(fatura.data_leitura_atual).toBe("2026-02-02");
    expect(fatura.dias_faturados).toBe(30);
    expect(fatura.cnpj_emitente).toBe("02341467000120");
    expect(fatura.nome_fornecedor).toBe("DISTRIBUIDORA DE ENERGIA TESTE S.A.");
    expect(fatura.cnpj_destinatario).toBe("11222333000181");
    expect(fatura.municipio).toBe("Americana");
    expect(fatura.classe_consumo).toBe("Rural");
    expect(fatura.status_documento).toBe("autorizada");
    expect(fatura.protocolo_autorizacao).toBe("135260000012345");
    expect(fatura.finalidade).toBe("normal");
    expect(avisos.some((a) => a.includes("soma dos itens"))).toBe(false);
  });

  it("calcula consumo sem duplicar TUSD e TE e separa componentes", () => {
    const { fatura, itens } = lerFatura(gerarNF3e());
    expect(itens).toHaveLength(5);
    expect(fatura.consumo_faturado_kwh).toBe(1500);
    expect(fatura.consumo_medido_kwh).toBe(1500); // mesma medição em dois itens não é somada duas vezes
    expect(fatura.consumo_kwh).toBe(1500);
    expect(fatura.origem_consumo).toBe("faturado");
    expect(fatura.valor_tusd).toBe(630);
    expect(fatura.valor_te).toBe(450);
    expect(fatura.valor_energia).toBe(1080);
    expect(fatura.valor_bandeira).toBe(30);
    expect(fatura.valor_cip).toBe(45.5);
    expect(fatura.valor_descontos).toBe(40);
    expect(fatura.valor_total).toBe(1115.5);
    expect(fatura.valor_icms).toBe(194.4);
    expect(fatura.valor_pis).toBe(7.02);
    expect(fatura.valor_cofins).toBe(32.4);
    const desconto = itens.find((i) => i.tipo_item === "desconto");
    expect(desconto?.valor_total).toBe(-40);
  });

  it("mantém indisponível o que não existe no XML", () => {
    const { fatura, avisos } = lerFatura(gerarNF3e({ competencia: null, uc: null }));
    expect(fatura.periodo_referencia).toBeNull();
    expect(fatura.numero_uc_extraido).toBeNull();
    expect(fatura.demanda_contratada_kw).toBeNull();
    expect(fatura.energia_injetada_kwh).toBeNull();
    expect(fatura.valor_multas).toBeNull();
    expect(avisos.join(" ")).toMatch(/idAcesso/);
    expect(avisos.join(" ")).toMatch(/CompetFat/);
  });

  it("trata geração distribuída, demanda e reativo", () => {
    const { fatura } = lerFatura(
      gerarNF3e({
        demandaContratada: 150,
        itens: [
          {
            descricao: "Consumo TUSD Fora Ponta",
            qtd: 8000,
            uMed: "2",
            vProd: 3200,
            cPosTarif: "2",
          },
          { descricao: "Consumo TE Fora Ponta", qtd: 8000, uMed: "2", vProd: 2400, cPosTarif: "2" },
          {
            descricao: "Energia Ativa Injetada TUSD",
            qtd: 3000,
            uMed: "2",
            vProd: 1200,
            devolucao: true,
          },
          {
            descricao: "Energia Ativa Injetada TE",
            qtd: 3000,
            uMed: "2",
            vProd: 900,
            devolucao: true,
          },
          {
            descricao: "Demanda TUSD",
            qtd: 142,
            uMed: "1",
            vProd: 2840,
            medida: { tpGrMed: "01", uMed: "1", ant: 0, atu: 142 },
          },
          { descricao: "Energia Reativa Excedente kVArh", qtd: 320, uMed: "2", vProd: 96 },
          { descricao: "Multa por atraso", vProd: 20 },
          { descricao: "Juros de mora", vProd: 5.5 },
        ],
      }),
    );
    expect(fatura.consumo_kwh).toBe(8000);
    expect(fatura.energia_injetada_kwh).toBe(3000);
    expect(fatura.valor_compensacao).toBe(-2100);
    expect(fatura.demanda_contratada_kw).toBe(150);
    expect(fatura.demanda_faturada_kw).toBe(142);
    expect(fatura.demanda_medida_kw).toBe(142);
    expect(fatura.valor_demanda).toBe(2840);
    expect(fatura.energia_reativa_kvarh).toBe(320);
    expect(fatura.valor_reativo).toBe(96);
    expect(fatura.valor_multas).toBe(20);
    expect(fatura.valor_juros).toBe(5.5);
  });

  it("fatura zerada por créditos mantém o custo da energia antes da compensação", () => {
    const { fatura } = lerFatura(
      gerarNF3e({
        itens: [
          { descricao: "Consumo Ativo TUSD", qtd: 2000, uMed: "2", vProd: 800 },
          { descricao: "Consumo Ativo TE", qtd: 2000, uMed: "2", vProd: 600 },
          {
            descricao: "Energia Ativa Injetada TUSD",
            qtd: 2000,
            uMed: "2",
            vProd: 800,
            devolucao: true,
          },
          {
            descricao: "Energia Ativa Injetada TE",
            qtd: 2000,
            uMed: "2",
            vProd: 600,
            devolucao: true,
          },
        ],
      }),
    );
    expect(fatura.valor_total).toBe(0);
    expect(fatura.valor_compensacao).toBe(-1400);
    expect(custoDaFatura(fatura)).toBe(1400);
    expect(custoDaFatura(fatura, "faturado")).toBe(0);
  });

  it("identifica documento sem protocolo e documento substituto", () => {
    const semProt = lerFatura(gerarNF3e({ protocolo: false }));
    expect(semProt.fatura.status_documento).toBe("sem_protocolo");
    expect(semProt.avisos.join(" ")).toMatch(/sem protocolo/i);

    const original = gerarChave(1001);
    const sub = lerFatura(gerarNF3e({ numero: 1002, finNF3e: "2", chaveSubstituida: original }));
    expect(sub.fatura.finalidade).toBe("substituicao");
    expect(sub.fatura.chave_substituida).toBe(original);
  });

  it("aponta divergência entre soma dos itens e total", () => {
    const { avisos, fatura } = lerFatura(gerarNF3e({ vNF: 2000 }));
    expect(fatura.valor_total).toBe(2000);
    expect(avisos.join(" ")).toMatch(/soma dos itens/i);
  });

  it("lê evento de cancelamento homologado", () => {
    const chave = gerarChave(1001);
    const r = lerXml(gerarEventoCancelamento(chave));
    expect(r.tipo).toBe("evento");
    if (r.tipo === "evento") {
      expect(r.evento.tipo_evento).toBe("cancelamento");
      expect(r.evento.chave_acesso).toBe(chave);
      expect(r.evento.protocolo).toBe("135260000099999");
    }
    const semRet = lerXml(gerarEventoCancelamento(chave, false));
    expect(semRet.tipo).toBe("erro");
  });

  it("rejeita XML inválido, vazio, não suportado e com DOCTYPE", () => {
    expect(lerXml("").tipo).toBe("erro");
    expect(lerXml("<a><b></a>").tipo).toBe("erro");
    expect(lerXml("<?xml version='1.0'?><pedido><x>1</x></pedido>").tipo).toBe("erro");
    const xxe = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>`;
    const r = lerXml(xxe);
    expect(r.tipo).toBe("erro");
    if (r.tipo === "erro") expect(r.erro).toMatch(/DOCTYPE/);
  });

  it("lê NF-e de energia com UC nas informações complementares", () => {
    const xml = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe versao="4.00" Id="NFe35260111222333000181550010000004561000004561">
      <ide><mod>55</mod><serie>1</serie><nNF>456</nNF><dhEmi>2026-02-03T08:00:00-03:00</dhEmi><finNFe>1</finNFe></ide>
      <emit><CNPJ>11444777000161</CNPJ><xNome>COMERCIALIZADORA X</xNome></emit>
      <dest><CNPJ>11222333000181</CNPJ><xNome>AGRO</xNome></dest>
      <det nItem="1"><prod><cProd>1</cProd><xProd>Energia eletrica</xProd><CFOP>5251</CFOP><uCom>MWh</uCom><qCom>12.5</qCom><vUnCom>300</vUnCom><vProd>3750.00</vProd></prod><imposto><ICMS><ICMS00><vICMS>675</vICMS></ICMS00></ICMS></imposto></det>
      <total><ICMSTot><vICMS>675.00</vICMS><vPIS>24.38</vPIS><vCOFINS>112.50</vCOFINS><vNF>3750.00</vNF></ICMSTot></total>
      <infAdic><infCpl>Unidade Consumidora: 0012345-6 Referencia: 01/2026</infCpl></infAdic>
    </infNFe></NFe><protNFe><infProt><chNFe>35260111222333000181550010000004561000004561</chNFe><cStat>100</cStat><nProt>1</nProt></infProt></protNFe></nfeProc>`;
    const { fatura } = lerFatura(xml);
    expect(fatura.tipo_documento).toBe("NF-e");
    expect(fatura.numero_uc_extraido).toBe("0012345-6");
    expect(fatura.periodo_referencia).toBe("2026-01-01");
    expect(fatura.valor_total).toBe(3750);
    expect(fatura.consumo_kwh).toBe(12500); // 12,5 MWh convertidos para kWh
  });

  it("gera hash estável do conteúdo", async () => {
    const a = await hashConteudo("abc");
    expect(a).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("classificação de itens", () => {
  it.each([
    ["Consumo Ativo TUSD", "consumo", "TUSD"],
    ["CONSUMO ATIVO TE PONTA", "consumo", "TE"],
    ["Energia Ativa Injetada TE", "injecao", "TE"],
    ["Compensação de DIC", "desconto", null],
    ["Contrib Ilum Publica", "cip", null],
    ["Adicional Bandeira Vermelha P1", "bandeira", null],
    ["Demanda Ultrapassagem TUSD", "demanda", "TUSD"],
    ["UFER Fora Ponta", "reativo", null],
    ["Juros Moratórios", "juros", null],
    ["Atualização Monetária", "encargo", null],
    ["Desconto Irrigação", "desconto", null],
    ["Serviço qualquer", "encargo", null],
  ])("%s → %s", (descricao, tipo, componente) => {
    expect(classificarItem(descricao)).toBe(tipo);
    expect(identificarComponente(descricao)).toBe(componente);
  });

  it("interpreta competências", () => {
    expect(competencia("202601")).toBe("2026-01-01");
    expect(competencia("2026-12")).toBe("2026-12-01");
    expect(competencia("03/2025")).toBe("2025-03-01");
    expect(competencia("202613")).toBeNull();
    expect(competencia(null)).toBeNull();
  });
});
