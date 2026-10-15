// Importação de cadastro de UCs por planilha (XLSX/CSV): leitura, identificação
// de colunas, validação e prévia das alterações. A validação definitiva é
// repetida no banco (função importar_ucs) antes de gravar.

import { cnpjValido, normalizarCnpj, normalizarUc } from "../documentos";
import type { ConfigCadastroUc, UnidadeConsumidora } from "../tipos";

export type CampoUc = "numero_uc" | "fazenda" | "cnpj" | "endereco" | "filial";

export const CAMPOS_PLANILHA: { campo: CampoUc; titulo: string; obrigatorio: boolean }[] = [
  { campo: "numero_uc", titulo: "Numero da UC", obrigatorio: true },
  { campo: "fazenda", titulo: "Fazenda", obrigatorio: true },
  { campo: "cnpj", titulo: "CNPJ", obrigatorio: true },
  { campo: "endereco", titulo: "Endereço", obrigatorio: false },
  { campo: "filial", titulo: "Filial", obrigatorio: false },
];

const SINONIMOS: Record<CampoUc, string[]> = {
  numero_uc: [
    "numerodauc",
    "numerouc",
    "nuc",
    "nouc",
    "uc",
    "unidadeconsumidora",
    "numerodaunidadeconsumidora",
    "codigouc",
    "instalacao",
    "numeroinstalacao",
  ],
  fazenda: ["fazenda", "propriedade", "nomedafazenda", "fazendapropriedade"],
  cnpj: ["cnpj", "cnpjdotitular", "cnpjtitular", "cnpjcpf"],
  endereco: ["endereco", "enderecodauc", "localizacao", "logradouro"],
  filial: ["filial", "unidade", "unidadedenegocio", "filialresponsavel"],
};

export function normalizarCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function identificarColuna(cabecalho: string): CampoUc | null {
  const n = normalizarCabecalho(cabecalho);
  if (!n) return null;
  for (const [campo, nomes] of Object.entries(SINONIMOS) as [CampoUc, string[]][]) {
    if (nomes.includes(n)) return campo;
  }
  return null;
}

export interface RegistroPlanilha {
  linha: number;
  numero_uc: string;
  fazenda: string;
  cnpj: string;
  endereco: string;
  filial: string;
}

export interface LeituraPlanilha {
  registros: RegistroPlanilha[];
  mapeamento: Partial<Record<CampoUc, string>>;
  colunasIgnoradas: string[];
  erros: string[];
}

/** Converte valor de célula em texto, preservando dígitos (sem notação científica). */
export function celulaParaTexto(v: unknown, campo?: CampoUc): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    let s = Number.isInteger(v) ? v.toLocaleString("fullwide", { useGrouping: false }) : String(v);
    // CNPJ numérico armazenado como número perde zeros à esquerda no Excel
    if (campo === "cnpj" && /^\d{12,13}$/.test(s)) s = s.padStart(14, "0");
    return s;
  }
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

/** Interpreta a matriz de células (primeira linha com cabeçalhos reconhecidos). */
export function interpretarLinhas(linhas: unknown[][]): LeituraPlanilha {
  const erros: string[] = [];
  let idxCabecalho = -1;
  let mapa: (CampoUc | null)[] = [];
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    const tentativa = (linhas[i] ?? []).map((c) => identificarColuna(celulaParaTexto(c)));
    if (tentativa.filter(Boolean).length >= 2) {
      idxCabecalho = i;
      mapa = tentativa;
      break;
    }
  }
  if (idxCabecalho < 0) {
    return {
      registros: [],
      mapeamento: {},
      colunasIgnoradas: [],
      erros: [
        "Não foi possível identificar a linha de cabeçalho. Use as colunas: Numero da UC, Fazenda, CNPJ, Endereço e Filial.",
      ],
    };
  }

  const cabecalhos = (linhas[idxCabecalho] ?? []).map((c) => celulaParaTexto(c));
  const mapeamento: Partial<Record<CampoUc, string>> = {};
  const colunasIgnoradas: string[] = [];
  const usados = new Set<CampoUc>();
  mapa = mapa.map((campo, i) => {
    if (campo && !usados.has(campo)) {
      usados.add(campo);
      mapeamento[campo] = cabecalhos[i] ?? "";
      return campo;
    }
    if (cabecalhos[i]) colunasIgnoradas.push(cabecalhos[i]!);
    return null;
  });

  for (const c of CAMPOS_PLANILHA) {
    if (c.obrigatorio && !usados.has(c.campo))
      erros.push(`Coluna obrigatória ausente: "${c.titulo}".`);
  }
  if (erros.length) return { registros: [], mapeamento, colunasIgnoradas, erros };

  const registros: RegistroPlanilha[] = [];
  for (let i = idxCabecalho + 1; i < linhas.length; i++) {
    const linha = linhas[i] ?? [];
    const reg: RegistroPlanilha = {
      linha: i + 1,
      numero_uc: "",
      fazenda: "",
      cnpj: "",
      endereco: "",
      filial: "",
    };
    let vazio = true;
    mapa.forEach((campo, col) => {
      if (!campo) return;
      const valor = celulaParaTexto(linha[col], campo);
      if (valor) vazio = false;
      reg[campo] = valor;
    });
    if (!vazio) registros.push(reg);
  }
  if (!registros.length) erros.push("A planilha não contém registros abaixo do cabeçalho.");
  return { registros, mapeamento, colunasIgnoradas, erros };
}

