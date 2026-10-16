// Monta os dados do DANF3E (documento auxiliar da NF3e — layout da conta de
// energia) a partir do XML original. Função pura: lê só o XML.
//
// Os sinais dos itens seguem o leitor de faturas (lerXml): créditos com
// indDevolucao ou com vProd positivo que o vNF desconta saem negativos.

import { XMLParser } from "fast-xml-parser";

import { lerXml } from "../xml/leitor-fatura";
import { atributo, buscarTodos, filho, lista, num, txt, type No } from "../xml/no-xml";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: true,
});

export interface Endereco {
  linha1: string;
  linha2: string;
}

export interface ItemDanf3e {
  descricao: string;
  unidade: string;
  quantidade: number | null;
  precoUnitario: number | null;
  valor: number;
  pisCofins: number | null;
  baseIcms: number | null;
  aliquotaIcms: number | null;
  icms: number | null;
  tarifaUnitaria: number | null;
}

export interface TributoDanf3e {
  nome: string;
  base: number | null;
  aliquota: number | null;
  valor: number | null;
}

export interface HistoricoDanf3e {
  competencia: string; // AAAA-MM
  kwh: number;
  dias: number | null;
}

export interface MedicaoDanf3e {
  medidor: string;
  grandeza: string;
  posto: string;
  leituraAnterior: number | null;
  leituraAtual: number | null;
  constante: number | null;
  consumo: number | null;
}

export interface Danf3e {
  emitente: { nome: string; cnpj: string | null; ie: string | null; endereco: Endereco };
  classificacao: string;
  tipoFornecimento: string | null;
  cliente: { nome: string; documento: string | null; endereco: Endereco };
  enderecoEntrega: Endereco | null;
  numeroUc: string;
  competencia: string | null; // AAAA-MM
  totalAPagar: number | null;
  vencimento: string | null; // AAAA-MM-DD
  leituraAnterior: string | null;
  leituraAtual: string | null;
  dias: number | null;
  proximaLeitura: string | null;
  numeroNota: string | null;
  serie: string | null;
  emissao: string | null; // ISO com hora
  chaveAcesso: string | null;
  urlConsulta: string | null;
  protocolo: string | null;
  dataProtocolo: string | null;
  cfop: string | null;
  mensagens: string[];
  itens: ItemDanf3e[];
  totalItens: { valor: number; pisCofins: number; baseIcms: number; icms: number };
  tributos: TributoDanf3e[];
  historico: HistoricoDanf3e[];
  mediaHistorico: number | null;
  medicoes: MedicaoDanf3e[];
  reservadoFisco: string | null;
  resolucaoAneel: string | null;
  apresentacao: string | null;
}

// --- Tabelas de códigos da NF3e (MOC) ---------------------------------------

const GRUPO_TENSAO: Record<string, string> = {
  "01": "A A1",
  "02": "A A2",
  "03": "A A3",
  "04": "A A3a",
  "05": "A A4",
  "06": "A AS",
  "07": "B B1",
  "08": "B B1 BAIXA RENDA",
  "09": "B B2",
  "10": "B B2 COOPERATIVA",
  "11": "B B2 SERVIÇO PÚBLICO DE IRRIGAÇÃO",
  "12": "B B3",
  "13": "B B4a",
  "14": "B B4b",
};

const CLASSE: Record<string, string> = {
  "01": "COMERCIAL",
  "02": "CONSUMO PRÓPRIO",
  "03": "ILUMINAÇÃO PÚBLICA",
  "04": "INDUSTRIAL",
  "05": "PODER PÚBLICO",
  "06": "RESIDENCIAL",
  "07": "RURAL",
  "08": "SERVIÇO PÚBLICO",
};

const SUBCLASSE: Record<string, string> = {
  "16": "AGROPECUÁRIA RURAL CONVENCIONAL",
};

const FASE: Record<string, string> = { "1": "MONOFÁSICO", "2": "BIFÁSICO", "3": "TRIFÁSICO" };

const GRANDEZA: Record<string, string> = {
  "01": "DEMANDA - KW",
  "02": "DEMANDA REATIVA - KVAR",
  "03": "ENERGIA ATIVA - KWH",
  "04": "ENERGIA ATIVA INJETADA - KWH",
  "05": "ENERGIA REATIVA - KVARH",
};

const POSTO: Record<string, string> = {
  "0": "ÚNICO",
  "1": "PONTA",
  "2": "FORA PONTA",
  "3": "INTERMEDIÁRIO",
  "4": "PONTA RESERVADO",
  "5": "FORA PONTA RESERVADO",
  "6": "INTERMEDIÁRIO RESERVADO",
  "7": "RESERVADO",
};

