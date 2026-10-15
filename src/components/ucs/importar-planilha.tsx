import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { invalidarDados, mensagemErro, useConfiguracoes } from "@/lib/consultas";
import { formatarCnpj } from "@/lib/formatacao";
import { baixarModeloPlanilha, exportarCsv, lerArquivoPlanilha } from "@/lib/planilha/arquivos";
import {
  CAMPOS_PLANILHA,
  gerarPrevia,
  interpretarLinhas,
  ROTULOS_MODO,
  type LeituraPlanilha,
  type LinhaPrevia,
  type ModoImportacao,
} from "@/lib/planilha/importacao-ucs";
import { CONFIG_CADASTRO_PADRAO, type UnidadeConsumidora } from "@/lib/tipos";

interface ResultadoBanco {
  processadas: number;
  incluidas: number;
  atualizadas: number;
  sem_alteracao: number;
  rejeitadas: number;
  erros: { linha: number; numero_uc: string; motivo: string }[];
}

const ROTULO_CAMPO: Record<string, string> = {
  fazenda: "Fazenda",
  cnpj: "CNPJ",
  endereco: "Endereço",
  filial: "Filial",
};

export function ImportarPlanilha({
  aberto,
  aoFechar,
  existentes,
}: {
  aberto: boolean;
  aoFechar: () => void;
  existentes: UnidadeConsumidora[];
}) {
  const qc = useQueryClient();
  const { pode } = useAuth();
  const { data: cfg } = useConfiguracoes();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<LeituraPlanilha | null>(null);
  const [modo, setModo] = useState<ModoImportacao>(
    pode("editar") ? "incluir_atualizar" : "incluir",
  );
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoBanco | null>(null);

  const previa = useMemo(
    () =>
      leitura && !leitura.erros.length
        ? gerarPrevia(leitura.registros, existentes, modo, cfg?.cadastro ?? CONFIG_CADASTRO_PADRAO)
        : null,
    [leitura, existentes, modo, cfg],
  );

  const reiniciar = () => {
    setArquivo(null);
    setLeitura(null);
    setResultado(null);
    if (entrada.current) entrada.current.value = "";
  };

  const fechar = () => {
    reiniciar();
    aoFechar();
  };

  const selecionar = async (f: File | undefined) => {
    if (!f) return;
    setResultado(null);
    setArquivo(f);
    setLendo(true);
    try {
      const linhas = await lerArquivoPlanilha(f);
      setLeitura(interpretarLinhas(linhas));
    } catch (e) {
      setLeitura({
        registros: [],
        mapeamento: {},
        colunasIgnoradas: [],
        erros: [e instanceof Error ? e.message : "Não foi possível ler o arquivo."],
      });
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    if (!leitura || !arquivo) return;
    setGravando(true);
    const { data, error } = await supabase.rpc("importar_ucs", {
      p_registros: leitura.registros as unknown as Json,
      p_modo: modo,
      p_nome_arquivo: arquivo.name,
    });
    setGravando(false);
    if (error) {
      toast.error(mensagemErro(error, "Falha ao importar a planilha."));
      return;
    }
    const r = data as unknown as ResultadoBanco;
    setResultado(r);
    await invalidarDados(qc);
    toast.success(
      `Importação concluída: ${r.incluidas} incluída(s), ${r.atualizadas} atualizada(s), ${r.rejeitadas} rejeitada(s).`,
    );
  };

  const exportarRejeitadas = (
    linhas: {
      linha: number;
      numero_uc: string;
      fazenda?: string;
      cnpj?: string;
      endereco?: string;
      filial?: string;
      motivo: string;
    }[],
  ) => {
    exportarCsv(
      "ucs-rejeitadas",
      [
        { id: "l", titulo: "Linha original", tipo: "numero", valor: (x) => x.linha },
        { id: "u", titulo: "Numero da UC", valor: (x) => x.numero_uc },
        { id: "f", titulo: "Fazenda", valor: (x) => x.fazenda ?? "" },
        { id: "c", titulo: "CNPJ", valor: (x) => x.cnpj ?? "" },
        { id: "e", titulo: "Endereço", valor: (x) => x.endereco ?? "" },
        { id: "fi", titulo: "Filial", valor: (x) => x.filial ?? "" },
        { id: "m", titulo: "Motivo da rejeição", valor: (x) => x.motivo },
      ],
      linhas,
    );
  };

  const rejeitadas = previa?.linhas.filter((l) => l.acao === "rejeitar") ?? [];
  const modosPermitidos: ModoImportacao[] = pode("editar")
    ? ["incluir", "atualizar", "incluir_atualizar"]
    : ["incluir"];

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar planilha de unidades consumidoras</DialogTitle>
          <DialogDescription>
            Aceita arquivos XLSX e CSV com as colunas:{" "}
            {CAMPOS_PLANILHA.map((c) => c.titulo).join(", ")}. O número da UC é a chave de
            identificação. Nenhum dado é alterado antes da sua confirmação.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
              <div className="text-sm">
                <p className="font-medium">Importação registrada no histórico.</p>
                <p className="text-muted-foreground">
                  {resultado.processadas} linha(s) processada(s): {resultado.incluidas} incluída(s),{" "}
                  {resultado.atualizadas} atualizada(s), {resultado.sem_alteracao} sem alteração e{" "}
                  {resultado.rejeitadas} rejeitada(s).
                </p>
              </div>
            </div>
            {resultado.erros.length > 0 && (
              <TabelaErros
                linhas={resultado.erros.map((e) => ({
                  linha: e.linha,
                  numero_uc: e.numero_uc,
                  motivo: e.motivo,
                }))}
                aoExportar={() =>
                  exportarRejeitadas(
                    resultado.erros.map((e) => {
                      const reg = leitura?.registros.find((r) => r.linha === e.linha);
                      return { ...reg, linha: e.linha, numero_uc: e.numero_uc, motivo: e.motivo };
                    }),
                  )
                }
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reiniciar}>
                <RotateCcw className="mr-2 h-4 w-4" /> Importar outro arquivo
              </Button>
              <Button onClick={fechar}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void baixarModeloPlanilha("xlsx")}>
                <Download className="mr-1.5 h-4 w-4" /> Modelo XLSX
              </Button>
              <Button variant="outline" size="sm" onClick={() => void baixarModeloPlanilha("csv")}>
                <Download className="mr-1.5 h-4 w-4" /> Modelo CSV
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Modo de importação</Label>
              <RadioGroup
                value={modo}
                onValueChange={(m) => setModo(m as ModoImportacao)}
                className="grid gap-2 sm:grid-cols-3"
              >
                {modosPermitidos.map((m) => (
                  <Label
                    key={m}
                    htmlFor={`modo-${m}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem value={m} id={`modo-${m}`} />
                    {ROTULOS_MODO[m]}
                  </Label>
                ))}
              </RadioGroup>
              {!pode("editar") && (
                <p className="text-xs text-muted-foreground">
                  Seu perfil permite apenas incluir novas UCs.
                </p>
              )}
            </div>

            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
              onClick={() => entrada.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void selecionar(e.dataTransfer.files[0]);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && entrada.current?.click()}
            >
              {lendo ? (
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              ) : (
                <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {arquivo ? arquivo.name : "Clique ou arraste a planilha (.xlsx ou .csv)"}
              </span>
              <span className="text-xs text-muted-foreground">Limite: 10 MB e 5.000 linhas</span>
              <input
                ref={entrada}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => void selecionar(e.target.files?.[0])}
              />
            </div>

            {leitura && leitura.erros.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {leitura.erros.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}

            {leitura && previa && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {Object.entries(leitura.mapeamento).map(([campo, col]) => (
                    <span key={campo}>
                      <strong className="font-medium text-foreground">{col}</strong> →{" "}
                      {CAMPOS_PLANILHA.find((c) => c.campo === campo)?.titulo}
                    </span>
                  ))}
                  {leitura.colunasIgnoradas.length > 0 && (
                    <span>Ignoradas: {leitura.colunasIgnoradas.join(", ")}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Resumo rotulo="Serão incluídas" valor={previa.incluir} classe="text-success" />
                  <Resumo
                    rotulo="Serão atualizadas"
                    valor={previa.atualizar}
                    classe="text-primary"
                  />
                  <Resumo
                    rotulo="Sem alteração"
                    valor={previa.semAlteracao}
                    classe="text-muted-foreground"
                  />
                  <Resumo rotulo="Rejeitadas" valor={previa.rejeitar} classe="text-destructive" />
                </div>
                <Tabs
                  defaultValue={
                    previa.rejeitar ? "rejeitar" : previa.atualizar ? "atualizar" : "incluir"
                  }
                >
                  <TabsList className="flex-wrap">
                    <TabsTrigger value="incluir">Inclusões ({previa.incluir})</TabsTrigger>
                    <TabsTrigger value="atualizar">Alterações ({previa.atualizar})</TabsTrigger>
                    <TabsTrigger value="rejeitar">Rejeitadas ({previa.rejeitar})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="incluir">
                    <TabelaPrevia linhas={previa.linhas.filter((l) => l.acao === "incluir")} />
                  </TabsContent>
                  <TabsContent value="atualizar">
                    <TabelaAlteracoes
                      linhas={previa.linhas.filter((l) => l.acao === "atualizar")}
                    />
                  </TabsContent>
                  <TabsContent value="rejeitar">
                    <TabelaErros
                      linhas={rejeitadas.map((l) => ({
                        linha: l.registro.linha,
                        numero_uc: l.registro.numero_uc,
                        motivo: l.motivo ?? "",
                      }))}
                      aoExportar={() =>
                        exportarRejeitadas(
                          rejeitadas.map((l) => ({ ...l.registro, motivo: l.motivo ?? "" })),
                        )
                      }
                    />
                  </TabsContent>
                </Tabs>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={fechar}>
                Cancelar
              </Button>
              <Button
                onClick={() => void confirmar()}
                disabled={!previa || gravando || previa.incluir + previa.atualizar === 0}
              >
                {gravando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Confirmar importação
                {previa && ` (${previa.incluir + previa.atualizar})`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Resumo({ rotulo, valor, classe }: { rotulo: string; valor: number; classe: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className={`tabular text-xl font-semibold ${classe}`}>{valor}</div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
    </div>
  );
}

function Rolagem({ children }: { children: React.ReactNode }) {
  return <div className="max-h-72 overflow-auto rounded-md border">{children}</div>;
}

function TabelaPrevia({ linhas }: { linhas: LinhaPrevia[] }) {
  if (!linhas.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum registro.</p>;
  return (
    <Rolagem>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Linha</TableHead>
            <TableHead>UC</TableHead>
            <TableHead>Fazenda</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Filial</TableHead>
            <TableHead>Endereço</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.registro.linha}>
              <TableCell>{l.registro.linha}</TableCell>
              <TableCell className="font-medium">{l.registro.numero_uc}</TableCell>
              <TableCell>{l.registro.fazenda}</TableCell>
              <TableCell className="whitespace-nowrap">{formatarCnpj(l.registro.cnpj)}</TableCell>
              <TableCell>{l.registro.filial || "—"}</TableCell>
              <TableCell>{l.registro.endereco || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Rolagem>
  );
}

function TabelaAlteracoes({ linhas }: { linhas: LinhaPrevia[] }) {
  if (!linhas.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma alteração prevista.</p>
    );
  return (
    <Rolagem>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Linha</TableHead>
            <TableHead>UC</TableHead>
            <TableHead>Campo</TableHead>
            <TableHead>Valor atual</TableHead>
            <TableHead>Novo valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.flatMap((l) =>
            (l.alteracoes ?? []).map((a, i) => (
              <TableRow key={`${l.registro.linha}-${a.campo}`}>
                <TableCell>{i === 0 ? l.registro.linha : ""}</TableCell>
                <TableCell className="font-medium">
                  {i === 0 ? l.existente?.numero_uc : ""}
                </TableCell>
                <TableCell>{ROTULO_CAMPO[a.campo] ?? a.campo}</TableCell>
                <TableCell className="text-muted-foreground line-through">
                  {a.campo === "cnpj" ? formatarCnpj(a.de) : (a.de ?? "—")}
                </TableCell>
                <TableCell className="font-medium">
                  {a.campo === "cnpj" ? formatarCnpj(a.para) : (a.para ?? "—")}
                </TableCell>
              </TableRow>
            )),
          )}
        </TableBody>
      </Table>
    </Rolagem>
  );
}

function TabelaErros({
  linhas,
  aoExportar,
}: {
  linhas: { linha: number; numero_uc: string; motivo: string }[];
  aoExportar: () => void;
}) {
  if (!linhas.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma linha rejeitada.</p>
    );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Corrija as linhas na planilha e importe novamente — UCs já incluídas não serão duplicadas.
        </p>
        <Button variant="outline" size="sm" onClick={aoExportar}>
          <Download className="mr-1.5 h-4 w-4" /> Exportar rejeitadas
        </Button>
      </div>
      <Rolagem>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Linha</TableHead>
              <TableHead>UC</TableHead>
              <TableHead>Motivo da rejeição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={`${l.linha}-${l.motivo}`}>
                <TableCell>{l.linha}</TableCell>
                <TableCell className="font-medium">{l.numero_uc || "—"}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="border-destructive/30 bg-destructive/5 font-normal text-destructive"
                  >
                    {l.motivo}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Rolagem>
    </div>
  );
}
