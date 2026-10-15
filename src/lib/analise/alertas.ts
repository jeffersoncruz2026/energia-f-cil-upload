// Regras de identificação de situações que merecem atenção.
//
// Princípios:
//  - Comparações por competência (mês de referência) de cada UC.
//  - Quando há dias faturados nos dois períodos, consumo e custo são comparados por
//    média diária, evitando falsos alertas por ciclos de leitura de durações diferentes.
//  - "Alerta confirmado": o desvio aparece em duas referências independentes (ex.:
//    mês anterior E mesmo mês do ano anterior/média histórica).
//  - "Possível anomalia": o desvio aparece em apenas uma referência, ou o histórico
//    é insuficiente, ou a variação é compatível com a sazonalidade.
//  - As descrições nunca afirmam desperdício: indicam o que variou e o que verificar.

import type { ConfigAlertas } from "../tipos";
import {
  custoDaFatura,
  faturaValida,
  type BaseCusto,
  type FaturaAnalise,
  type UcAnalise,
} from "./calculos";
import { chaveMes, diferencaMeses, somarMeses, variacaoPercentual } from "./periodos";

export interface AlertaGerado {
  chave_unica: string;
  unidade_consumidora_id: string;
  fatura_id: string | null;
  tipo_alerta: TipoAlerta;
  classificacao: "confirmado" | "possivel";
  indicador: string;
  periodo: string; // AAAA-MM-01
  valor_atual: number | null;
  valor_comparacao: number | null;
  variacao_percentual: number | null;
  descricao: string;
}

export type TipoAlerta =
  | "aumento_consumo"
  | "aumento_custo"
  | "custo_kwh_elevado"
  | "ausencia_fatura"
  | "possivel_duplicidade"
  | "consumo_zerado_negativo"
  | "variacao_componente"
  | "custo_acima_semelhantes"
  | "queda_injecao_solar"
  | "creditos_expirados"
  | "creditos_a_expirar"
  | "saldo_creditos_elevado";

export const ROTULOS_TIPO_ALERTA: Record<TipoAlerta, string> = {
  aumento_consumo: "Aumento de consumo",
  aumento_custo: "Aumento de custo",
  custo_kwh_elevado: "Custo por kWh acima do histórico",
  ausencia_fatura: "Ausência de fatura",
  possivel_duplicidade: "Possível fatura duplicada",
  consumo_zerado_negativo: "Consumo zerado/negativo",
  variacao_componente: "Variação de componente tarifário",
  custo_acima_semelhantes: "Custo acima de UCs semelhantes",
  queda_injecao_solar: "Solar: queda na energia injetada",
  creditos_expirados: "Solar: créditos expirados",
  creditos_a_expirar: "Solar: créditos a expirar",
  saldo_creditos_elevado: "Solar: saldo de créditos elevado",
};

interface Mes {
  mes: string;
  custo: number;
  consumo: number | null;
  dias: number | null;
  faturaPrincipal: FaturaAnalise;
  faturas: FaturaAnalise[];
  componentes: Record<string, number | null>;
}

const COMPONENTES_MONITORADOS: { campo: keyof FaturaAnalise; rotulo: string }[] = [
  { campo: "valor_tusd", rotulo: "TUSD" },
  { campo: "valor_te", rotulo: "TE" },
  { campo: "valor_icms", rotulo: "ICMS" },
  { campo: "valor_cip", rotulo: "CIP/COSIP" },
  { campo: "valor_bandeira", rotulo: "Bandeira tarifária" },
  { campo: "valor_demanda", rotulo: "Demanda" },
  { campo: "valor_reativo", rotulo: "Energia reativa" },
  { campo: "valor_multas", rotulo: "Multas" },
  { campo: "valor_juros", rotulo: "Juros" },
];

const PROPORCIONAIS_AO_CONSUMO = new Set<keyof FaturaAnalise>([
  "valor_tusd",
  "valor_te",
  "valor_icms",
]);