const UNIDADE: Record<string, string> = {
  "1": "kW",
  "2": "kWh",
  "3": "kVAr",
  "4": "kVArh",
  "5": "UN",
};

// --- Utilitários --------------------------------------------------------------

/** Número da UC no formato da fatura: 000172458701255 → 1.724.587.012-55. */
export function formatarNumeroUc(id: string | null | undefined): string {
  const d = (id ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 3) return id ?? "";
  const corpo = d.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${corpo}-${d.slice(-2)}`;
}

function formatarDocumento(d: string | null): string | null {
  if (!d) return null;
  const s = d.replace(/\D/g, "");
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}

function endereco(e: No | undefined): Endereco {
  const partes1 = [txt(e, "xLgr"), txt(e, "nro") && `N. ${txt(e, "nro")}`, txt(e, "xCpl")];
  const partes2 = [
    txt(e, "xBairro"),
    [txt(e, "xMun"), txt(e, "UF")].filter(Boolean).join("/"),
    txt(e, "CEP") && `CEP ${txt(e, "CEP")}`,
  ];
  return {
    linha1: partes1.filter(Boolean).join(", "),
    linha2: partes2.filter(Boolean).join(" · "),
  };
}

const data = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function competencia(v: string | null): string | null {
  const m = /^(\d{4})-?(\d{2})$/.exec((v ?? "").trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

function diasEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(d) ? Math.round(d) : null;
}

function soma(...v: (number | null)[]): number | null {
  const n = v.filter((x): x is number => x != null);
  return n.length ? n.reduce((a, b) => a + b, 0) : null;
}

const arred = (v: number, c = 2) => Math.round(v * 10 ** c) / 10 ** c;

/** Soma de um campo em qualquer nível do grupo informado. */
function imp(grupo: No | undefined, campo: string): number | null {
  return soma(...buscarTodos(grupo, campo).map((n) => num(txt(n))));
}

/** Grupo do ICMS do item (ICMS00, ICMS20, ICMS40…). */
function grupoIcms(imposto: No | undefined): No | undefined {
  if (!imposto) return undefined;
  const chave = Object.keys(imposto).find((k) => /^ICMS\d|^ICMSSN/.test(k));
  return chave ? filho(imposto, chave) : undefined;
}

/** Aplica o sinal do item (crédito = negativo), preservando valores já negativos. */
function comSinal(v: number | null, sinal: number): number | null {
  if (v == null) return null;
  return arred(sinal < 0 ? -Math.abs(v) : v);
}

// --- Montagem -------------------------------------------------------------

export function montarDanf3e(xml: string): Danf3e {
  const raiz = parser.parse(xml) as No;
  const nf3e = filho(raiz, "nf3eProc", "NF3e") ?? filho(raiz, "NF3e");
  const inf = filho(nf3e, "infNF3e");
  if (!inf) throw new Error("O arquivo não é um XML de NF3e.");
  const prot = filho(raiz, "nf3eProc", "protNF3e", "infProt");
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const dest = filho(inf, "dest");
  const acessante = filho(inf, "acessante");
  const gFat = filho(inf, "gFat");
  const gMed = lista(inf, "gMed");
  const total = filho(inf, "total");

  // Sinais dos itens conforme o leitor de faturas
  const leitura = lerXml(xml);
  const sinalPorItem = new Map<number, number>();
  if (leitura.tipo === "fatura") {
    for (const i of leitura.itens) {
      if (i.numero_item != null && i.valor_total != null) {
        sinalPorItem.set(i.numero_item, i.valor_total < 0 ? -1 : 1);
      }
    }
  }

  const itens: ItemDanf3e[] = [];
  const atos = new Set<string>();
  const medicoes: MedicaoDanf3e[] = [];
  const medidorPadrao = txt(gMed[0], "idMedidor") ?? "";
  for (const nfdet of lista(inf, "NFdet")) {
    for (const det of lista(nfdet, "det")) {
      const detItem = filho(det, "detItem") ?? filho(det, "detItemAnt");
      if (!detItem) continue;
      const prod = filho(detItem, "prod");
      const imposto = filho(detItem, "imposto");
      const n = num(atributo(det, "nItem"));
      const vProd = num(txt(prod, "vProd")) ?? 0;
      const sinal =
        (n != null ? sinalPorItem.get(n) : undefined) ??
        (txt(prod, "indDevolucao") === "1" && vProd > 0 ? -1 : 1);
      const icms = grupoIcms(imposto);
      const gTarifs = lista(detItem, "gTarif");
      for (const g of gTarifs) {
        const ato = txt(g, "nAto");
        const ano = txt(g, "anoAto");
        if (ato) atos.add(`${ato}/${(ano ?? "").slice(-2)}`);
      }
      const pis = imp(filho(imposto, "PISEfet"), "vPISEfet") ?? imp(filho(imposto, "PIS"), "vPIS");
      const cofins =
        imp(filho(imposto, "COFINSEfet"), "vCOFINSEfet") ??
        imp(filho(imposto, "COFINS"), "vCOFINS");
      itens.push({
        descricao: txt(prod, "xProd") ?? "",
        unidade: UNIDADE[txt(prod, "uMed") ?? ""] ?? txt(prod, "uMed") ?? "",
        quantidade: num(txt(prod, "qFaturada")),
        precoUnitario: num(txt(prod, "vItem")),
        valor: comSinal(vProd, sinal) ?? 0,
        pisCofins: comSinal(soma(pis, cofins), sinal),
        baseIcms: comSinal(num(txt(icms, "vBC")), sinal),
        aliquotaIcms: num(txt(icms, "pICMS")),
        icms: comSinal(num(txt(icms, "vICMS")), sinal),
        tarifaUnitaria: soma(...gTarifs.map((g) => num(txt(g, "vTarifHom")))),
      });

      // Medições ligadas ao item
      for (const gMedicao of buscarTodos(prod ?? detItem, "gMedicao")) {
        for (const m of lista(gMedicao, "gMedida")) {
          const ant = num(txt(m, "vMedAnt"));
          const atu = num(txt(m, "vMedAtu"));
          const cons = num(txt(m, "vConst"));
          const vMed = num(txt(m, "vMed"));
          const linha: MedicaoDanf3e = {
            medidor: medidorPadrao,
            grandeza: GRANDEZA[txt(m, "tpGrMed") ?? ""] ?? `GRANDEZA ${txt(m, "tpGrMed") ?? "—"}`,
            posto: POSTO[txt(m, "cPosTarif") ?? ""] ?? "ÚNICO",
            leituraAnterior: ant,
            leituraAtual: atu,
            constante: cons,
            consumo: vMed ?? (ant != null && atu != null ? (atu - ant) * (cons ?? 1) : null),
          };
          const chave = JSON.stringify(linha);
          if (!medicoes.some((x) => JSON.stringify(x) === chave)) medicoes.push(linha);
        }
      }
    }
  }
  if (!medicoes.length && medidorPadrao) {
    medicoes.push({
      medidor: medidorPadrao,
      grandeza: "ENERGIA ATIVA - KWH",
      posto: "ÚNICO",
      leituraAnterior: null,
      leituraAtual: null,
      constante: null,
      consumo: null,
    });
  }

  const totalItens = {
    valor: arred(itens.reduce((a, i) => a + i.valor, 0)),
    pisCofins: arred(itens.reduce((a, i) => a + (i.pisCofins ?? 0), 0)),
    baseIcms: arred(itens.reduce((a, i) => a + (i.baseIcms ?? 0), 0)),
    icms: arred(itens.reduce((a, i) => a + (i.icms ?? 0), 0)),
  };

  // Tributos (efetivos quando informados)
  const somaItens = (grupo: string, campo: string) =>
    soma(
      ...lista(inf, "NFdet").flatMap((nfdet) =>
        lista(nfdet, "det").map((det) => {
          const n = num(atributo(det, "nItem"));
          const sinal = (n != null ? sinalPorItem.get(n) : undefined) ?? 1;
          return comSinal(imp(filho(det, "detItem", "imposto", grupo), campo), sinal);
        }),
      ),
    );
  const tributo = (nome: string, base: number | null, valor: number | null): TributoDanf3e => ({
    nome,
    base: base == null ? null : arred(base),
    valor: valor == null ? null : arred(valor),
    aliquota: base && valor != null ? arred((valor / base) * 100, 4) : null,
  });
  const pisValor = num(txt(total, "vPISEfet")) ?? num(txt(total, "vPIS"));
  const cofinsValor = num(txt(total, "vCOFINSEfet")) ?? num(txt(total, "vCOFINS"));
  const aliquotasIcms = [...new Set(itens.map((i) => i.aliquotaIcms).filter((a) => a != null))];
  const icmsBase = num(txt(total, "ICMSTot", "vBC"));
  const icmsValor = num(txt(total, "ICMSTot", "vICMS"));
  const tributos: TributoDanf3e[] = [
    tributo("PIS/PASEP", somaItens("PISEfet", "vBCPISEfet") ?? somaItens("PIS", "vBC"), pisValor),
    {
      ...tributo("ICMS", icmsBase, icmsValor),
      ...(aliquotasIcms.length === 1 ? { aliquota: aliquotasIcms[0]! } : {}),
    },
    tributo(
      "COFINS",
      somaItens("COFINSEfet", "vBCCOFINSEfet") ?? somaItens("COFINS", "vBC"),
      cofinsValor,
    ),
  ];

  // Histórico de consumo (energia ativa)
  const historico: HistoricoDanf3e[] = [];
  for (const h of buscarTodos(filho(inf, "gANEEL"), "gHistFat")) {
    const nome = (txt(h, "xGrandFat") ?? "").toLowerCase();
    if (historico.length && !nome.includes("ativa")) continue;
    for (const g of lista(h, "gGrandFat")) {
      const comp = competencia(txt(g, "CompetFat"));
      const kwh = num(txt(g, "vFat"));
      if (comp && kwh != null)
        historico.push({ competencia: comp, kwh, dias: num(txt(g, "qtdDias")) });
    }
    if (historico.length) break;
  }
  historico.sort((a, b) => b.competencia.localeCompare(a.competencia));
  const mediaHistorico = historico.length
    ? arred(historico.reduce((a, h) => a + h.kwh, 0) / historico.length)
    : null;

  // Classificação
  const grupo = GRUPO_TENSAO[txt(acessante, "tpGrpTensao") ?? ""];
  const classe = CLASSE[txt(acessante, "tpClasse") ?? ""];
  const subCodigo = txt(acessante, "tpSubClasse");
  const sub = subCodigo ? (SUBCLASSE[subCodigo] ?? `SUBCLASSE ${subCodigo}`) : null;
  const classificacao =
    [[grupo, classe].filter(Boolean).join(" "), sub].filter(Boolean).join(" - ") ||
    "Classificação não informada";

  const leituraAnterior = data(txt(gMed[0], "dMedAnt"));
  const leituraAtual = data(txt(gMed[gMed.length - 1], "dMedAtu"));
  const chave = (atributo(inf, "Id") ?? "").replace(/^NF3e/, "") || txt(prot, "chNF3e");
  const entrega = filho(gFat, "enderCorresp");
  const infCpl = txt(inf, "infAdic", "infCpl");

  return {
    emitente: {
      nome: txt(emit, "xNome") ?? "",
      cnpj: formatarDocumento(txt(emit, "CNPJ")),
      ie: txt(emit, "IE"),
      endereco: endereco(filho(emit, "enderEmit")),
    },
    classificacao,
    tipoFornecimento: FASE[txt(acessante, "tpFase") ?? ""] ?? null,
    cliente: {
      nome: txt(dest, "xNome") ?? "",
      documento: formatarDocumento(txt(dest, "CNPJ") ?? txt(dest, "CPF")),
      endereco: endereco(filho(dest, "enderDest")),
    },
    enderecoEntrega: entrega ? endereco(entrega) : null,
    numeroUc: formatarNumeroUc(txt(acessante, "idAcesso")),
    competencia: competencia(txt(gFat, "CompetFat")),
    totalAPagar: num(txt(total, "vNF")),
    vencimento: data(txt(gFat, "dVencFat")),
    leituraAnterior,
    leituraAtual,
    dias: diasEntre(leituraAnterior, leituraAtual),
    proximaLeitura: data(txt(gFat, "dProxLeitura")),
    numeroNota: txt(ide, "nNF"),
    serie: txt(ide, "serie"),
    emissao: txt(ide, "dhEmi"),
    chaveAcesso: chave || null,
    urlConsulta: txt(filho(nf3e, "infNF3eSupl"), "qrCodNF3e"),
    protocolo: txt(prot, "nProt"),
    dataProtocolo: txt(prot, "dhRecbto"),
    cfop:
      buscarTodos(inf, "CFOP")
        .map((c) => txt(c))
        .find(Boolean) ?? null,
    mensagens: (infCpl ?? "")
      .split(";")
      .map((m) => m.trim().replace(/^\d+\s*-\s*/, ""))
      // "3544/25" isolado é o ato da ANEEL (exibido em Resolução ANEEL)
      .filter((m) => m && !/^\d+\/\d{2,4}$/.test(m)),
    itens,
    totalItens,
    tributos,
    historico,
    mediaHistorico,
    medicoes,
    reservadoFisco: txt(inf, "infAdic", "infAdFisco"),
    resolucaoAneel: atos.size ? [...atos].join(", ") : null,
    apresentacao: data(txt(gFat, "dApresFat")),
  };
}
