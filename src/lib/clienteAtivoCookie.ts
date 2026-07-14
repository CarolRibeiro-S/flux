// Nome do cookie compartilhado entre client e server. É de propósito NÃO
// httpOnly: precisa ser gravado a partir de um Client Component (tela de
// seleção de cliente) e também lido no servidor (proxy, Server Components,
// Route Handlers) a cada requisição.
export const COOKIE_CLIENTE_ATIVO = 'cliente_ativo_id'

const UM_ANO_EM_SEGUNDOS = 60 * 60 * 24 * 365

// Grava o cliente ativo no cookie a partir do browser (document.cookie).
// Só deve ser chamada em Client Components.
export function definirClienteAtivoCookie(clienteId: string) {
  document.cookie = `${COOKIE_CLIENTE_ATIVO}=${clienteId}; path=/; max-age=${UM_ANO_EM_SEGUNDOS}; SameSite=Lax`
}

// Lê o cliente ativo diretamente do document.cookie. Usada por Client
// Components que precisam incluir o filtro por cliente_id em mutações
// feitas via browser (ex: confirmar/descartar despesa em FormularioRevisao).
// Não deve ser usada para decidir o que é seguro mostrar: o servidor sempre
// revalida a posse do cliente no banco através de obterClienteAtivo().
export function lerClienteAtivoIdCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_CLIENTE_ATIVO}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}
