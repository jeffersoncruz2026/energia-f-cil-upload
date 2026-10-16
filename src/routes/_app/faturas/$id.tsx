import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Code2,
  Download,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  BadgeStatusDocumento,
  BadgeStatusProcessamento,
  CampoInfo,
  Carregando,
  MensagemErro,
} from "@/components/app/comuns";
import { TabelaDados, type Coluna } from "@/components/app/tabela-dados";
import { AssociarUc } from "@/components/faturas/associar-uc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_XML } from "@/lib/configuracao-backend";
import { creditosDaFatura, creditosNoDocumento, custoDaFatura } from "@/lib/analise/calculos";
import { calcularGrupoBcPorFatura } from "@/lib/analise/grupo-bc";
import { buscarGeradorasGrupoBc } from "@/lib/consulta-paginada";
import { useAuth } from "@/lib/auth";
import { CHAVES, invalidarDados, mensagemErro } from "@/lib/consultas";
import {
  formatarChave,
  formatarCnpj,
  formatarCompetencia,
  formatarData,
  formatarDataHora,
  formatarKwh,
  formatarMoeda,
  formatarNumero,
  parseNumeroBr,
} from "@/lib/formatacao";
import type { Fatura, ItemFatura } from "@/lib/tipos";
import { ROTULOS_TIPO_ITEM, type TipoItem } from "@/lib/xml/classificacao-itens";
import { reprocessarFatura } from "@/backend/faturas.functions";

export const Route = createFileRoute("/_app/faturas/$id")({
  head: () => ({ meta: [{ title: "Detalhe da fatura — Controle Energia" }] }),
  component: DetalheFatura,
});

type FaturaDetalhe = Fatura & {
  uc: {
    id: string;
    numero_uc: string;
    fazenda: string;
    filial: string | null;
    cnpj: string;
    endereco: string | null;
  } | null;
};

