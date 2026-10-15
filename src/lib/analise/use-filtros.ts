import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (inicializado || !faturas || !criterioPadrao) return;
    const criterio = criterioPadrao;
    const intervalo = intervaloPadrao(faturas, criterio);
    setFiltros((f) => ({
      ...f,
      criterio,
      inicio: f.inicio ?? intervalo?.inicio ?? null,
      fim: f.fim ?? intervalo?.fim ?? null,
    }));
    setInicializado(true);
  }, [faturas, criterioPadrao, inicializado]);

  return [filtros, setFiltros] as const;
}
