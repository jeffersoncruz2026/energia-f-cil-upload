import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CabecalhoPagina, Carregando, MensagemErro } from "@/components/app/comuns";
import { CartaoGrafico } from "@/components/app/graficos";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  FATOR_GRUPO_BC,
  ROTULOS_SITUACAO_GRUPO_BC,
  type ResultadoGrupoBc,
} from "@/lib/analise/grupo-bc";
import { useAuth } from "@/lib/auth";
import { buscarTodos, comGrupoBc } from "@/lib/consulta-paginada";
import { CHAVES, invalidarDados, mensagemErro, useUcs } from "@/lib/consultas";
import { formatarMoeda, formatarNumero } from "@/lib/formatacao";
import type { UnidadeConsumidora } from "@/lib/tipos";

export const Route = createFileRoute("/_app/grupo-bc")({
  head: () => ({ meta: [{ title: "Grupo BC — Controle Energia" }] }),
  component: PaginaGrupoBc,
});

interface FaturaBc {
  id: string;
  unidade_consumidora_id: string | null;
  periodo_referencia: string | null;
  numero_documento: string | null;
  serie: string | null;
}

type LinhaCalculo = FaturaBc & ResultadoGrupoBc & { uc: UnidadeConsumidora | undefined };

function PaginaGrupoBc() {
  const { pode } = useAuth();
  const qc = useQueryClient();
  const ucsQ = useUcs();
  const [salvando, setSalvando] = useState<string | null>(null);

  const calculo = useQuery({
    queryKey: [...CHAVES.faturas, "grupo-bc"],
    queryFn: async () => {
      const faturas = await buscarTodos<FaturaBc>(
        supabase,
        "faturas",
        "id, unidade_consumidora_id, periodo_referencia, numero_documento, serie",
        { excluida: false },
      );
      const { ucs, resultados } = await comGrupoBc(supabase, faturas);
      return faturas
        .filter((f) => f.unidade_consumidora_id && ucs.has(f.unidade_consumidora_id))
        .map((f) => ({ ...f, ...resultados.get(f.id)! }));
    },
  });

  const ucsPorId = useMemo(() => new Map((ucsQ.data ?? []).map((u) => [u.id, u])), [ucsQ.data]);
  const linhas: LinhaCalculo[] = useMemo(
    () =>
      (calculo.data ?? []).map((l) => ({
        ...l,
        uc: l.unidade_consumidora_id ? ucsPorId.get(l.unidade_consumidora_id) : undefined,
      })),
    [calculo.data, ucsPorId],
  );

  const alternar = async (uc: UnidadeConsumidora, valor: boolean) => {
    setSalvando(uc.id);
    try {
      const { error } = await supabase
        .from("unidades_consumidoras")
        .update({ grupo_bc: valor })
        .eq("id", uc.id);
      if (error) throw error;
      toast.success(
        valor
          ? `UC ${uc.numero_uc} incluída no Grupo BC.`
          : `UC ${uc.numero_uc} removida do Grupo BC.`,
      );
      await invalidarDados(qc);
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível atualizar a UC."));
    } finally {
      setSalvando(null);
    }
  };

  const colunasUcs: Coluna<UnidadeConsumidora>[] = [
    {
      id: "grupoBc",
      titulo: "Grupo BC",
      valor: (u) => (u.grupo_bc ? "Sim" : "Não"),
      celula: (u) => (
        <Switch
          checked={!!u.grupo_bc}
          disabled={!pode("editar") || salvando === u.id}
          onCheckedChange={(v) => void alternar(u, v)}
          aria-label={`Grupo BC — UC ${u.numero_uc}`}
        />
      ),
    },
    {
      id: "uc",
      titulo: "UC",
      valor: (u) => u.numero_uc,
      celula: (u) => (
        <Link to="/unidades/$id" params={{ id: u.id }} className="font-medium hover:underline">
          {u.numero_uc}
        </Link>
      ),
    },
    { id: "fazenda", titulo: "Fazenda", valor: (u) => u.fazenda },
    { id: "area", titulo: "Área", valor: (u) => u.area },
    { id: "filial", titulo: "Filial", valor: (u) => u.filial },
    {
      id: "situacao",
      titulo: "Situação",
      valor: (u) => (u.situacao === "ativa" ? "Ativa" : "Inativa"),
    },
  ];

  const colunasCalculo: Coluna<LinhaCalculo>[] = [
    {
      id: "competencia",
      titulo: "Competência",
      tipo: "competencia",
      valor: (l) => l.periodo_referencia,
    },
    { id: "uc", titulo: "UC", valor: (l) => l.uc?.numero_uc },
    { id: "fazenda", titulo: "Fazenda", valor: (l) => l.uc?.fazenda },
    {
      id: "documento",
      titulo: "Nº documento",
      valor: (l) => l.numero_documento,
      celula: (l) => (
        <Link to="/faturas/$id" params={{ id: l.id }} className="hover:underline">
          {l.numero_documento ?? "—"}
          {l.serie && <span className="text-muted-foreground">/{l.serie}</span>}
        </Link>
      ),
    },
    { id: "kwh", titulo: "kWh injetados", tipo: "kwh", valor: (l) => l.kwhInjetados },
    {
      id: "tarifa",
      titulo: "Tarifa consumo não compensado (R$/kWh)",
      valor: (l) => l.tarifa,
      celula: (l) => (l.tarifa != null ? formatarNumero(l.tarifa, 6) : "—"),
      alinhar: "direita",
    },
    {
      id: "tarifaBandeira",
      titulo: "Tarifa ADC bandeira (R$/kWh)",
      valor: (l) => l.tarifaBandeira,
      celula: (l) => formatarNumero(l.tarifaBandeira, 6),
      alinhar: "direita",
    },
    { id: "valor", titulo: "Valor Grupo BC", tipo: "moeda", valor: (l) => l.valor },
    { id: "desconto", titulo: "Desconto", tipo: "moeda", valor: (l) => l.desconto },
    { id: "custoCheio", titulo: "Custo cheio", tipo: "moeda", valor: (l) => l.custoCheio },
    {
      id: "situacao",
      titulo: "Situação",
      valor: (l) => ROTULOS_SITUACAO_GRUPO_BC[l.situacao],
      celula: (l) => (
        <Badge
          variant="outline"
          className={
            l.situacao === "tarifa_indisponivel"
              ? "border-warning/40 bg-warning/15 text-warning-foreground"
              : l.situacao === "calculado"
                ? "border-success/30 bg-success/10 text-success"
                : "text-muted-foreground"
          }
        >
          {ROTULOS_SITUACAO_GRUPO_BC[l.situacao]}
        </Badge>
      ),
    },
  ];

  const erro = ucsQ.error ?? calculo.error;
  const soma = (c: "valor" | "desconto" | "custoCheio") =>
    linhas.reduce((s, l) => s + (l[c] ?? 0), 0);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Grupo BC"
        descricao={
          <>
            UCs que recebem energia injetada por terceiros. Valor Grupo BC = kWh injetados (INJEÇÃO
            SCEE) × tarifa do CONSUMO NÃO COMPENSADO (preço unitário com tributos) ×{" "}
            {formatarNumero(FATOR_GRUPO_BC, 2)}. Desconto = kWh injetados × (tarifa do CONSUMO NÃO
            COMPENSADO + tarifa ADC BANDEIRA) − Valor Grupo BC. Custo cheio = Valor Grupo BC +
            Desconto — é o valor somado ao custo da energia. Sem linha ADC BANDEIRA, a tarifa da
            bandeira é zero.
          </>
        }
      />
      {erro ? (
        <MensagemErro erro={mensagemErro(erro, "Não foi possível carregar o Grupo BC.")} />
      ) : ucsQ.isLoading ? (
        <Carregando />
      ) : (
        <>
          <CartaoGrafico
            titulo="Unidades consumidoras do Grupo BC"
            descricao="Ative a chave nas UCs que fazem parte do Grupo BC. O cálculo vale para todas as faturas da UC, inclusive as já importadas."
          >
            <TabelaDados
              dados={ucsQ.data ?? []}
              colunas={colunasUcs}
              chave={(u) => u.id}
              nomeExportacao="grupo-bc-ucs"
              placeholderBusca="Buscar UC, fazenda, área…"
              ordenacaoInicial={{ id: "grupoBc", direcao: "desc" }}
            />
          </CartaoGrafico>
          <CartaoGrafico
            titulo="Cálculo por fatura"
            descricao={`Faturas das UCs do Grupo BC · Valor ${formatarMoeda(soma("valor"))} · Desconto ${formatarMoeda(soma("desconto"))} · Custo cheio ${formatarMoeda(soma("custoCheio"))}. Sem linha INJEÇÃO SCEE, os valores são zero.`}
          >
            {calculo.isLoading ? (
              <Carregando />
            ) : (
              <TabelaDados
                dados={linhas}
                colunas={colunasCalculo}
                chave={(l) => l.id}
                nomeExportacao="grupo-bc-calculo"
                ordenacaoInicial={{ id: "competencia", direcao: "desc" }}
                vazio={
                  <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Handshake className="h-6 w-6" />
                    Nenhuma fatura de UC do Grupo BC.
                  </div>
                }
              />
            )}
          </CartaoGrafico>
        </>
      )}
    </div>
  );
}
