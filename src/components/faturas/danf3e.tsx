// DANF3E (layout da conta de energia) montado a partir do XML da NF3e.
// Medidas em mm para caber em uma página A4 na impressão ("Salvar como PDF").

import type { ReactNode } from "react";

import type { Danf3e } from "@/lib/danf3e/montar";

const AZUL = "#1a6fc4";
const AZUL_CLARO = "#6cc3ea";
const VERDE = "#3d9a3f";
const BORDA = "#9fb8d6";

const nf = (casas: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const n2 = nf(2);
const n6 = nf(6);
const fmt = (v: number | null | undefined, f = n2) => (v == null ? "" : f.format(v));
const moeda = (v: number | null | undefined) => (v == null ? "—" : `R$ ${n2.format(v)}`);
const dataBr = (v: string | null | undefined) =>
  v ? v.slice(0, 10).split("-").reverse().join("/") : "—";
const dataHoraBr = (v: string | null | undefined) => (v ? `${dataBr(v)} ${v.slice(11, 19)}` : "—");
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const mesAno = (c: string | null, curto = false) => {
  if (!c) return "—";
  const [a, m] = c.split("-");
  return `${MESES[Number(m) - 1]}/${curto ? a!.slice(2) : a}`;
};

function Caixa({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2.5mm] border ${className}`} style={{ borderColor: BORDA }}>
      {children}
    </div>
  );
}

function Faixa({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-t-[2.5mm] px-[2.5mm] py-[1.2mm] text-[8.5pt] font-bold text-white ${className}`}
      style={{ background: AZUL }}
    >
      {children}
    </div>
  );
}

function Destaque({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="flex-1 overflow-hidden rounded-[2mm] border" style={{ borderColor: cor }}>
      <div
        className="py-[0.8mm] text-center text-[8pt] font-bold text-white"
        style={{ background: cor }}
      >
        {titulo}
      </div>
      <div className="py-[1.6mm] text-center text-[9pt] font-bold">{valor}</div>
    </div>
  );
}

