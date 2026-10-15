// Leitura de arquivos de planilha (navegador) e exportação de dados para CSV/XLSX.

import Papa from "papaparse";

import { decodificarTexto } from "./importacao-ucs";

export const TAMANHO_MAXIMO_PLANILHA = 10 * 1024 * 1024; // 10 MB

export async function lerArquivoPlanilha(arquivo: File): Promise<unknown[][]> {
  if (arquivo.size > TAMANHO_MAXIMO_PLANILHA) {
    throw new Error("Arquivo excede o limite de 10 MB.");
  }
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
    const texto = decodificarTexto(await arquivo.arrayBuffer());
    const r = Papa.parse<string[]>(texto, {
      skipEmptyLines: "greedy",
      delimitersToGuess: [";", ",", "\t", "|"],
    });
    if (r.errors.length && !r.data.length) throw new Error("Não foi possível ler o arquivo CSV.");
    return r.data;
  }
  if (nome.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/universal");
    const dados = await readSheet(arquivo);
    return dados as unknown[][];
  }
  if (nome.endsWith(".xls")) {
    throw new Error(
      "Formato .xls (Excel 97-2003) não suportado. Salve a planilha como .xlsx ou .csv.",
    );
  }
  throw new Error("Formato não suportado. Envie um arquivo .xlsx ou .csv.");
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export type TipoColuna = "texto" | "moeda" | "numero" | "kwh" | "data" | "percentual" | "decimal4";

export interface ColunaExportacao<T> {
  id: string;
  titulo: string;
  tipo?: TipoColuna;
  valor: (linha: T) => string | number | boolean | null | undefined;
}

function baixar(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textoCsv<T>(c: ColunaExportacao<T>, linha: T): string {
  const v = c.valor(linha);
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") {
    const casas = c.tipo === "decimal4" ? 4 : c.tipo === "moeda" || c.tipo === "percentual" ? 2 : 3;
    return v.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: casas });
  }
  if (c.tipo === "data") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return v;
}

/** CSV no padrão brasileiro: separador ";", vírgula decimal e BOM para o Excel. */
export function gerarCsv<T>(colunas: ColunaExportacao<T>[], linhas: T[]): string {
  const dados = [
    colunas.map((c) => c.titulo),
    ...linhas.map((l) => colunas.map((c) => textoCsv(c, l))),
  ];
  return Papa.unparse(dados, { delimiter: ";", newline: "\r\n", quotes: true });
}

export function exportarCsv<T>(nomeArquivo: string, colunas: ColunaExportacao<T>[], linhas: T[]) {
  const csv = gerarCsv(colunas, linhas);
  baixar(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `${nomeArquivo}.csv`);
}

const FORMATOS: Partial<Record<TipoColuna, string>> = {
  moeda: '"R$" #,##0.00',
  numero: "#,##0.###",
  kwh: "#,##0.###",
  percentual: '0.00"%"',
  decimal4: "0.0000",
};

export async function exportarXlsx<T>(
  nomeArquivo: string,
  colunas: ColunaExportacao<T>[],
  linhas: T[],
  nomeAba = "Dados",
) {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const cabecalho = colunas.map((c) => ({ value: c.titulo, fontWeight: "bold" as const }));
  const corpo = linhas.map((l) =>
    colunas.map((c) => {
      const v = c.valor(l);
      if (v == null || v === "") return null;
      if (typeof v === "number") {
        const formato = c.tipo ? FORMATOS[c.tipo] : undefined;
        return formato ? { value: v, format: formato } : { value: v };
      }
      if (typeof v === "boolean") return { value: v ? "Sim" : "Não" };
      if (c.tipo === "data") {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
        if (m) {
          return {
            value: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
            format: "dd/mm/yyyy",
          };
        }
      }
      return { value: v };
    }),
  );
  const blob = await writeExcelFile(
    [cabecalho, ...corpo] as never,
    {
      sheet: nomeAba.slice(0, 31),
      columns: colunas.map((c) => ({ width: Math.min(Math.max(c.titulo.length + 4, 12), 50) })),
      stickyRowsCount: 1,
    } as never,
  ).toBlob();
  baixar(blob, `${nomeArquivo}.xlsx`);
}

export async function baixarModeloPlanilha(formato: "xlsx" | "csv") {
  const titulos = ["Numero da UC", "Fazenda", "CNPJ", "Endereço", "Filial", "Situação", "Área"];
  if (formato === "csv") {
    const csv = Papa.unparse([titulos], { delimiter: ";", newline: "\r\n" });
    baixar(
      new Blob(["\uFEFF" + csv + "\r\n"], { type: "text/csv;charset=utf-8" }),
      "modelo-unidades-consumidoras.csv",
    );
    return;
  }
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const linhas = [titulos.map((t) => ({ value: t, fontWeight: "bold" as const }))];
  const blob = await writeExcelFile(
    linhas as never,
    {
      sheet: "Unidades Consumidoras",
      columns: [
        { width: 18 },
        { width: 30 },
        { width: 22 },
        { width: 45 },
        { width: 12 },
        { width: 12 },
        { width: 18 },
      ],
    } as never,
  ).toBlob();
  baixar(blob, "modelo-unidades-consumidoras.xlsx");
}
