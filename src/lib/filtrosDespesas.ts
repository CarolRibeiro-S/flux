// Filtros compartilhados entre a tela de histórico (/despesas) e a exportação
// CSV (/api/despesas/exportar). A lógica mora num lugar só de propósito: é o
// que garante que o CSV baixado contém exatamente as despesas que a usuária
// está vendo na tela, sem risco de as duas implementações divergirem.

export type FiltrosDespesas = {
  q: string
  de: string
  ate: string
  categoria: string
}

// O PostgREST interpreta vírgula e parênteses como sintaxe do filtro .or() —
// um desses caracteres na busca quebraria a query inteira. O % é curinga do
// ILIKE e faria a busca casar com tudo. Removemos em vez de escapar porque
// nenhum deles é útil buscando por nome de estabelecimento ou observação.
export function sanitizarBusca(termo: string) {
  return termo
    .replace(/[,()\\%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function lerFiltros(params: {
  q?: string
  de?: string
  ate?: string
  categoria?: string
}): FiltrosDespesas {
  return {
    q: (params.q ?? '').trim(),
    de: (params.de ?? '').trim(),
    ate: (params.ate ?? '').trim(),
    categoria: (params.categoria ?? '').trim(),
  }
}

export function temFiltroAtivo(filtros: FiltrosDespesas) {
  return Boolean(filtros.q || filtros.de || filtros.ate || filtros.categoria)
}

// O resumo por categoria usa o período filtrado quando há filtro de data, e
// cai para o mês corrente quando não há — por isso essa distinção é separada
// de temFiltroAtivo.
export function temFiltroDeData(filtros: FiltrosDespesas) {
  return Boolean(filtros.de || filtros.ate)
}

// Monta a query string preservando só os filtros preenchidos, para os links
// que precisam carregar o filtro atual adiante (ex: botão de exportar CSV).
export function filtrosParaQueryString(filtros: FiltrosDespesas) {
  const params = new URLSearchParams()
  if (filtros.q) params.set('q', filtros.q)
  if (filtros.de) params.set('de', filtros.de)
  if (filtros.ate) params.set('ate', filtros.ate)
  if (filtros.categoria) params.set('categoria', filtros.categoria)
  return params.toString()
}

// Interface mínima do query builder do supabase-js usada aqui — evita arrastar
// os genéricos do PostgrestFilterBuilder para dentro deste módulo.
type QueryFiltravel<T> = {
  or(filtro: string): T
  gte(coluna: string, valor: string): T
  lte(coluna: string, valor: string): T
  eq(coluna: string, valor: string): T
}

// ATENÇÃO: esta função aplica APENAS os filtros escolhidos na tela. O
// isolamento por user_id/cliente_id é responsabilidade de quem chama e deve
// ser aplicado SEMPRE, independentemente destes filtros.
export function aplicarFiltrosDespesas<T extends QueryFiltravel<T>>(
  query: T,
  filtros: FiltrosDespesas
): T {
  let resultado = query

  const busca = sanitizarBusca(filtros.q)
  if (busca) {
    resultado = resultado.or(`merchant_name.ilike.%${busca}%,observacoes.ilike.%${busca}%`)
  }
  if (filtros.de) resultado = resultado.gte('expense_date', filtros.de)
  if (filtros.ate) resultado = resultado.lte('expense_date', filtros.ate)
  if (filtros.categoria) resultado = resultado.eq('category', filtros.categoria)

  return resultado
}