export type ModoImportacao = "incluir" | "atualizar" | "incluir_atualizar";

export const ROTULOS_MODO: Record<ModoImportacao, string> = {
  incluir: "Somente incluir novas UCs",
  atualizar: "Somente atualizar UCs existentes",
  incluir_atualizar: "Incluir novas e atualizar existentes",
};

export interface Alteracao {
  campo: CampoUc;
  de: string | null;
  para: string | null;
}

export interface LinhaPrevia {
  registro: RegistroPlanilha;
  acao: "incluir" | "atualizar" | "sem_alteracao" | "rejeitar";
  motivo?: string;
  alteracoes?: Alteracao[];
  existente?: UnidadeConsumidora;
}

export interface Previa {
  linhas: LinhaPrevia[];
  incluir: number;
  atualizar: number;
  semAlteracao: number;
  rejeitar: number;
}

const vazioParaNull = (s: string) => (s.trim() ? s.trim() : null);

/** Mesmas regras de public.importar_ucs. */
export function gerarPrevia(
  registros: RegistroPlanilha[],
  existentes: UnidadeConsumidora[],
  modo: ModoImportacao,
  cfg: ConfigCadastroUc,
): Previa {
  const porNumero = new Map(existentes.map((u) => [u.numero_uc_normalizado, u]));
  const vistos = new Set<string>();
  const linhas: LinhaPrevia[] = registros.map((registro) => {
    const norm = normalizarUc(registro.numero_uc);
    const cnpj = normalizarCnpj(registro.cnpj);
    const rejeitar = (motivo: string): LinhaPrevia => ({ registro, acao: "rejeitar", motivo });
    if (!norm) return rejeitar("Número da UC não informado.");
    if (!registro.fazenda.trim()) return rejeitar("Fazenda não informada.");
    if (!cnpj) return rejeitar("CNPJ não informado.");
    if (!cnpjValido(cnpj)) return rejeitar(`CNPJ inválido (${registro.cnpj}).`);
    if (cfg.filial_obrigatoria && !registro.filial.trim()) return rejeitar("Filial não informada.");
    if (cfg.endereco_obrigatorio && !registro.endereco.trim())
      return rejeitar("Endereço não informado.");
    if (vistos.has(norm)) return rejeitar(`UC duplicada na planilha (${registro.numero_uc}).`);
    vistos.add(norm);

    const existente = porNumero.get(norm);
    if (existente) {
      if (modo === "incluir") {
        return {
          ...rejeitar("UC já cadastrada (modo inclusão não altera cadastros existentes)."),
          existente,
        };
      }
      const novos: Record<CampoUc, string | null> = {
        numero_uc: existente.numero_uc,
        fazenda: registro.fazenda.trim(),
        cnpj,
        endereco: vazioParaNull(registro.endereco),
        filial: vazioParaNull(registro.filial),
      };
      const alteracoes: Alteracao[] = (["fazenda", "cnpj", "endereco", "filial"] as CampoUc[])
        .filter((c) => (existente[c as keyof UnidadeConsumidora] ?? null) !== novos[c])
        .map((c) => ({
          campo: c,
          de: (existente[c as keyof UnidadeConsumidora] as string | null) ?? null,
          para: novos[c],
        }));
      return alteracoes.length
        ? { registro, acao: "atualizar", alteracoes, existente }
        : { registro, acao: "sem_alteracao", existente };
    }
    if (modo === "atualizar")
      return rejeitar("UC não cadastrada (modo atualização não inclui novas UCs).");
    return { registro, acao: "incluir" };
  });
  return {
    linhas,
    incluir: linhas.filter((l) => l.acao === "incluir").length,
    atualizar: linhas.filter((l) => l.acao === "atualizar").length,
    semAlteracao: linhas.filter((l) => l.acao === "sem_alteracao").length,
    rejeitar: linhas.filter((l) => l.acao === "rejeitar").length,
  };
}

/** Decodifica CSV em UTF-8; se inválido, usa Windows-1252 (padrão do Excel em PT-BR). */
export function decodificarTexto(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}
