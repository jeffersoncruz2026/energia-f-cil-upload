import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Zap, Upload, FileText, Trash2, CalendarDays, Gauge } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Controle Energia Elétrica" },
      {
        name: "description",
        content:
          "Faça upload dos XMLs das suas faturas de energia elétrica (NF3e) e visualize consumo, valores e vencimentos em um só lugar.",
      },
      { property: "og:title", content: "Controle Energia Elétrica" },
      {
        property: "og:description",
        content:
          "Faça upload dos XMLs das suas faturas de energia elétrica (NF3e) e visualize consumo, valores e vencimentos em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

interface Fatura {
  id: string;
  arquivo: string;
  numero: string;
  competencia: string;
  emissao: string;
  vencimento: string;
  distribuidora: string;
  cliente: string;
  valor: number;
  consumoKwh: number | null;
}

function text(doc: Document, tag: string): string {
  return doc.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function parseXml(fileName: string, content: string): Fatura | null {
  const doc = new DOMParser().parseFromString(content, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  if (!doc.getElementsByTagName("infNF3e").length && !doc.getElementsByTagName("infNFe").length)
    return null;

  const vNF = parseFloat(text(doc, "vNF") || text(doc, "vTotDFe") || "0");

  // Soma o consumo faturado em kWh (uMed = 2 na NF3e indica kWh nos itens com gMedida)
  let consumo: number | null = null;
  const medidas = doc.getElementsByTagName("gMedida");
  for (let i = 0; i < medidas.length; i++) {
    const m = medidas[i];
    const ant = parseFloat(m.getElementsByTagName("vMedAnt")[0]?.textContent ?? "");
    const atu = parseFloat(m.getElementsByTagName("vMedAtu")[0]?.textContent ?? "");
    const cons = parseFloat(m.getElementsByTagName("vConst")[0]?.textContent ?? "1");
    if (!isNaN(ant) && !isNaN(atu)) {
      consumo = (consumo ?? 0) + (atu - ant) * (isNaN(cons) ? 1 : cons);
    }
  }

  const competencia = text(doc, "CompetFat");
  const compFmt =
    competencia.length === 6 ? `${competencia.slice(4)}/${competencia.slice(0, 4)}` : competencia;

  return {
    id: `${fileName}-${Date.now()}-${Math.random()}`,
    arquivo: fileName,
    numero: text(doc, "nNF"),
    competencia: compFmt,
    emissao: text(doc, "dhEmi").slice(0, 10),
    vencimento: text(doc, "dVencFat"),
    distribuidora: text(doc, "xNome"),
    cliente: text(doc, "dest") ? "" : "",
    valor: isNaN(vNF) ? 0 : vNF,
    consumoKwh: consumo,
  };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Index() {
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const novas: Fatura[] = [];
    const falhas: string[] = [];
    for (const file of Array.from(files)) {
      const parsed = parseXml(file.name, await file.text());
      if (parsed) novas.push(parsed);
      else falhas.push(file.name);
    }
    setFaturas((prev) => [...prev, ...novas]);
    setErros(falhas);
  }

  const totalValor = faturas.reduce((s, f) => s + f.valor, 0);
  const totalKwh = faturas.reduce((s, f) => s + (f.consumoKwh ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Controle Energia Elétrica</h1>
            <p className="text-sm text-muted-foreground">
              Upload de faturas em XML (NF3e) com resumo de consumo e valores
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {/* Upload */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors hover:border-primary hover:bg-accent"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="font-medium text-foreground">
            Clique para selecionar os XMLs das faturas
          </span>
          <span className="text-sm text-muted-foreground">
            Você pode selecionar vários arquivos de uma vez
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xml"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {erros.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Não foi possível ler: {erros.join(", ")}
          </div>
        )}

        {/* Resumo */}
        {faturas.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" /> Faturas
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{faturas.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gauge className="h-4 w-4" /> Consumo total
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {totalKwh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" /> Valor total
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{brl.format(totalValor)}</p>
            </div>
          </div>
        )}

        {/* Lista */}
        {faturas.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Competência</th>
                  <th className="px-4 py-3 font-medium">Nº Nota</th>
                  <th className="px-4 py-3 font-medium">Distribuidora</th>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 text-right font-medium">Consumo</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {faturas.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{f.competencia || "—"}</td>
                    <td className="px-4 py-3 text-foreground">{f.numero || "—"}</td>
                    <td className="px-4 py-3 text-foreground">{f.distribuidora || "—"}</td>
                    <td className="px-4 py-3 text-foreground">
                      {f.vencimento ? f.vencimento.split("-").reverse().join("/") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {f.consumoKwh != null
                        ? `${f.consumoKwh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {brl.format(f.valor)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label="Remover fatura"
                        onClick={() => setFaturas((prev) => prev.filter((x) => x.id !== f.id))}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {faturas.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Nenhuma fatura carregada ainda. Os dados são lidos apenas no seu navegador — nada é
            enviado para servidores.
          </p>
        )}
      </main>
    </div>
  );
}
