// Classificação dos itens faturados a partir da descrição do documento.
// As distribuidoras descrevem os itens de formas diferentes; por isso a regra é
// tolerante e conservadora: o que não for reconhecido fica como "outros" e o
// valor total da fatura continua vindo sempre do total do documento (vNF).

export type TipoItem =
  | "consumo"
  | "demanda"
  | "reativo"
  | "injecao"
  | "compensacao"
  | "credito"
  | "bandeira"
  | "cip"
  | "multa"
  | "juros"
  | "encargo"
  | "desconto"
  | "tributo"
  | "outros";

export type Componente = "TUSD" | "TE" | null;

export const ROTULOS_TIPO_ITEM: Record<TipoItem, string> = {
  consumo: "Consumo de energia",
  demanda: "Demanda",
  reativo: "Energia/demanda reativa",
  injecao: "Energia injetada",
  compensacao: "Energia compensada / créditos",
  credito: "Créditos de consumo / devoluções",
  bandeira: "Bandeira tarifária",
  cip: "CIP/COSIP",
  multa: "Multa",
  juros: "Juros / mora",
  encargo: "Encargos / atualização",
  desconto: "Descontos / devoluções",
  tributo: "Tributos destacados",
  outros: "Outros",
};

export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function classificarItem(descricao: string | null | undefined): TipoItem {
  const d = normalizarTexto(descricao);
  if (!d) return "outros";
  // Compensação por violação dos indicadores de continuidade (DIC/FIC/DMIC/DICRI):
  // crédito pago pela distribuidora ao consumidor.
  if (/\b(DIC|FIC|DMIC|DICRI)\b/.test(d)) return "credito";
  if (/INJETAD|INJECAO|\bENERGIA INJ|\bINJ\b/.test(d)) return "injecao";
  if (
    /COMPENS|CREDITO DE ENERGIA|CREDITOS DE ENERGIA|\bSCEE\b|\bGD\b|GERACAO DISTRIBUIDA/.test(d)
  ) {
    return "compensacao";
  }
  // Créditos lançados pela distribuidora (ex.: "CRÉDITO DE CONSUMO - 01/2026",
  // "DEV. ICMS COB. A MAIOR (-) - CRÉDITO DE CONSUMO"), muitas vezes com vProd positivo.
  if (/^CREDITO\b|\bCREDITO (DE|DO|REF|REFERENTE) |\(-\)/.test(d)) return "credito";
  if (/\bCIP\b|COSIP|ILUM(INACAO)?\.? PUB|CONTRIB.*ILUM|ILUMINACAO PUBLICA/.test(d)) return "cip";
  if (/MULTA/.test(d)) return "multa";
  if (/JUROS|\bMORA\b/.test(d)) return "juros";
  if (/ATUALIZ.*MONET|CORRECAO MONET|\bIPCA\b|\bIGPM\b/.test(d)) return "encargo";
  if (/BANDEIRA|ADIC\.? ?BAND|ADICIONAL BAND/.test(d)) return "bandeira";
  if (/REATIV|\bUFER\b|\bDMCR\b|\bERE\b|KVARH|KVAR\b/.test(d)) return "reativo";
  if (/DEMANDA/.test(d)) return "demanda";
  if (/DESCONTO|SUBSIDIO|SUBVENCAO|BONUS|ABATIMENTO|DEVOLUCAO|RESSARC|ESTORNO/.test(d)) {
    return "desconto";
  }
  if (/^(ICMS|PIS|COFINS|PIS\/COFINS)\b/.test(d)) return "tributo";
  if (
    /CONSUMO|ENERGIA ATIVA|ENERGIA ELETRICA|FORNECIMENTO|\bTUSD\b|\bTE\b|KWH|USO DO SISTEMA|ENERGIA (PONTA|FORA)/.test(
      d,
    )
  ) {
    return "consumo";
  }
  if (/ENCARGO|TAXA|SERVICO|EMISSAO DE 2|RELIGACAO|VISTORIA/.test(d)) return "encargo";
  return "outros";
}

