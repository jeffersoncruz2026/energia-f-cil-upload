// Análise de geração distribuída (energia solar) a partir das faturas.
//
// O que a fatura mostra — e o que NÃO mostra:
//  - Energia INJETADA: excedente enviado à rede, lido no medidor bidirecional
//    (grupo gMedida das medições de injeção). Não é a geração total: a parte da
//    geração consumida instantaneamente na própria UC não passa pelo medidor.
//  - Créditos COMPENSADOS: kWh abatidos na fatura (itens de energia injetada/
//    compensada, normalmente com valor negativo), na própria UC geradora ou em
//    UCs beneficiárias (autoconsumo remoto / geração compartilhada).
//  - Saldo, créditos a expirar e expirados, potência instalada e fonte: grupo
//    gSCEE da NF3e, quando a distribuidora o informa.
// Campos ausentes ficam indisponíveis — nada é estimado sem identificação.

import type { ConfigAlertas } from "../tipos";
import type { AlertaGerado } from "./alertas";
import {
  faturaValida,
  ucAtendeFiltros,
  type FaturaAnalise,
  type Filtros,
  type UcAnalise,
} from "./calculos";
import {
  chaveMes,
  diferencaMeses,
  intervaloMeses,
  somarMeses,
  variacaoPercentual,
} from "./periodos";

export const CAMPOS_FATURA_SOLAR = [
  "id",
  "unidade_consumidora_id",
  "periodo_referencia",
  "data_emissao",
  "valor_total",
  "consumo_kwh",
  "dias_faturados",
  "status_documento",
  "status_processamento",
  "excluida",
  "finalidade",
  "numero_documento",
  "energia_injetada_kwh",
  "energia_compensada_kwh",
  "valor_compensacao",
  "gd_compensacao:dados_extraidos_json->compensacao",
  "gd_medicoes:dados_extraidos_json->medicoes",
].join(",");

export type FaturaSolarEntrada = Pick<
  FaturaAnalise,
  | "id"
  | "unidade_consumidora_id"
  | "periodo_referencia"
  | "data_emissao"
  | "valor_total"
  | "consumo_kwh"
  | "dias_faturados"
  | "status_documento"
  | "excluida"
  | "energia_injetada_kwh"
  | "energia_compensada_kwh"
  | "valor_compensacao"
> & {
  gd_compensacao?: unknown;
  gd_medicoes?: unknown;
};

export interface ItemGd {
  fatura_id: string;
  tipo_item: string;
  componente: string | null;
  quantidade: number | null;
  unidade_medida: string | null;
  valor_total: number | null;
}

export const TIPOS_ITEM_GD = ["injecao", "compensacao"];

export interface DadosGd {
  faturaId: string;
  ucId: string;
  mes: string | null; // competência AAAA-MM
  dias: number | null;
  consumoKwh: number | null;
  valorTotal: number;
  /** Excedente injetado na rede (medição). null = não informado na fatura. */
  injetadaKwh: number | null;
  /** kWh abatidos na fatura por créditos de energia. */
  creditosKwh: number | null;
  /** R$ abatidos pelos créditos (valor positivo). */
  economia: number | null;
  saldoAnteriorKwh: number | null;
  saldoAtualKwh: number | null;
  creditosExpirarKwh: number | null;
  competenciaExpirar: string | null; // AAAA-MM
  creditosExpiradosKwh: number | null;
  potenciaKw: number | null;
  fonte: string | null;
  participacao: string | null;
  ucGeradora: string | null;
  energiaAlocadaKwh: number | null;
}

// ---------------------------------------------------------------------------
// Leitura do grupo gSCEE (objeto gerado pelo leitor de XML)
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const comoLista = (v: unknown): Obj[] =>
  (Array.isArray(v) ? v : v == null ? [] : [v]).filter(ehObj);

