import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const REGRAS_CALCULO = [
  {
    titulo: "Faturas consideradas",
    texto:
      "Somente faturas válidas: não excluídas, não canceladas, não substituídas, associadas a uma UC cadastrada e com valor total disponível. Faturas pendentes de identificação não entram nos indicadores. Documentos de ajuste compõem o período a que se referem.",
  },
  {
    titulo: "Custo da energia (base padrão)",
    texto:
      "Custo da energia ANTES da compensação de créditos de geração distribuída: valor total do documento (vNF) + créditos de energia abatidos na fatura (somente os lançamentos negativos de energia injetada/compensada; a energia “SCEE”/“GD” cobrada pelo preço cheio é consumo, não crédito). Assim o custo real da energia aparece mesmo quando a fatura sai com valor zero ou reduzido pelos créditos. Nos filtros é possível trocar para “Valor faturado (líquido)”, que usa apenas o vNF. Subtotais e componentes (TUSD, TE, tributos etc.) nunca são somados ao total, para não duplicar valores.",
  },
  {
    titulo: "Consumo total",
    texto:
      "Soma do consumo em kWh das faturas válidas com consumo disponível. O consumo vem dos itens faturados de energia ativa (sem somar duas vezes a mesma energia cobrada em TUSD e TE); na ausência deles, da medição. Energia injetada/compensada é informada à parte.",
  },
  {
    titulo: "Custo médio por UC",
    texto: "Custo total ÷ quantidade de UCs com faturas válidas no período.",
  },
  {
    titulo: "Custo médio por kWh",
    texto:
      "Soma do custo (na base escolhida) ÷ soma do consumo, considerando apenas as faturas com consumo positivo — o mesmo conjunto no numerador e no denominador. Faturas sem consumo informado ficam fora deste indicador.",
  },
  {
    titulo: "Variação percentual",
    texto:
      "(valor atual − valor anterior) ÷ valor anterior × 100, comparando com o período imediatamente anterior de mesma duração. Não é calculada quando o valor anterior é zero ou inexistente.",
  },
  {
    titulo: "Critério de período",
    texto:
      "Competência: mês de referência informado na fatura (CompetFat). Data de emissão: mês em que o documento foi emitido. O critério escolhido vale para todos os indicadores e gráficos da tela.",
  },
  {
    titulo: "Valor faturado × pago",
    texto:
      "Os indicadores tratam de valores faturados. O pagamento só é considerado confirmado quando registrado manualmente na fatura.",
  },
];

export function BotaoMetodologia() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="mr-1.5 h-4 w-4" /> Metodologia
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Regras de cálculo</DialogTitle>
          <DialogDescription>
            Como os indicadores são calculados a partir das faturas importadas.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-4">
          {REGRAS_CALCULO.map((r) => (
            <div key={r.titulo}>
              <dt className="text-sm font-semibold">{r.titulo}</dt>
              <dd className="mt-0.5 text-sm text-muted-foreground">{r.texto}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