export function Danf3eDocumento({ d }: { d: Danf3e }) {
  const maxHist = Math.max(1, ...d.historico.map((h) => h.kwh), d.mediaHistorico ?? 0);
  const celula = "px-[1mm] py-[0.5mm] text-right tabular-nums";
  return (
    <div
      className="danf3e mx-auto bg-white text-[7pt] leading-tight text-black"
      style={{ width: "194mm", fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-[4mm] pb-[2mm]">
        <div>
          <div className="text-[5.5pt]" style={{ color: AZUL }}>
            DANF3E - DOCUMENTO AUXILIAR DA NOTA FISCAL DE ENERGIA ELÉTRICA ELETRÔNICA
          </div>
          <div className="text-[13pt] font-bold" style={{ color: AZUL }}>
            {d.emitente.nome}
          </div>
          <div className="text-[8.5pt]" style={{ color: AZUL }}>
            CNPJ: {d.emitente.cnpj ?? "—"} | Insc. Estadual: {d.emitente.ie ?? "—"}
          </div>
          <div className="text-[8.5pt]" style={{ color: AZUL }}>
            {[d.emitente.endereco.linha1, d.emitente.endereco.linha2].filter(Boolean).join(" · ")}
          </div>
        </div>
        {d.enderecoEntrega && (
          <div className="max-w-[45mm] text-[5.5pt] uppercase">
            ENDEREÇO DE ENTREGA:
            <br />
            {d.enderecoEntrega.linha1}
            <br />
            {d.enderecoEntrega.linha2}
          </div>
        )}
      </div>

      {/* Bloco principal */}
      <div className="grid grid-cols-2 gap-[2mm]">
        <div className="space-y-[1.5mm]">
          <Caixa className="flex">
            <div className="flex-1 border-r p-[1.5mm]" style={{ borderColor: BORDA }}>
              Classificação: {d.classificacao}
            </div>
            <div className="flex w-[38mm] items-center justify-center p-[1.5mm] text-center">
              Tipo de fornecimento: {d.tipoFornecimento ?? "—"}
            </div>
          </Caixa>
          <Caixa className="space-y-[2mm] p-[1.5mm]">
            <div className="flex gap-[2mm]">
              <div className="flex-1 uppercase">
                <div className="font-bold">{d.cliente.nome}</div>
                <div>CNPJ/CPF: {d.cliente.documento ?? "—"}</div>
                <div>{d.cliente.endereco.linha1}</div>
                <div>{d.cliente.endereco.linha2}</div>
              </div>
              <div
                className="flex w-[45mm] flex-col items-center justify-center rounded-[2mm] py-[2mm] text-white"
                style={{ background: VERDE }}
              >
                <div className="text-[8.5pt] font-bold">NÚMERO DA UC</div>
                <div className="mt-[1mm] text-[9.5pt] font-bold">{d.numeroUc}</div>
              </div>
            </div>
            <div className="flex gap-[1.5mm]">
              <Destaque titulo="REF: MÊS/ANO" valor={mesAno(d.competencia)} cor={AZUL_CLARO} />
              <Destaque titulo="TOTAL A PAGAR" valor={moeda(d.totalAPagar)} cor={VERDE} />
              <Destaque titulo="VENCIMENTO" valor={dataBr(d.vencimento)} cor={AZUL_CLARO} />
            </div>
          </Caixa>
        </div>

        <div className="space-y-[1.5mm]">
          <div className="h-[3mm] rounded-[1.5mm]" style={{ background: AZUL }} />
          <Caixa className="flex overflow-hidden">
            <div
              className="flex w-[22mm] items-center justify-center text-center text-[8.5pt] font-bold text-white"
              style={{ background: AZUL }}
            >
              Data das Leituras
            </div>
            {[
              ["Leitura Anterior", dataBr(d.leituraAnterior)],
              ["Leitura Atual", dataBr(d.leituraAtual)],
              ["Nº de Dias", d.dias != null ? String(d.dias) : "—"],
              ["Previsão Próxima Leitura", dataBr(d.proximaLeitura)],
            ].map(([t, v]) => (
              <div key={t} className="flex-1 border-l text-center" style={{ borderColor: BORDA }}>
                <div className="border-b py-[0.8mm]" style={{ borderColor: BORDA }}>
                  {t}
                </div>
                <div className="py-[1mm] text-[8pt] font-bold">{v}</div>
              </div>
            ))}
          </Caixa>
          <div className="space-y-[0.8mm] px-[1mm] text-[6.5pt]">
            <div>
              NOTA FISCAL Nº {d.numeroNota ?? "—"} - SÉRIE {d.serie ?? "—"} / DATA DE EMISSÃO:{" "}
              {dataHoraBr(d.emissao)}
            </div>
            <div className="pt-[1mm]">Consulte pela Chave de Acesso em:</div>
            <div className="break-all">{d.urlConsulta ?? "—"}</div>
            <div>chave de acesso:</div>
            <div className="font-mono">{d.chaveAcesso ?? "—"}</div>
            <div>
              Protocolo de autorização: {d.protocolo ?? "—"}
              {d.dataProtocolo && ` - ${dataHoraBr(d.dataProtocolo)}`}
            </div>
            {d.cfop && <div>CFOP {d.cfop}</div>}
          </div>
        </div>
      </div>

      {/* Mensagens */}
      <Caixa className="mt-[2mm] overflow-hidden">
        <Faixa className="rounded-t-none">MENSAGENS IMPORTANTES</Faixa>
        <div
          className="min-h-[14mm] space-y-[0.5mm] p-[1.5mm] text-[6pt]"
          style={{ background: "#e6f2fb" }}
        >
          {d.mensagens.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      </Caixa>

      {/* Itens + tributos/consumo */}
      <div className="mt-[2mm] grid gap-[2mm]" style={{ gridTemplateColumns: "1fr 64mm" }}>
        <Caixa className="overflow-hidden">
          <table className="w-full border-collapse text-[6.2pt]">
            <thead style={{ background: AZUL }} className="text-white">
              <tr>
                {[
                  "Itens da Fatura",
                  "Unid.",
                  "Quant.",
                  "Preço unit (R$) com tributos",
                  "Valor (R$)",
                  "PIS/ COFINS",
                  "Base Calc. ICMS (R$)",
                  "Alíquota ICMS (%)",
                  "ICMS",
                  "Tarifa unit. (R$)",
                ].map((t, i) => (
                  <th
                    key={t}
                    className={`px-[1mm] py-[1mm] font-bold ${i ? "text-center" : "text-left"}`}
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-[1mm] pt-[1mm] font-bold" colSpan={10}>
                  FORNECIMENTO
                </td>
              </tr>
              {d.itens.map((i, k) => (
                <tr key={`${i.descricao}-${k}`}>
                  <td className="px-[1mm] py-[0.5mm]">{i.descricao}</td>
                  <td className="px-[1mm] text-center">{i.unidade}</td>
                  <td className={celula}>{fmt(i.quantidade)}</td>
                  <td className={celula}>{fmt(i.precoUnitario, n6)}</td>
                  <td className={celula}>{fmt(i.valor)}</td>
                  <td className={celula}>{fmt(i.pisCofins)}</td>
                  <td className={celula}>{fmt(i.baseIcms)}</td>
                  <td className={celula}>
                    {i.aliquotaIcms != null ? `${fmt(i.aliquotaIcms, nf(0))}%` : ""}
                  </td>
                  <td className={celula}>{fmt(i.icms)}</td>
                  <td className={celula}>{fmt(i.tarifaUnitaria, n6)}</td>
                </tr>
              ))}
              <tr style={{ height: `${Math.max(4, 22 - d.itens.length * 3)}mm` }}>
                <td colSpan={10} />
              </tr>
              <tr className="border-t font-bold" style={{ borderColor: BORDA }}>
                <td className="px-[1mm] py-[1mm]">TOTAL</td>
                <td />
                <td />
                <td />
                <td className={celula}>{fmt(d.totalItens.valor)}</td>
                <td className={celula}>{fmt(d.totalItens.pisCofins)}</td>
                <td className={celula}>{fmt(d.totalItens.baseIcms)}</td>
                <td />
                <td className={celula}>{fmt(d.totalItens.icms)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </Caixa>

        <div className="space-y-[2mm]">
          <Caixa className="overflow-hidden">
            <table className="w-full text-[6.5pt]">
              <thead style={{ background: AZUL }} className="text-white">
                <tr>
                  {["Tributos", "Base (R$)", "Alíquota", "Valor (R$)"].map((t) => (
                    <th key={t} className="px-[1mm] py-[1mm] text-center font-bold">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.tributos.map((t) => (
                  <tr key={t.nome}>
                    <td className="px-[1mm] py-[0.5mm]">{t.nome}</td>
                    <td className={celula}>{fmt(t.base)}</td>
                    <td className={celula}>
                      {t.aliquota != null ? `${fmt(t.aliquota, nf(t.aliquota % 1 ? 4 : 0))}%` : ""}
                    </td>
                    <td className={celula}>{fmt(t.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Caixa>
          <Caixa className="overflow-hidden">
            <Faixa className="text-center">CONSUMO (kWh)</Faixa>
            <div className="space-y-[0.4mm] p-[1.5mm] text-[5.5pt]">
              <div className="flex font-bold">
                <span className="w-[10mm]">MÊS/ANO</span>
                <span className="flex-1">CONSUMO FATURADO (kWh)</span>
                <span className="w-[6mm] text-right">DIAS</span>
              </div>
              {[
                ...(d.mediaHistorico != null
                  ? [{ rotulo: "MÉDIA", kwh: d.mediaHistorico, dias: null as number | null }]
                  : []),
                ...d.historico.map((h) => ({
                  rotulo: mesAno(h.competencia, true),
                  kwh: h.kwh,
                  dias: h.dias,
                })),
              ].map((h) => (
                <div key={h.rotulo} className="flex items-center">
                  <span className="w-[10mm] font-bold">{h.rotulo}</span>
                  <span className="flex flex-1 items-center gap-[1mm]">
                    <span
                      className="inline-block h-[2.2mm] border"
                      style={{ width: `${(h.kwh / maxHist) * 26}mm`, borderColor: AZUL }}
                    />
                    <span>{fmt(h.kwh)}</span>
                  </span>
                  <span className="w-[6mm] text-right">{h.dias ?? ""}</span>
                </div>
              ))}
              {!d.historico.length && (
                <div className="text-center">Histórico não informado no XML.</div>
              )}
            </div>
          </Caixa>
        </div>
      </div>

      {/* Medidor + fisco/ANEEL */}
      <div className="mt-[2mm] grid gap-[2mm]" style={{ gridTemplateColumns: "1fr 64mm" }}>
        <Caixa className="min-h-[34mm] overflow-hidden">
          <table className="w-full text-[6.2pt]">
            <thead style={{ background: AZUL }} className="text-white">
              <tr>
                {[
                  "Medidor",
                  "Grandezas",
                  "Postos Horários",
                  "Leitura Anterior",
                  "Leitura Atual",
                  "Constante Medidor",
                  "Consumo kWh",
                ].map((t) => (
                  <th key={t} className="px-[1mm] py-[1mm] text-center font-bold">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.medicoes.map((m, k) => (
                <tr key={k}>
                  <td className="px-[1mm] py-[0.5mm]">{m.medidor}</td>
                  <td className="px-[1mm]">{m.grandeza}</td>
                  <td className="px-[1mm] text-center">{m.posto}</td>
                  <td className={celula}>{fmt(m.leituraAnterior, nf(0))}</td>
                  <td className={celula}>{fmt(m.leituraAtual, nf(0))}</td>
                  <td className={celula}>{fmt(m.constante, n6)}</td>
                  <td className={celula}>{fmt(m.consumo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Caixa>
        <div className="space-y-[2mm]">
          <Caixa className="overflow-hidden">
            <Faixa className="text-center">Reservado ao Fisco</Faixa>
            <div className="min-h-[12mm] p-[1.5mm] text-[6.5pt] font-bold">
              {d.reservadoFisco ?? ""}
            </div>
          </Caixa>
          <div className="grid grid-cols-3 gap-[1mm]">
            {[
              ["Resolução ANEEL", d.resolucaoAneel ?? "—", AZUL],
              ["Apresentação", dataBr(d.apresentacao), AZUL_CLARO],
              ["Nº do Programa Social", "", AZUL],
            ].map(([t, v, cor]) => (
              <Caixa key={t} className="overflow-hidden">
                <div
                  className="py-[0.8mm] text-center text-[6pt] font-bold text-white"
                  style={{ background: cor }}
                >
                  {t}
                </div>
                <div className="py-[3mm] text-center text-[8pt] font-bold">{v}</div>
              </Caixa>
            ))}
          </div>
        </div>
      </div>

      <div
        className="mt-[2.5mm] rounded-[2mm] border border-dashed p-[1.5mm] text-center text-[6.5pt]"
        style={{ borderColor: BORDA }}
      >
        Documento gerado a partir do XML da NF3e (chave {d.chaveAcesso ?? "—"}). Não substitui a
        fatura original da distribuidora — para pagamento utilize a fatura original (boleto/PIX não
        constam no XML).
      </div>
    </div>
  );
}