function texto(o: Obj | undefined, ...nomes: string[]): string | null {
  if (!o) return null;
  for (const n of nomes) {
    let v = o[n];
    if (Array.isArray(v)) v = v[0];
    if (ehObj(v) && v["#text"] != null) v = v["#text"];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function numero(o: Obj | undefined, ...nomes: string[]): number | null {
  const t = texto(o, ...nomes);
  if (t == null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function somaOuNull(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

export const FONTES_ENERGIA: Record<string, string> = {
  "1": "Hidráulica",
  "2": "Solar fotovoltaica",
  "3": "Eólica",
  "4": "Biomassa",
  "5": "Biogás",
  "6": "Híbrida",
};

export const PARTICIPACAO_COMPENSACAO: Record<string, string> = {
  "1": "Geração junto à carga",
  "2": "Autoconsumo remoto",
  "3": "Geração compartilhada",
  "4": "Múltiplas UCs (condomínio)",
};

function competenciaTexto(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-?(\d{2})/.exec(v) ?? null;
  if (m) return `${m[1]}-${m[2]}`;
  const b = /^(\d{2})\/(\d{4})$/.exec(v);
  return b ? `${b[2]}-${b[1]}` : null;
}

export function lerSCEE(raw: unknown) {
  if (!ehObj(raw)) return null;
  const consumidores = comoLista(raw["gConsumidor"]);
  const saldos = comoLista(raw["gSaldoCred"]);
  const tp = texto(raw, "tpPartComp");
  const potencias = consumidores.map((c) => numero(c, "vPotInst"));
  const fontes = [
    ...new Set(consumidores.map((c) => texto(c, "tpFonteEnergia")).filter((x): x is string => !!x)),
  ];
  const expirar = saldos
    .map((s) => competenciaTexto(texto(s, "CompetExpirar")))
    .filter((x): x is string => !!x)
    .sort();
  return {
    participacao: tp ? (PARTICIPACAO_COMPENSACAO[tp] ?? `Tipo ${tp}`) : null,
    potenciaKw: potencias.some((p) => p != null) ? Math.max(...potencias.map((p) => p ?? 0)) : null,
    fonte: fontes.length ? fontes.map((f) => FONTES_ENERGIA[f] ?? `Fonte ${f}`).join(", ") : null,
    ucGeradora:
      consumidores.map((c) => texto(c, "idAcessGer", "idAccGer", "idAcesso")).find(Boolean) ?? null,
    energiaAlocadaKwh: somaOuNull(consumidores.map((c) => numero(c, "enerAloc"))),
    saldoAnteriorKwh: somaOuNull(saldos.map((s) => numero(s, "vSaldAnt"))),
    saldoAtualKwh: somaOuNull(saldos.map((s) => numero(s, "vSaldAtual"))),
    creditosExpiradosKwh: somaOuNull(saldos.map((s) => numero(s, "vCredExpirado"))),
    creditosExpirarKwh: somaOuNull(saldos.map((s) => numero(s, "vCredExpirar"))),
    competenciaExpirar: expirar[0] ?? null,
  };
}

function injetadaMedida(raw: unknown): number | null {
  const medicoes = comoLista(raw);
  const injecao = medicoes.filter(
    (m) =>
      m["unidade"] === "kWh" &&
      typeof m["valor"] === "number" &&
      (m["injecao"] === true || m["tpGrMed"] === "04" || m["tpGrMed"] === "4"),
  );
  return injecao.length ? injecao.reduce((s, m) => s + Math.abs(m["valor"] as number), 0) : null;
}

/** kWh dos itens de crédito sem somar duas vezes a mesma energia em TUSD e TE. */
function creditosDosItens(itens: ItemGd[]): { kwh: number | null; valor: number | null } {
  const energia = itens
    .filter(
      (i) => i.quantidade != null && (i.unidade_medida === "kWh" || i.unidade_medida === "MWh"),
    )
    .map((i) => ({
      ...i,
      q: Math.abs(i.quantidade!) * (i.unidade_medida === "MWh" ? 1000 : 1),
    }));
  const soma = (l: typeof energia) => l.reduce((s, i) => s + i.q, 0);
  const tusd = energia.filter((i) => i.componente === "TUSD");
  const te = energia.filter((i) => i.componente === "TE");
  const outros = energia.filter((i) => i.componente !== "TUSD" && i.componente !== "TE");
  const kwh = energia.length
    ? (tusd.length && te.length ? Math.max(soma(tusd), soma(te)) : soma(tusd) + soma(te)) +
      soma(outros)
    : null;
  const valores = itens.map((i) => i.valor_total).filter((v): v is number => v != null);
  const valor = valores.length ? Math.abs(valores.reduce((a, b) => a + b, 0)) : null;
  return { kwh, valor };
}

const arred = (v: number | null, c = 3) => (v == null ? null : Math.round(v * 10 ** c) / 10 ** c);

/** Dados de GD de uma fatura; null quando a fatura não tem nenhum sinal de GD. */
export function extrairGd(f: FaturaSolarEntrada, itens: ItemGd[]): DadosGd | null {
  if (!f.unidade_consumidora_id) return null;
  const scee = lerSCEE(f.gd_compensacao);
  const itensCredito = creditosDosItens(itens);
  const injetada = injetadaMedida(f.gd_medicoes);
  const creditosKwh =
    itensCredito.kwh ??
    (f.energia_compensada_kwh != null ? Math.abs(f.energia_compensada_kwh) : null);
  const economia =
    itensCredito.valor ?? (f.valor_compensacao != null ? Math.abs(f.valor_compensacao) : null);
  const temGd =
    !!scee ||
    (injetada ?? 0) > 0 ||
    (creditosKwh ?? 0) > 0 ||
    (economia ?? 0) > 0 ||
    (f.energia_injetada_kwh ?? 0) > 0;
  if (!temGd) return null;
  return {
    faturaId: f.id,
    ucId: f.unidade_consumidora_id,
    mes: chaveMes(f.periodo_referencia),
    dias: f.dias_faturados,
    consumoKwh: f.consumo_kwh,
    valorTotal: f.valor_total ?? 0,
    injetadaKwh: arred(injetada),
    creditosKwh: arred(creditosKwh),
    economia: arred(economia, 2),
    saldoAnteriorKwh: arred(scee?.saldoAnteriorKwh ?? null),
    saldoAtualKwh: arred(scee?.saldoAtualKwh ?? null),
    creditosExpirarKwh: arred(scee?.creditosExpirarKwh ?? null),
    competenciaExpirar: scee?.competenciaExpirar ?? null,
    creditosExpiradosKwh: arred(scee?.creditosExpiradosKwh ?? null),
    potenciaKw: scee?.potenciaKw ?? null,
    fonte: scee?.fonte ?? null,
    participacao: scee?.participacao ?? null,
    ucGeradora: scee?.ucGeradora ?? null,
    energiaAlocadaKwh: arred(scee?.energiaAlocadaKwh ?? null),
  };
}

/** Monta os dados de GD de todas as faturas válidas. */
export function montarDadosGd(faturas: FaturaSolarEntrada[], itens: ItemGd[]): DadosGd[] {
  const porFatura = new Map<string, ItemGd[]>();
  for (const i of itens) {
    if (!TIPOS_ITEM_GD.includes(i.tipo_item)) continue;
    const l = porFatura.get(i.fatura_id);
    if (l) l.push(i);
    else porFatura.set(i.fatura_id, [i]);
  }
  return faturas
    .filter((f) => faturaValida(f))
    .map((f) => extrairGd(f, porFatura.get(f.id) ?? []))
    .filter((d): d is DadosGd => d != null);
}

// ---------------------------------------------------------------------------
// Consolidação
// ---------------------------------------------------------------------------

export interface MesSolar {
  mes: string;
  injetadaKwh: number;
  creditosKwh: number;
  consumoKwh: number;
  economia: number;
  custo: number;
  custoSemCreditos: number;
  saldoKwh: number | null;
}

export interface ResumoUcSolar {
  ucId: string;
  papel: "Geradora" | "Beneficiária" | "Geradora e consumidora de créditos";
  participacao: string | null;
  fonte: string | null;
  potenciaKw: number | null;
  ucGeradora: string | null;
  injetadaKwh: number | null;
  creditosKwh: number | null;
  consumoKwh: number | null;
  economia: number | null;
  custo: number;
  percentualCompensado: number | null;
  injecaoPorKwpMes: number | null;
  saldoAtualKwh: number | null;
  creditosExpirarKwh: number | null;
  competenciaExpirar: string | null;
  creditosExpiradosKwh: number | null;
  meses: number;
  ultimoMes: string | null;
}

export interface IndicadoresSolar {
  ucsComGd: number;
  ucsGeradoras: number;
  injetadaKwh: number | null;
  creditosKwh: number | null;
  economia: number | null;
  custo: number;
  custoSemCreditos: number;
  percentualCompensado: number | null;
  valorMedioKwhCompensado: number | null;
  saldoAtualKwh: number | null;
  creditosExpirarKwh: number | null;
  competenciaExpirar: string | null;
  creditosExpiradosKwh: number | null;
  potenciaKw: number | null;
}

const somaCampo = (l: DadosGd[], k: keyof DadosGd) =>
  somaOuNull(l.map((d) => d[k] as number | null));

export function filtrarDadosGd(
  dados: DadosGd[],
  ucsPorId: Map<string, UcAnalise>,
  filtros: Filtros,
): DadosGd[] {
  return dados.filter((d) => {
    const uc = ucsPorId.get(d.ucId);
    if (!uc || !ucAtendeFiltros(uc, filtros)) return false;
    if (filtros.inicio && (!d.mes || d.mes < filtros.inicio)) return false;
    if (filtros.fim && (!d.mes || d.mes > filtros.fim)) return false;
    return true;
  });
}

/** Último valor informado por UC (saldo é posição, não se soma no tempo). */
function ultimoPorUc(dados: DadosGd[], campo: keyof DadosGd) {
  const ultimo = new Map<string, DadosGd>();
  for (const d of dados) {
    if (d[campo] == null || !d.mes) continue;
    const atual = ultimo.get(d.ucId);
    if (!atual || (atual.mes ?? "") < d.mes) ultimo.set(d.ucId, d);
  }
  return [...ultimo.values()];
}

export function resumirPorUc(dados: DadosGd[]): ResumoUcSolar[] {
  const porUc = new Map<string, DadosGd[]>();
  for (const d of dados) {
    const l = porUc.get(d.ucId);
    if (l) l.push(d);
    else porUc.set(d.ucId, [d]);
  }
  return [...porUc.entries()]
    .map(([ucId, l]) => {
      const injetada = somaCampo(l, "injetadaKwh");
      const creditos = somaCampo(l, "creditosKwh");
      const comAmbos = l.filter((d) => d.creditosKwh != null && (d.consumoKwh ?? 0) > 0);
      const consumoBase = comAmbos.reduce((s, d) => s + (d.consumoKwh ?? 0), 0);
      const ultimoSaldo = ultimoPorUc(l, "saldoAtualKwh")[0];
      const ultimoExpirar = ultimoPorUc(l, "creditosExpirarKwh")[0];
      const potencia = l.map((d) => d.potenciaKw).find((p) => p != null) ?? null;
      const mesesInjecao = l.filter((d) => d.injetadaKwh != null).length;
      const meses = [...new Set(l.map((d) => d.mes).filter(Boolean))].sort();
      const gera = (injetada ?? 0) > 0;
      const usa = (creditos ?? 0) > 0;
      return {
        ucId,
        papel:
          gera && usa ? "Geradora e consumidora de créditos" : gera ? "Geradora" : "Beneficiária",
        participacao: l.map((d) => d.participacao).find(Boolean) ?? null,
        fonte: l.map((d) => d.fonte).find(Boolean) ?? null,
        potenciaKw: potencia,
        ucGeradora: l.map((d) => d.ucGeradora).find(Boolean) ?? null,
        injetadaKwh: injetada,
        creditosKwh: creditos,
        consumoKwh: somaCampo(l, "consumoKwh"),
        economia: somaCampo(l, "economia"),
        custo: l.reduce((s, d) => s + d.valorTotal, 0),
        percentualCompensado:
          consumoBase > 0
            ? (comAmbos.reduce((s, d) => s + (d.creditosKwh ?? 0), 0) / consumoBase) * 100
            : null,
        injecaoPorKwpMes:
          potencia && injetada != null && mesesInjecao ? injetada / potencia / mesesInjecao : null,
        saldoAtualKwh: ultimoSaldo?.saldoAtualKwh ?? null,
        creditosExpirarKwh: ultimoExpirar?.creditosExpirarKwh ?? null,
        competenciaExpirar: ultimoExpirar?.competenciaExpirar ?? null,
        creditosExpiradosKwh: somaCampo(l, "creditosExpiradosKwh"),
        meses: meses.length,
        ultimoMes: meses[meses.length - 1] ?? null,
      } satisfies ResumoUcSolar;
    })
    .sort((a, b) => (b.economia ?? 0) - (a.economia ?? 0));
}

export function calcularIndicadoresSolar(dados: DadosGd[]): IndicadoresSolar {
  const resumo = resumirPorUc(dados);
  const comAmbos = dados.filter((d) => d.creditosKwh != null && (d.consumoKwh ?? 0) > 0);
  const consumoBase = comAmbos.reduce((s, d) => s + (d.consumoKwh ?? 0), 0);
  const comValor = dados.filter((d) => (d.creditosKwh ?? 0) > 0 && d.economia != null);
  const kwhValor = comValor.reduce((s, d) => s + (d.creditosKwh ?? 0), 0);
  const economia = somaCampo(dados, "economia");
  const custo = dados.reduce((s, d) => s + d.valorTotal, 0);
  const expirar = resumo
    .map((r) => r.competenciaExpirar)
    .filter((x): x is string => !!x)
    .sort();
  // A potência informada é a da usina geradora: UCs beneficiárias repetem o mesmo valor,
  // por isso cada geradora é contada uma única vez.
  const potenciaPorGeradora = new Map<string, number>();
  for (const r of resumo) {
    if (r.potenciaKw != null) potenciaPorGeradora.set(r.ucGeradora ?? r.ucId, r.potenciaKw);
  }
  const potencias = [...potenciaPorGeradora.values()];
  return {
    ucsComGd: resumo.length,
    ucsGeradoras: resumo.filter((r) => (r.injetadaKwh ?? 0) > 0).length,
    injetadaKwh: somaCampo(dados, "injetadaKwh"),
    creditosKwh: somaCampo(dados, "creditosKwh"),
    economia,
    custo,
    custoSemCreditos: custo + (economia ?? 0),
    percentualCompensado:
      consumoBase > 0
        ? (comAmbos.reduce((s, d) => s + (d.creditosKwh ?? 0), 0) / consumoBase) * 100
        : null,
    valorMedioKwhCompensado:
      kwhValor > 0 ? comValor.reduce((s, d) => s + (d.economia ?? 0), 0) / kwhValor : null,
    saldoAtualKwh: somaOuNull(resumo.map((r) => r.saldoAtualKwh)),
    creditosExpirarKwh: somaOuNull(resumo.map((r) => r.creditosExpirarKwh)),
    competenciaExpirar: expirar[0] ?? null,
    creditosExpiradosKwh: somaOuNull(resumo.map((r) => r.creditosExpiradosKwh)),
    potenciaKw: potencias.length ? potencias.reduce((a, b) => a + b, 0) : null,
  };
}

export function serieMensalSolar(
  dados: DadosGd[],
  intervalo?: { inicio: string; fim: string } | null,
): MesSolar[] {
  const meses = [...new Set(dados.map((d) => d.mes).filter((m): m is string => !!m))].sort();
  if (!meses.length) return [];
  const lista = intervalo
    ? intervaloMeses(intervalo.inicio, intervalo.fim)
    : intervaloMeses(meses[0]!, meses[meses.length - 1]!);
  return lista.map((mes) => {
    const l = dados.filter((d) => d.mes === mes);
    const economia = l.reduce((s, d) => s + (d.economia ?? 0), 0);
    const custo = l.reduce((s, d) => s + d.valorTotal, 0);
    const saldos = l.map((d) => d.saldoAtualKwh).filter((v): v is number => v != null);
    return {
      mes,
      injetadaKwh: l.reduce((s, d) => s + (d.injetadaKwh ?? 0), 0),
      creditosKwh: l.reduce((s, d) => s + (d.creditosKwh ?? 0), 0),
      consumoKwh: l.reduce((s, d) => s + (d.consumoKwh ?? 0), 0),
      economia: Math.round(economia * 100) / 100,
      custo: Math.round(custo * 100) / 100,
      custoSemCreditos: Math.round((custo + economia) * 100) / 100,
      saldoKwh: saldos.length ? saldos.reduce((a, b) => a + b, 0) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Alertas de energia solar
// ---------------------------------------------------------------------------

const fmtKwh = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh`;
const fmtMes = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;

export function gerarAlertasSolar(
  dados: DadosGd[],
  ucs: UcAnalise[],
  cfg: ConfigAlertas,
  opcoes: { mesesAnalisados?: number } = {},
): AlertaGerado[] {
  const alertas: AlertaGerado[] = [];
  const ucsIds = new Set(ucs.map((u) => u.id));
  const porUc = new Map<string, Map<string, DadosGd>>();
  let ultimoMes: string | null = null;
  for (const d of dados) {
    if (!d.mes || !ucsIds.has(d.ucId)) continue;
    let m = porUc.get(d.ucId);
    if (!m) porUc.set(d.ucId, (m = new Map()));
    const atual = m.get(d.mes);
    // Mais de um documento no mês: soma injeção e créditos; posição de saldo é a maior
    m.set(
      d.mes,
      atual
        ? {
            ...atual,
            injetadaKwh: somaOuNull([atual.injetadaKwh, d.injetadaKwh]),
            creditosKwh: somaOuNull([atual.creditosKwh, d.creditosKwh]),
            creditosExpiradosKwh: somaOuNull([atual.creditosExpiradosKwh, d.creditosExpiradosKwh]),
          }
        : d,
    );
    if (!ultimoMes || d.mes > ultimoMes) ultimoMes = d.mes;
  }
  if (!ultimoMes) return [];
  const primeiro = somarMeses(ultimoMes, -((opcoes.mesesAnalisados ?? 24) - 1));
  const limiteQueda = cfg.solar_queda_injecao_pct;

  const add = (a: Omit<AlertaGerado, "chave_unica" | "periodo"> & { mes: string }) => {
    if (a.mes < primeiro) return;
    const { mes, ...resto } = a;
    alertas.push({
      ...resto,
      periodo: `${mes}-01`,
      chave_unica: `${a.tipo_alerta}|${a.unidade_consumidora_id}|${mes}`,
    });
  };

  for (const [ucId, meses] of porUc) {
    const ordenados = [...meses.keys()].sort();
    const diaria = (d: DadosGd) =>
      d.injetadaKwh == null
        ? null
        : cfg.considerar_dias_faturados && d.dias
          ? d.injetadaKwh / d.dias
          : d.injetadaKwh;
    const quedas = new Set<string>();

    for (const mes of ordenados) {
      const d = meses.get(mes)!;

      // Queda ou interrupção da injeção (possível falha, sujeira, sombreamento, desligamento)
      if (d.injetadaKwh != null) {
        const hist = ordenados
          .filter((m) => m < mes && diferencaMeses(m, mes) <= 12)
          .map((m) => meses.get(m)!)
          .filter((h) => (h.injetadaKwh ?? 0) > 0);
        if (hist.length >= cfg.historico_minimo_meses) {
          const atual = diaria(d)!;
          const media = hist.reduce((s, h) => s + (diaria(h) ?? 0), 0) / hist.length;
          const v = variacaoPercentual(atual, media);
          if (v != null && v < -limiteQueda) {
            quedas.add(mes);
            const anoAnt = meses.get(somarMeses(mes, -12));
            const vAno =
              anoAnt && (anoAnt.injetadaKwh ?? 0) > 0
                ? variacaoPercentual(atual, diaria(anoAnt))
                : null;
            const sazonal = cfg.considerar_sazonalidade && vAno != null && vAno >= -limiteQueda;
            const zerada = d.injetadaKwh === 0;
            const consecutiva = quedas.has(somarMeses(mes, -1));
            add({
              mes,
              unidade_consumidora_id: ucId,
              fatura_id: d.faturaId,
              tipo_alerta: "queda_injecao_solar",
              classificacao: (zerada || consecutiva) && !sazonal ? "confirmado" : "possivel",
              indicador:
                cfg.considerar_dias_faturados && d.dias
                  ? "Injeção média diária"
                  : "Energia injetada",
              valor_atual: atual,
              valor_comparacao: media,
              variacao_percentual: v,
              descricao: `${zerada ? "Sem energia injetada" : `Energia injetada de ${fmtKwh(d.injetadaKwh)}`} em ${fmtMes(
                mes,
              )}, ${fmtPct(v)} em relação à média dos últimos ${hist.length} meses${
                cfg.considerar_dias_faturados && d.dias ? " (por dia faturado)" : ""
              }.${
                sazonal
                  ? ` No mesmo mês do ano anterior a variação foi de ${fmtPct(vAno!)}, o que sugere efeito sazonal (menor irradiação).`
                  : consecutiva
                    ? " A queda se repete pelo segundo mês seguido."
                    : ""
              } Verificar inversor, disjuntores, sujeira ou sombreamento dos módulos e aumento do consumo instantâneo da UC.`,
            });
          }
        }
      }

      if ((d.creditosExpiradosKwh ?? 0) > 0) {
        add({
          mes,
          unidade_consumidora_id: ucId,
          fatura_id: d.faturaId,
          tipo_alerta: "creditos_expirados",
          classificacao: "confirmado",
          indicador: "Créditos expirados",
          valor_atual: d.creditosExpiradosKwh,
          valor_comparacao: null,
          variacao_percentual: null,
          descricao: `${fmtKwh(d.creditosExpiradosKwh!)} de créditos de energia expiraram em ${fmtMes(
            mes,
          )} sem utilização (perda definitiva). Avaliar realocar créditos para outras UCs do mesmo titular.`,
        });
      }
    }

    // Situação atual dos créditos (último documento com essas informações)
    const ultimo = ordenados.map((m) => meses.get(m)!).reverse();
    const comExpirar = ultimo.find((d) => d.creditosExpirarKwh != null);
    if (comExpirar && (comExpirar.creditosExpirarKwh ?? 0) > 0 && comExpirar.mes) {
      add({
        mes: comExpirar.mes,
        unidade_consumidora_id: ucId,
        fatura_id: comExpirar.faturaId,
        tipo_alerta: "creditos_a_expirar",
        classificacao: "possivel",
        indicador: "Créditos a expirar",
        valor_atual: comExpirar.creditosExpirarKwh,
        valor_comparacao: comExpirar.saldoAtualKwh,
        variacao_percentual: null,
        descricao: `${fmtKwh(comExpirar.creditosExpirarKwh!)} de créditos vencem${
          comExpirar.competenciaExpirar
            ? ` na competência ${fmtMes(comExpirar.competenciaExpirar)}`
            : " em breve"
        }. Planejar o uso ou a realocação para não perder os créditos.`,
      });
    }
    const comSaldo = ultimo.find((d) => d.saldoAtualKwh != null);
    if (comSaldo && comSaldo.mes && (comSaldo.saldoAtualKwh ?? 0) > 0) {
      const uso = ultimo
        .slice(0, 12)
        .map((d) => d.creditosKwh ?? d.consumoKwh)
        .filter((v): v is number => v != null && v > 0);
      const media = uso.length ? uso.reduce((a, b) => a + b, 0) / uso.length : null;
      if (media && comSaldo.saldoAtualKwh! > media * cfg.solar_meses_saldo_excessivo) {
        add({
          mes: comSaldo.mes,
          unidade_consumidora_id: ucId,
          fatura_id: comSaldo.faturaId,
          tipo_alerta: "saldo_creditos_elevado",
          classificacao: "possivel",
          indicador: "Saldo de créditos",
          valor_atual: comSaldo.saldoAtualKwh,
          valor_comparacao: media,
          variacao_percentual: null,
          descricao: `Saldo de ${fmtKwh(comSaldo.saldoAtualKwh!)} em créditos, equivalente a ${(
            comSaldo.saldoAtualKwh! / media
          )
            .toFixed(1)
            .replace(
              ".",
              ",",
            )} meses de uso médio. Créditos expiram em 60 meses: avaliar realocação para outras UCs ou o dimensionamento do sistema.`,
        });
      }
    }
  }
  return alertas;
}
