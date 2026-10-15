// Ambiente de execução: edição (preview do editor Lovable / desenvolvimento local)
// ou projeto publicado para os usuários.
//
// No projeto publicado aparecem apenas as guias de consulta (Dashboard, Faturas,
// Energia Solar, Análises e Alertas, Relatórios). Cadastro de UCs, importação de
// XML, pendências, histórico e configurações ficam só no ambiente de edição.
// Isto organiza a navegação; o controle de acesso aos dados continua sendo feito
// pelos perfis (RLS e permissões no banco).

/** Rotas de administração disponíveis apenas no ambiente de edição. */
const ROTAS_SO_EDICAO = ["/unidades", "/importar", "/pendencias", "/historico", "/configuracoes"];

/** Detalhe da UC (/unidades/:id) segue disponível como análise a partir dos gráficos. */
const DETALHE_UC = /^\/unidades\/[^/]+$/;

export function ehAmbienteEdicao(
  hostname: string | undefined = typeof window === "undefined"
    ? undefined
    : window.location.hostname,
): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  // Preview do editor Lovable: <id>.lovableproject.com, id-preview--<id>.lovable.app, preview--<nome>.lovable.app
  if (/(^|\.)lovableproject(-dev)?\.com$/.test(host)) return true;
  if (/^(id-)?preview(-[a-z0-9]+)?--/.test(host)) return true;
  return false;
}

/** true quando a rota é de administração e não deve ser aberta no projeto publicado. */
export function rotaSoEdicao(caminho: string): boolean {
  if (DETALHE_UC.test(caminho)) return false;
  return ROTAS_SO_EDICAO.some((r) => caminho === r || caminho.startsWith(`${r}/`));
}