const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
const fmtMes = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const fmtBrl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtKwh = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh`;

function agruparPorMes(faturas: FaturaAnalise[], base: BaseCusto): Map<string, Mes> {
  const meses = new Map<string, Mes>();
  for (const f of faturas) {
    const mes = chaveMes(f.periodo_referencia);
    if (!mes) continue;
    let m = meses.get(mes);
    if (!m) {
      m = {
        mes,
        custo: 0,
        consumo: null,
        dias: null,
        faturaPrincipal: f,
        faturas: [],
        componentes: {},
      };
      meses.set(mes, m);
    }
    m.faturas.push(f);
    m.custo += custoDaFatura(f, base) ?? 0;
    if (f.consumo_kwh != null) m.consumo = (m.consumo ?? 0) + f.consumo_kwh;
    if (f.dias_faturados != null) m.dias = Math.max(m.dias ?? 0, f.dias_faturados);
    if ((custoDaFatura(f, base) ?? 0) > (custoDaFatura(m.faturaPrincipal, base) ?? 0)) {
      m.faturaPrincipal = f;
    }
    for (const c of COMPONENTES_MONITORADOS) {
      const v = f[c.campo];
      if (typeof v === "number") m.componentes[c.campo] = (m.componentes[c.campo] ?? 0) + v;
      else if (!(c.campo in m.componentes)) m.componentes[c.campo] = null;
    }
  }
  return meses;
}

/** Valor normalizado por dia quando ambos os períodos têm dias faturados. */
function normalizar(
  atual: number,
  anterior: number,
  diasAtual: number | null,
  diasAnterior: number | null,
  usarDias: boolean,
): { atual: number; anterior: number; porDia: boolean } {
  if (usarDias && diasAtual && diasAnterior && diasAtual > 0 && diasAnterior > 0) {
    return { atual: atual / diasAtual, anterior: anterior / diasAnterior, porDia: true };
  }
  return { atual, anterior, porDia: false };
}

function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const s = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio]! : (s[meio - 1]! + s[meio]!) / 2;
}

export function gerarAlertas(
  faturasEntrada: FaturaAnalise[],
  ucs: UcAnalise[],
  cfg: ConfigAlertas,
  opcoes: { mesesAnalisados?: number; baseCusto?: BaseCusto } = {},
): AlertaGerado[] {
  const alertas: AlertaGerado[] = [];
  const base = opcoes.baseCusto ?? "energia";
  const faturas = faturasEntrada.filter(faturaValida);
  const ucsPorId = new Map(ucs.map((u) => [u.id, u]));
  const porUc = new Map<string, FaturaAnalise[]>();
  let ultimoMesGlobal: string | null = null;
  for (const f of faturas) {
    const lista = porUc.get(f.unidade_consumidora_id!);
    if (lista) lista.push(f);
    else porUc.set(f.unidade_consumidora_id!, [f]);
    const m = chaveMes(f.periodo_referencia);
    if (m && (!ultimoMesGlobal || m > ultimoMesGlobal)) ultimoMesGlobal = m;
  }
  if (!ultimoMesGlobal) return [];
  const primeiroMesAnalisado = somarMeses(ultimoMesGlobal, -((opcoes.mesesAnalisados ?? 24) - 1));

  const add = (
    a: Omit<AlertaGerado, "chave_unica" | "periodo"> & { mes: string; sufixo?: string },
  ) => {
    if (a.mes < primeiroMesAnalisado) return;
    const { mes, sufixo, ...resto } = a;
    alertas.push({
      ...resto,
      periodo: `${mes}-01`,
      chave_unica: [a.tipo_alerta, a.unidade_consumidora_id, mes, sufixo].filter(Boolean).join("|"),
    });
  };

  const mesesPorUc = new Map<string, Map<string, Mes>>();

  for (const [ucId, lista] of porUc) {
    const uc = ucsPorId.get(ucId);
    if (!uc) continue;
    const meses = agruparPorMes(lista, base);
    mesesPorUc.set(ucId, meses);
    const ordenados = [...meses.keys()].sort();

    // Duplicidade e consumo zerado/negativo (por fatura)
    for (const m of meses.values()) {
      const normais = m.faturas.filter(
        (f) => f.finalidade !== "ajuste" && f.finalidade !== "complementar",
      );
      for (let i = 0; i < normais.length; i++) {
        for (let j = i + 1; j < normais.length; j++) {
          const a = normais[i]!;
          const b = normais[j]!;
          if (a.valor_total === b.valor_total) {
            add({
              mes: m.mes,
              sufixo: [a.id, b.id].sort().join("+"),
              unidade_consumidora_id: ucId,
              fatura_id: b.id,
              tipo_alerta: "possivel_duplicidade",
              classificacao: a.consumo_kwh === b.consumo_kwh ? "confirmado" : "possivel",
              indicador: "Valor total",
              valor_atual: b.valor_total,
              valor_comparacao: a.valor_total,
              variacao_percentual: 0,
              descricao: `Há dois documentos fiscais distintos (nº ${a.numero_documento ?? "?"} e nº ${
                b.numero_documento ?? "?"
              }) para a mesma UC e competência ${fmtMes(m.mes)} com o mesmo valor (${fmtBrl(
                b.valor_total ?? 0,
              )}). Verifique se não se trata de segunda via ou cobrança em duplicidade.`,
            });
          }
        }
        const f = normais[i]!;
        const custoF = custoDaFatura(f, base) ?? 0;
        if (f.consumo_kwh != null && f.consumo_kwh <= 0 && custoF > 0) {
          add({
            mes: m.mes,
            sufixo: f.id,
            unidade_consumidora_id: ucId,
            fatura_id: f.id,
            tipo_alerta: "consumo_zerado_negativo",
            classificacao: f.consumo_kwh < 0 ? "confirmado" : "possivel",
            indicador: "Consumo (kWh)",
            valor_atual: f.consumo_kwh,
            valor_comparacao: null,
            variacao_percentual: null,
            descricao:
              f.consumo_kwh < 0
                ? `Consumo negativo (${fmtKwh(f.consumo_kwh)}) na competência ${fmtMes(m.mes)}. Requer validação da leitura/compensação.`
                : `Consumo zerado com ${base === "energia" ? "custo da energia" : "valor faturado"} de ${fmtBrl(custoF)} na competência ${fmtMes(
                    m.mes,
                  )}. Pode indicar custo de disponibilidade, compensação integral por geração própria ou leitura não realizada — validar.`,
          });
        }
      }
    }

    // Comparações mês a mês
    for (const mes of ordenados) {
      const atual = meses.get(mes)!;
      const ant = meses.get(somarMeses(mes, -1));
      const anoAnt = meses.get(somarMeses(mes, -12));
      const historico = ordenados
        .filter((m) => m < mes && diferencaMeses(m, mes) <= 12)
        .map((m) => meses.get(m)!);
      const historicoSuficiente = historico.length >= cfg.historico_minimo_meses;

      const avaliar = (
        tipo: "aumento_consumo" | "aumento_custo",
        valorAtual: number | null,
        valorAnt: number | null,
        valorAnoAnt: number | null,
        valoresHist: number[],
        limite: number,
        rotulo: string,
        fmt: (v: number) => string,
      ) => {
        if (valorAtual == null || valorAnt == null || valorAnt <= 0 || valorAtual <= 0) return;
        const n = normalizar(
          valorAtual,
          valorAnt,
          atual.dias,
          ant!.dias,
          cfg.considerar_dias_faturados,
        );
        const varMes = variacaoPercentual(n.atual, n.anterior);
        if (varMes == null || varMes <= limite) return;

        let classificacao: "confirmado" | "possivel" = "possivel";
        let complemento = "";
        if (cfg.considerar_sazonalidade && valorAnoAnt != null && valorAnoAnt > 0) {
          const ny = normalizar(
            valorAtual,
            valorAnoAnt,
            atual.dias,
            anoAnt!.dias,
            cfg.considerar_dias_faturados,
          );
          const varAno = variacaoPercentual(ny.atual, ny.anterior)!;
          if (varAno > limite) {
            classificacao = "confirmado";
            complemento = ` Também está ${fmtPct(varAno)} acima do mesmo mês do ano anterior.`;
          } else {
            complemento = ` Em relação ao mesmo mês do ano anterior a variação é de ${fmtPct(
              varAno,
            )}, o que sugere efeito sazonal.`;
          }
        } else if (historicoSuficiente) {
          const mediaHist = media(valoresHist);
          const varHist = variacaoPercentual(valorAtual, mediaHist);
          if (varHist != null && varHist > limite) {
            classificacao = "confirmado";
            complemento = ` Também está ${fmtPct(varHist)} acima da média dos últimos ${valoresHist.length} meses.`;
          } else if (varHist != null) {
            complemento = ` Em relação à média dos últimos ${valoresHist.length} meses a variação é de ${fmtPct(varHist)}.`;
          }
        } else {
          complemento = " Histórico insuficiente para confirmar a tendência.";
        }
        add({
          mes,
          unidade_consumidora_id: ucId,
          fatura_id: atual.faturaPrincipal.id,
          tipo_alerta: tipo,
          classificacao,
          indicador: n.porDia ? `${rotulo} médio diário` : rotulo,
          valor_atual: n.atual,
          valor_comparacao: n.anterior,
          variacao_percentual: varMes,
          descricao: `${rotulo} de ${fmt(valorAtual)} em ${fmtMes(mes)}, ${fmtPct(varMes)} em relação ao mês anterior (${fmt(
            valorAnt,
          )})${n.porDia ? `, comparando a média diária (${atual.dias} × ${ant!.dias} dias faturados)` : ""}.${complemento} Verificar alterações de operação, leitura estimada, tarifa ou período faturado.`,
        });
      };

      if (ant) {
        avaliar(
          "aumento_consumo",
          atual.consumo,
          ant.consumo,
          anoAnt?.consumo ?? null,
          historico.map((h) => h.consumo).filter((v): v is number => v != null && v > 0),
          cfg.consumo_aumento_pct,
          "Consumo",
          fmtKwh,
        );
        avaliar(
          "aumento_custo",
          atual.custo,
          ant.custo,
          anoAnt?.custo ?? null,
          historico.map((h) => h.custo).filter((v) => v > 0),
          cfg.custo_aumento_pct,
          base === "energia" ? "Custo da energia" : "Valor faturado",
          fmtBrl,
        );

        // Componentes tarifários
        for (const c of COMPONENTES_MONITORADOS) {
          const va = atual.componentes[c.campo];
          const vp = ant.componentes[c.campo];
          if (va == null) continue;
          const diferenca = va - (vp ?? 0);
          if (diferenca < cfg.componente_variacao_valor_min) continue;
          const v = vp != null && vp > 0 ? variacaoPercentual(va, vp) : null;
          if (v != null && v <= cfg.componente_variacao_pct) continue;
          // Componentes proporcionais ao consumo (TUSD, TE, ICMS) que apenas acompanham a
          // variação do custo total não geram alerta próprio (já coberto pelo alerta de custo).
          const varCusto = variacaoPercentual(atual.custo, ant.custo);
          if (
            v != null &&
            varCusto != null &&
            PROPORCIONAIS_AO_CONSUMO.has(c.campo) &&
            v - varCusto <= cfg.componente_variacao_pct
          ) {
            continue;
          }
          add({
            mes,
            sufixo: String(c.campo),
            unidade_consumidora_id: ucId,
            fatura_id: atual.faturaPrincipal.id,
            tipo_alerta: "variacao_componente",
            classificacao: "possivel",
            indicador: c.rotulo,
            valor_atual: va,
            valor_comparacao: vp ?? null,
            variacao_percentual: v,
            descricao:
              v == null
                ? `${c.rotulo}: cobrança de ${fmtBrl(va)} em ${fmtMes(mes)} sem valor correspondente no mês anterior.`
                : `${c.rotulo}: ${fmtBrl(va)} em ${fmtMes(mes)}, ${fmtPct(v)} em relação ao mês anterior (${fmtBrl(vp!)}).`,
          });
        }
      }

      // Custo por kWh acima do histórico da própria UC
      if (atual.consumo != null && atual.consumo > 0 && historicoSuficiente) {
        const hist = historico.filter((h) => h.consumo != null && h.consumo > 0);
        if (hist.length >= cfg.historico_minimo_meses) {
          const custoKwh = atual.custo / atual.consumo;
          const mediaKwh =
            hist.reduce((s, h) => s + h.custo, 0) / hist.reduce((s, h) => s + (h.consumo ?? 0), 0);
          const v = variacaoPercentual(custoKwh, mediaKwh);
          if (v != null && v > cfg.custo_kwh_acima_historico_pct) {
            const antKwh = ant && ant.consumo && ant.consumo > 0 ? ant.custo / ant.consumo : null;
            const vAnt = variacaoPercentual(custoKwh, antKwh);
            add({
              mes,
              unidade_consumidora_id: ucId,
              fatura_id: atual.faturaPrincipal.id,
              tipo_alerta: "custo_kwh_elevado",
              classificacao:
                vAnt != null && vAnt > cfg.custo_kwh_acima_historico_pct
                  ? "confirmado"
                  : "possivel",
              indicador: "Custo por kWh",
              valor_atual: custoKwh,
              valor_comparacao: mediaKwh,
              variacao_percentual: v,
              descricao: `Custo por kWh de R$ ${custoKwh.toFixed(4).replace(".", ",")} em ${fmtMes(mes)}, ${fmtPct(
                v,
              )} acima da média histórica da UC (R$ ${mediaKwh.toFixed(4).replace(".", ",")}, ${hist.length} meses). Verificar bandeira, demanda, multas, reativo e reajuste tarifário.`,
            });
          }
        }
      }
    }

    // Ausência de fatura em UC com faturamento regular
    if (uc.situacao === "ativa" && ordenados.length >= cfg.historico_minimo_meses) {
      const primeiro = ordenados[0]!;
      for (let mes = somarMeses(primeiro, 1); mes <= ultimoMesGlobal; mes = somarMeses(mes, 1)) {
        if (meses.has(mes)) continue;
        const anteriores = Array.from({ length: 6 }, (_, i) => somarMeses(mes, -(i + 1))).filter(
          (m) => meses.has(m),
        );
        if (anteriores.length < Math.min(cfg.historico_minimo_meses, 6)) continue;
        const posterior = ordenados.some((m) => m > mes);
        add({
          mes,
          unidade_consumidora_id: ucId,
          fatura_id: null,
          tipo_alerta: "ausencia_fatura",
          classificacao: posterior ? "confirmado" : "possivel",
          indicador: "Fatura do mês",
          valor_atual: null,
          valor_comparacao: anteriores.length,
          variacao_percentual: null,
          descricao: posterior
            ? `Não há fatura importada para a competência ${fmtMes(mes)}, embora a UC tenha faturas em meses anteriores e posteriores.`
            : `Ainda não há fatura importada para a competência ${fmtMes(mes)}. A UC apresentou faturamento em ${anteriores.length} dos 6 meses anteriores.`,
        });
      }
    }
  }

  // Custo por kWh acima de UCs semelhantes: mesma área (perfis de uso parecidos);
  // se houver poucas, mesma filial; se ainda poucas, todas as UCs.
  const todosMeses = new Set<string>();
  for (const meses of mesesPorUc.values()) for (const m of meses.keys()) todosMeses.add(m);
  for (const mes of todosMeses) {
    const pontos: {
      ucId: string;
      filial: string | null;
      area: string | null;
      custoKwh: number;
      m: Mes;
    }[] = [];
    for (const [ucId, meses] of mesesPorUc) {
      const m = meses.get(mes);
      if (m && m.consumo && m.consumo > 0) {
        pontos.push({
          ucId,
          filial: ucsPorId.get(ucId)?.filial ?? null,
          area: ucsPorId.get(ucId)?.area ?? null,
          custoKwh: m.custo / m.consumo,
          m,
        });
      }
    }
    for (const p of pontos) {
      let grupo = p.area ? pontos.filter((o) => o.ucId !== p.ucId && o.area === p.area) : [];
      let referencia = `da mesma área (${p.area ?? ""})`;
      if (grupo.length < 3) {
        grupo = pontos.filter((o) => o.ucId !== p.ucId && o.filial === p.filial);
        referencia = "da mesma filial";
      }
      if (grupo.length < 3) {
        grupo = pontos.filter((o) => o.ucId !== p.ucId);
        referencia = "de todas as UCs";
      }
      if (grupo.length < 3) continue;
      const med = mediana(grupo.map((g) => g.custoKwh))!;
      const v = variacaoPercentual(p.custoKwh, med);
      if (v == null || v <= cfg.custo_semelhantes_pct) continue;
      add({
        mes,
        unidade_consumidora_id: p.ucId,
        fatura_id: p.m.faturaPrincipal.id,
        tipo_alerta: "custo_acima_semelhantes",
        classificacao: "possivel",
        indicador: "Custo por kWh",
        valor_atual: p.custoKwh,
        valor_comparacao: med,
        variacao_percentual: v,
        descricao: `Custo por kWh (R$ ${p.custoKwh.toFixed(4).replace(".", ",")}) ${fmtPct(
          v,
        )} acima da mediana ${referencia} em ${fmtMes(mes)} (R$ ${med.toFixed(4).replace(".", ",")}, ${
          grupo.length
        } UCs). Diferenças podem decorrer de modalidade tarifária, demanda contratada ou grupo de tensão.`,
      });
    }
  }

  return alertas;
}
