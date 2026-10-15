import { useEffect, useState } from "react";

import { useConfiguracoes } from "../consultas";
import type { CriterioConsolidacao } from "../tipos";
import { FILTROS_VAZIOS, intervaloPadrao, type FaturaAnalise, type Filtros } from "./calculos";

/** Estado dos filtros; o período padrão são os 12 meses até o último mês com dados. */
export function useFiltrosAnalise(
  faturas: FaturaAnalise[] | undefined,
  criterioPadrao: CriterioConsolidacao | undefined,
  iniciais: Partial<Filtros> = {},
) {
  const [filtros, setFiltros] = useState<Filtros>({ ...FILTROS_VAZIOS, ...iniciais });
  const [inicializado, setInicializado] = useState(false);
  const config = useConfiguracoes();
  const baseCustoPadrao = config.data?.baseCusto;

  useEffect(() => {
    if (inicializado || !faturas || !criterioPadrao || !config.isFetched) return;
    const criterio = criterioPadrao;
    const intervalo = intervaloPadrao(faturas, criterio);
    setFiltros((f) => ({
      ...f,
      criterio,
      baseCusto: iniciais.baseCusto ?? baseCustoPadrao ?? "energia",
      inicio: f.inicio ?? intervalo?.inicio ?? null,
      fim: f.fim ?? intervalo?.fim ?? null,
    }));
    setInicializado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inicialização única
  }, [faturas, criterioPadrao, inicializado, config.isFetched, baseCustoPadrao]);

  return [filtros, setFiltros] as const;
}