/**
 * Ajusta a classificação pelo sinal do valor. Na NF3e com SCEE (geração
 * distribuída) as distribuidoras costumam lançar a energia consumida pelo preço
 * cheio com "SCEE"/"GD" na descrição (ex.: "Energia SCEE ISENTA", "Consumo SCEE")
 * e, em outro item, o crédito abatido com valor negativo. Somar os dois como
 * "compensação" anularia o crédito; por isso:
 * - item de compensação com valor positivo e sem indicar crédito/injeção é consumo;
 * - item de energia com valor negativo em fatura com gSCEE é crédito compensado.
 */
export function ajustarTipoPeloValor(
  tipo: TipoItem,
  descricao: string | null | undefined,
  valor: number | null,
  faturaComScee: boolean,
): TipoItem {
  if (valor == null || valor === 0) return tipo;
  const d = normalizarTexto(descricao);
  if (tipo === "compensacao" && valor > 0 && !/COMPENSAD|CREDITO|INJET/.test(d)) return "consumo";
  if (tipo === "consumo" && valor < 0 && faturaComScee) return "compensacao";
  return tipo;
}

export function identificarComponente(descricao: string | null | undefined): Componente {
  const d = normalizarTexto(descricao);
  if (/\bTUSD\b|USO DO SISTEMA|USO SIST|DISTRIBUICAO/.test(d)) return "TUSD";
  if (/\bTE\b|TARIFA DE ENERGIA|ENERGIA TE\b|\(TE\)/.test(d)) return "TE";
  return null;
}

/** Códigos de posto tarifário da NF3e (cPosTarif) e reconhecimento pela descrição. */
export function identificarPosto(
  codigo: string | null | undefined,
  descricao: string | null | undefined,
): string | null {
  const mapa: Record<string, string> = {
    "0": "Único",
    "1": "Ponta",
    "2": "Fora ponta",
    "3": "Intermediário",
    "4": "Ponta reservado",
    "5": "Fora ponta reservado",
    "6": "Intermediário reservado",
    "7": "Reservado",
  };
  if (codigo != null && mapa[codigo]) return mapa[codigo]!;
  const d = normalizarTexto(descricao);
  if (/FORA (DE )?PONTA|F\.? ?PONTA|\bFP\b/.test(d)) return "Fora ponta";
  if (/INTERMED/.test(d)) return "Intermediário";
  if (/RESERVAD/.test(d)) return "Reservado";
  if (/\bPONTA\b/.test(d)) return "Ponta";
  return null;
}

/**
 * Unidade de medida da NF3e (uMed): 1 = kW, 2 = kWh. A descrição é usada como
 * complemento (ex.: itens de energia reativa em kVArh).
 */
export function identificarUnidade(
  codigo: string | null | undefined,
  descricao: string | null | undefined,
  tipo: TipoItem,
): string | null {
  const d = normalizarTexto(descricao);
  if (tipo === "reativo") {
    if (/KVARH/.test(d) || codigo === "4") return "kVArh";
    if (/KVAR\b/.test(d) || codigo === "3") return "kVAr";
    return codigo === "1" ? "kVAr" : "kVArh";
  }
  switch (codigo) {
    case "1":
      return "kW";
    case "2":
      return "kWh";
    case "3":
      return "kVAr";
    case "4":
      return "kVArh";
    case "5":
      return "UN";
  }
  if (codigo) {
    const c = normalizarTexto(codigo);
    if (c === "KWH") return "kWh";
    if (c === "MWH") return "MWh";
    if (c === "KW") return "kW";
    if (c === "KVARH") return "kVArh";
    if (c === "KVAR") return "kVAr";
    return codigo;
  }
  if (/KWH/.test(d)) return "kWh";
  if (tipo === "demanda") return "kW";
  return null;
}
