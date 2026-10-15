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
  if (/\b(DIC|FIC|DMIC|DICRI)\b/.test(d)) return "desconto";
  if (/INJETAD|INJECAO|\bENERGIA INJ|\bINJ\b/.test(d)) return "injecao";
  if (
    /COMPENS|CREDITO DE ENERGIA|CREDITOS DE ENERGIA|\bSCEE\b|\bGD\b|GERACAO DISTRIBUIDA/.test(d)
  ) {
    return "compensacao";
  }
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