function DetalheFatura() {
  const { id } = Route.useParams();
  const { pode } = useAuth();
  const qc = useQueryClient();
  const reprocessar = useServerFn(reprocessarFatura);
  const [associando, setAssociando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [xml, setXml] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: [...CHAVES.faturas, "detalhe", id],
    queryFn: async () => {
      const [f, i] = await Promise.all([
        supabase
          .from("faturas")
          .select("*, uc:unidades_consumidoras(id,numero_uc,fazenda,filial,cnpj,endereco)")
          .eq("id", id)
          .maybeSingle(),
        supabase.from("itens_fatura").select("*").eq("fatura_id", id).order("numero_item"),
      ]);
      if (f.error) throw f.error;
      if (i.error) throw i.error;
      const fatura = f.data as FaturaDetalhe | null;
      const itens = (i.data ?? []) as ItemFatura[];
      // Grupo BC: calculado quando a fatura tem injeção de usina cadastrada no grupo.
      const geradoras = await buscarGeradorasGrupoBc(supabase);
      const grupoBc =
        calcularGrupoBcPorFatura(
          itens.map((it) => ({ ...it, fatura_id: id })),
          geradoras,
        ).get(id) ?? null;
      return {
        fatura: fatura
          ? {
              ...fatura,
              valor_grupo_bc: grupoBc?.valor ?? null,
              desconto_grupo_bc: grupoBc?.desconto ?? null,
              custo_cheio_grupo_bc: grupoBc?.custoCheio ?? null,
            }
          : null,
        itens,
        grupoBc,
      };
    },
  });

  if (consulta.error)
    return (
      <MensagemErro erro={mensagemErro(consulta.error, "Não foi possível carregar a fatura.")} />
    );
  if (consulta.isLoading) return <Carregando />;
  const f = consulta.data?.fatura;
  const itens = consulta.data?.itens ?? [];
  if (!f) return <MensagemErro erro="Fatura não encontrada." />;

  const avisos = ((f.dados_extraidos_json?.["avisos"] as string[] | undefined) ?? []).filter(
    Boolean,
  );

  const baixarXml = async (mostrar: boolean) => {
    if (!f.arquivo_xml_path) return;
    setOcupado("xml");
    const { data, error } = await supabase.storage.from(BUCKET_XML).download(f.arquivo_xml_path);
    setOcupado(null);
    if (error || !data) {
      toast.error("Não foi possível obter o XML original.");
      return;
    }
    if (mostrar) {
      setXml(await data.text());
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.nome_arquivo ?? `${f.chave_acesso ?? f.id}.xml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const executarReprocessamento = async () => {
    setOcupado("reprocessar");
    try {
      const r = await reprocessar({ data: { faturaId: f.id } });
      toast.success(r.mensagem ?? "Fatura reprocessada.");
      await invalidarDados(qc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reprocessar.");
    } finally {
      setOcupado(null);
    }
  };

  const restaurar = async () => {
    const { error } = await supabase.rpc("restaurar_fatura", { p_fatura_id: f.id });
    if (error) toast.error(mensagemErro(error));
    else {
      toast.success("Fatura restaurada.");
      await invalidarDados(qc);
    }
  };

  const colunasItens: Coluna<ItemFatura>[] = [
    { id: "n", titulo: "Item", tipo: "numero", valor: (i) => i.numero_item },
    {
      id: "descricao",
      titulo: "Descrição",
      valor: (i) => i.descricao,
      classe: "max-w-xs whitespace-normal",
    },
    {
      id: "tipo",
      titulo: "Classificação",
      valor: (i) => ROTULOS_TIPO_ITEM[i.tipo_item as TipoItem] ?? i.tipo_item,
    },
    { id: "componente", titulo: "Componente", valor: (i) => i.componente },
    { id: "posto", titulo: "Posto", valor: (i) => i.posto_tarifario, oculta: true },
    { id: "qtd", titulo: "Quantidade", tipo: "numero", valor: (i) => i.quantidade },
    { id: "unidade", titulo: "Unidade", valor: (i) => i.unidade_medida },
    { id: "unit", titulo: "Valor unitário", tipo: "decimal4", valor: (i) => i.valor_unitario },
    { id: "total", titulo: "Valor", tipo: "moeda", valor: (i) => i.valor_total },
    { id: "icms", titulo: "ICMS", tipo: "moeda", valor: (i) => i.valor_icms, oculta: true },
    { id: "cclass", titulo: "cClass", valor: (i) => i.codigo_classificacao, oculta: true },
  ];

  const valores: [string, number | null][] = [
    ["Energia (consumo)", f.valor_energia],
    ["  TUSD", f.valor_tusd],
    ["  TE", f.valor_te],
    ["Demanda", f.valor_demanda],
    ["Reativo", f.valor_reativo],
    ["Bandeira tarifária", f.valor_bandeira],
    ["CIP/COSIP", f.valor_cip],
    ["Multas", f.valor_multas],
    ["Juros", f.valor_juros],
    ["Encargos", f.valor_encargos],
    ["Créditos abatidos (exceto energia solar)", f.valor_compensacao],
    ["Descontos", f.valor_descontos != null ? -f.valor_descontos : null],
    ["Outros", f.valor_outros],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/faturas">
            <ArrowLeft className="mr-1 h-4 w-4" /> Faturas
          </Link>
        </Button>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {f.tipo_documento ?? "Documento"} nº {f.numero_documento ?? "—"}
              {f.serie && <span className="text-muted-foreground"> / série {f.serie}</span>}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BadgeStatusDocumento status={f.status_documento} />
              <BadgeStatusProcessamento status={f.status_processamento} />
              {f.finalidade && f.finalidade !== "normal" && (
                <Badge variant="outline">Finalidade: {f.finalidade}</Badge>
              )}
              {f.excluida && (
                <Badge
                  variant="outline"
                  className="border-destructive/30 bg-destructive/10 text-destructive"
                >
                  Excluída
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Competência {formatarCompetencia(f.periodo_referencia)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {f.arquivo_xml_path && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void baixarXml(true)}
                  disabled={ocupado === "xml"}
                >
                  <Code2 className="mr-1.5 h-4 w-4" /> Ver XML
                </Button>
                <Button variant="outline" size="sm" onClick={() => void baixarXml(false)}>
                  <Download className="mr-1.5 h-4 w-4" /> Baixar XML
                </Button>
              </>
            )}
            {pode("importar") && !f.excluida && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void executarReprocessamento()}
                  disabled={!!ocupado}
                >
                  {ocupado === "reprocessar" ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                  )}
                  Reprocessar
                </Button>
                {(!f.unidade_consumidora_id || pode("editar")) && (
                  <Button variant="outline" size="sm" onClick={() => setAssociando(true)}>
                    <Link2 className="mr-1.5 h-4 w-4" />{" "}
                    {f.unidade_consumidora_id ? "Corrigir UC" : "Associar UC"}
                  </Button>
                )}
              </>
            )}
            {pode("editar") && !f.excluida && (
              <Button variant="outline" size="sm" onClick={() => setPagando(true)}>
                <Banknote className="mr-1.5 h-4 w-4" /> Pagamento
              </Button>
            )}
            {pode("excluir") &&
              (f.excluida ? (
                <Button variant="outline" size="sm" onClick={() => void restaurar()}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Restaurar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setExcluindo(true)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                </Button>
              ))}
          </div>
        </div>
      </div>

      {(f.divergencias?.length > 0 || avisos.length > 0 || f.excluida) && (
        <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Pontos de atenção
          </div>
          <ul className="list-disc space-y-0.5 pl-6 text-foreground/90">
            {f.excluida && (
              <li>
                Excluída em {formatarDataHora(f.excluida_em)}. Motivo: {f.motivo_exclusao}
              </li>
            )}
            {f.divergencias?.map((d) => (
              <li key={d.mensagem}>{d.mensagem}</li>
            ))}
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CampoInfo
                rotulo="Chave de acesso"
                valor={formatarChave(f.chave_acesso)}
                className="sm:col-span-2 lg:col-span-3"
              />
              <CampoInfo rotulo="Modelo" valor={f.modelo_documento} />
              <CampoInfo rotulo="Data de emissão" valor={formatarData(f.data_emissao)} />
              <CampoInfo rotulo="Vencimento" valor={formatarData(f.data_vencimento)} />
              <CampoInfo rotulo="Competência" valor={formatarCompetencia(f.periodo_referencia)} />
              <CampoInfo
                rotulo="Período de leitura"
                valor={
                  f.data_leitura_anterior
                    ? `${formatarData(f.data_leitura_anterior)} a ${formatarData(f.data_leitura_atual)}`
                    : "—"
                }
              />
              <CampoInfo rotulo="Dias faturados" valor={f.dias_faturados ?? "—"} />
              <CampoInfo
                rotulo="Fornecedor"
                valor={
                  f.nome_fornecedor
                    ? `${f.nome_fornecedor} (${formatarCnpj(f.cnpj_emitente)})`
                    : "—"
                }
                className="sm:col-span-2"
              />
              <CampoInfo rotulo="Protocolo" valor={f.protocolo_autorizacao} />
              <CampoInfo
                rotulo="Destinatário"
                valor={
                  f.nome_destinatario
                    ? `${f.nome_destinatario} (${formatarCnpj(f.cnpj_destinatario)})`
                    : "—"
                }
                className="sm:col-span-2"
              />
              <CampoInfo rotulo="Classe" valor={f.classe_consumo} />
              <CampoInfo
                rotulo="Endereço (XML)"
                valor={f.endereco_destinatario}
                className="sm:col-span-2 lg:col-span-3"
              />
              {f.chave_substituida && (
                <CampoInfo
                  rotulo="Substitui o documento"
                  valor={formatarChave(f.chave_substituida)}
                  className="sm:col-span-3"
                />
              )}
              <CampoInfo rotulo="Arquivo" valor={f.nome_arquivo} className="sm:col-span-2" />
              <CampoInfo rotulo="Importada em" valor={formatarDataHora(f.created_at)} />
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Unidade consumidora</CardTitle>
            </CardHeader>
            <CardContent>
              {f.uc ? (
                <dl className="grid gap-3">
                  <CampoInfo
                    rotulo="UC"
                    valor={
                      <Link
                        to="/unidades/$id"
                        params={{ id: f.uc.id }}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {f.uc.numero_uc}
                      </Link>
                    }
                  />
                  <CampoInfo rotulo="Fazenda" valor={f.uc.fazenda} />
                  <CampoInfo rotulo="Filial" valor={f.uc.filial} />
                  <CampoInfo rotulo="CNPJ cadastrado" valor={formatarCnpj(f.uc.cnpj)} />
                  <CampoInfo rotulo="Endereço cadastrado" valor={f.uc.endereco} />
                  <CampoInfo rotulo="UC informada no XML" valor={f.numero_uc_extraido} />
                </dl>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>
                    UC no XML: <strong>{f.numero_uc_extraido ?? "não identificada"}</strong>
                  </p>
                  <p className="text-muted-foreground">
                    Não associada. A fatura não compõe os indicadores.
                  </p>
                  {pode("importar") && (
                    <Button size="sm" onClick={() => setAssociando(true)}>
                      Associar UC
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {f.pagamento_confirmado ? (
                <p>
                  <span className="font-medium text-success">Confirmado</span> em{" "}
                  {formatarData(f.data_pagamento)} — {formatarMoeda(f.valor_pago)}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Não confirmado. O valor faturado ({formatarMoeda(f.valor_total)}) não é tratado
                  como pago.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Consumo e medição</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <CampoInfo
                rotulo="Consumo considerado"
                valor={
                  <>
                    {formatarKwh(f.consumo_kwh)}
                    {f.origem_consumo && (
                      <span className="text-xs text-muted-foreground"> ({f.origem_consumo})</span>
                    )}
                  </>
                }
              />
              <CampoInfo rotulo="Consumo faturado" valor={formatarKwh(f.consumo_faturado_kwh)} />
              <CampoInfo rotulo="Consumo medido" valor={formatarKwh(f.consumo_medido_kwh)} />
              <CampoInfo rotulo="Energia injetada" valor={formatarKwh(f.energia_injetada_kwh)} />
              <CampoInfo
                rotulo="Energia compensada"
                valor={formatarKwh(f.energia_compensada_kwh)}
              />
              <CampoInfo
                rotulo="Energia reativa"
                valor={
                  f.energia_reativa_kvarh != null
                    ? `${formatarNumero(f.energia_reativa_kvarh, 0, 2)} kVArh`
                    : "—"
                }
              />
              <CampoInfo
                rotulo="Demanda contratada"
                valor={
                  f.demanda_contratada_kw != null
                    ? `${formatarNumero(f.demanda_contratada_kw, 0, 2)} kW`
                    : "—"
                }
              />
              <CampoInfo
                rotulo="Demanda medida"
                valor={
                  f.demanda_medida_kw != null
                    ? `${formatarNumero(f.demanda_medida_kw, 0, 2)} kW`
                    : "—"
                }
              />
              <CampoInfo
                rotulo="Demanda faturada"
                valor={
                  f.demanda_faturada_kw != null
                    ? `${formatarNumero(f.demanda_faturada_kw, 0, 2)} kW`
                    : "—"
                }
              />
              <CampoInfo
                rotulo="Custo da energia por kWh"
                valor={
                  f.consumo_kwh && f.consumo_kwh > 0 && custoDaFatura(f) != null
                    ? `R$ ${formatarNumero(custoDaFatura(f)! / f.consumo_kwh, 4)}`
                    : "—"
                }
              />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 border-b pb-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Custo da energia (antes dos créditos)</span>
                <span className="tabular text-xl font-semibold">
                  {formatarMoeda(custoDaFatura(f))}
                </span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>(−) Créditos abatidos</span>
                <span className="tabular">
                  {formatarMoeda(creditosDaFatura(f) ? -creditosDaFatura(f) : 0)}
                </span>
              </div>
              {consulta.data?.grupoBc && (
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex justify-between pl-4 text-xs">
                    <span>
                      Grupo BC ({formatarKwh(consulta.data.grupoBc.kwhInjetados)} ×{" "}
                      {consulta.data.grupoBc.tarifa != null
                        ? `R$ ${formatarNumero(consulta.data.grupoBc.tarifa, 6)}`
                        : "tarifa indisponível"}{" "}
                      × 0,80)
                    </span>
                    <span className="tabular">{formatarMoeda(consulta.data.grupoBc.valor)}</span>
                  </div>
                  <div className="flex justify-between pl-4 text-xs">
                    <span>
                      Desconto Grupo BC (kWh × (tarifa + bandeira R${" "}
                      {formatarNumero(consulta.data.grupoBc.tarifaBandeira, 6)}) − Grupo BC)
                    </span>
                    <span className="tabular">{formatarMoeda(consulta.data.grupoBc.desconto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>(+) Custo cheio Grupo BC</span>
                    <span className="tabular">
                      {formatarMoeda(consulta.data.grupoBc.custoCheio)}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium">
                <span>Valor faturado (total do documento)</span>
                <span className="tabular">{formatarMoeda(f.valor_total)}</span>
              </div>
              {creditosNoDocumento(f) > 0 && creditosDaFatura(f) === 0 && (
                <p className="text-xs text-muted-foreground">
                  Créditos no documento ({formatarMoeda(creditosNoDocumento(f))}) não somados ao
                  custo: fatura com valor a pagar, custo da energia = valor faturado.
                </p>
              )}
            </div>
            <dl className="grid gap-1.5 text-sm">
              {valores
                .filter(([, v]) => v != null)
                .map(([r, v]) => (
                  <div key={r} className="flex justify-between">
                    <dt className={r.startsWith("  ") ? "pl-4 text-muted-foreground" : ""}>
                      {r.trim()}
                    </dt>
                    <dd className="tabular">{formatarMoeda(v)}</dd>
                  </div>
                ))}
            </dl>
            <div className="grid grid-cols-3 gap-2 border-t pt-3 text-sm">
              <CampoInfo rotulo="ICMS" valor={formatarMoeda(f.valor_icms)} />
              <CampoInfo rotulo="PIS" valor={formatarMoeda(f.valor_pis)} />
              <CampoInfo rotulo="COFINS" valor={formatarMoeda(f.valor_cofins)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Componentes conforme discriminados nos itens do documento (tributos já incluídos nos
              itens quando cobrados “por dentro”). Os componentes não são somados ao valor total.
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="itens">
        <TabsList>
          <TabsTrigger value="itens">Itens faturados ({itens.length})</TabsTrigger>
          <TabsTrigger value="dados">Dados extraídos</TabsTrigger>
        </TabsList>
        <TabsContent value="itens">
          <TabelaDados
            dados={itens}
            colunas={colunasItens}
            chave={(i) => i.id}
            busca={false}
            nomeExportacao={`itens-fatura-${f.numero_documento ?? f.id}`}
          />
        </TabsContent>
        <TabsContent value="dados">
          <pre className="max-h-[500px] overflow-auto rounded-lg border bg-muted/40 p-4 text-xs">
            {JSON.stringify(f.dados_extraidos_json, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>

      <AssociarUc
        aberto={associando}
        aoFechar={() => setAssociando(false)}
        faturaId={f.id}
        ucAtualId={f.unidade_consumidora_id}
        numeroUcXml={f.numero_uc_extraido}
        cnpjXml={f.cnpj_destinatario}
      />
      <DialogoPagamento aberto={pagando} aoFechar={() => setPagando(false)} fatura={f} />
      <DialogoExclusao aberto={excluindo} aoFechar={() => setExcluindo(false)} faturaId={f.id} />
      <Dialog open={xml != null} onOpenChange={(o) => !o && setXml(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>XML original</DialogTitle>
            <DialogDescription>{f.nome_arquivo}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 text-xs">
            {xml}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DialogoPagamento({
  aberto,
  aoFechar,
  fatura,
}: {
  aberto: boolean;
  aoFechar: () => void;
  fatura: Fatura;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState(fatura.data_pagamento ?? "");
  const [valor, setValor] = useState(
    fatura.valor_pago != null
      ? String(fatura.valor_pago).replace(".", ",")
      : fatura.valor_total != null
        ? String(fatura.valor_total).replace(".", ",")
        : "",
  );
  const [salvando, setSalvando] = useState(false);

  const salvar = async (confirmar: boolean) => {
    const v = parseNumeroBr(valor);
    if (confirmar && (!data || v == null || v < 0)) {
      toast.error("Informe a data e o valor pago.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.rpc("registrar_pagamento", {
      p_fatura_id: fatura.id,
      // null limpa o pagamento no banco; o tipo gerado não prevê o valor nulo.
      p_data: (confirmar ? data : null) as unknown as string,
      p_valor: (confirmar ? v : null) as unknown as number,
    });
    setSalvando(false);
    if (error) {
      toast.error(mensagemErro(error));
      return;
    }
    toast.success(confirmar ? "Pagamento confirmado." : "Confirmação de pagamento removida.");
    await invalidarDados(qc);
    aoFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmação de pagamento</DialogTitle>
          <DialogDescription>
            Registre o pagamento efetivo. O valor faturado ({formatarMoeda(fatura.valor_total)}) não
            é considerado pago automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dp">Data do pagamento</Label>
            <Input id="dp" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vp">Valor pago (R$)</Label>
            <Input
              id="vp"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {fatura.pagamento_confirmado && (
            <Button variant="outline" onClick={() => void salvar(false)} disabled={salvando}>
              Remover confirmação
            </Button>
          )}
          <Button onClick={() => void salvar(true)} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoExclusao({
  aberto,
  aoFechar,
  faturaId,
}: {
  aberto: boolean;
  aoFechar: () => void;
  faturaId: string;
}) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const excluir = async () => {
    setSalvando(true);
    const { error } = await supabase.rpc("excluir_fatura", {
      p_fatura_id: faturaId,
      p_motivo: motivo,
    });
    setSalvando(false);
    if (error) {
      toast.error(mensagemErro(error));
      return;
    }
    toast.success("Fatura excluída (exclusão lógica). Ela deixa de compor indicadores.");
    await invalidarDados(qc);
    setMotivo("");
    aoFechar();
  };
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir fatura</DialogTitle>
          <DialogDescription>
            A exclusão é lógica: o registro e o XML original são preservados para auditoria e podem
            ser restaurados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="motivo">Motivo (obrigatório)</Label>
          <Textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void excluir()}
            disabled={!motivo.trim() || salvando}
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
