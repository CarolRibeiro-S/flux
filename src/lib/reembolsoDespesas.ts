import { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Vínculo entre lotes de reembolso e despesas (relação muitos-para-muitos).
//
// A tabela reembolso_despesas (lote_id, despesa_id) é a ÚNICA fonte de verdade
// sobre quais despesas pertencem a quais lotes. A coluna expenses.batch_id foi
// aposentada: continua existindo no banco por segurança, mas não é lida nem
// escrita em lugar nenhum do código.
//
// Uma mesma despesa pode estar em vários lotes ao mesmo tempo, então nada
// aqui pode assumir "um lote por despesa".
//
// ISOLAMENTO POR CLIENTE: reembolso_despesas não tem coluna cliente_id — ela
// só guarda os dois ids. Por isso toda leitura desta tabela é sempre cruzada
// com uma consulta em expenses ou reimbursement_batches que FILTRA por
// cliente_id. Nunca devolvemos dados vindos apenas da tabela de junção.

// Ids das despesas vinculadas a um lote. Não filtra por cliente aqui: quem
// chama sempre cruza esses ids com uma query em expenses filtrada por
// cliente_id (ver buscarDespesasDoLote).
export async function buscarIdsDespesasDoLote(
  supabase: SupabaseClient,
  loteId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('reembolso_despesas')
    .select('despesa_id')
    .eq('lote_id', loteId)

  if (error) {
    console.error('[reembolsoDespesas] Erro ao buscar vínculos do lote:', { loteId, error })
    return []
  }

  return (data ?? []).map((vinculo) => vinculo.despesa_id as string)
}

// Despesas de um lote, já filtradas por cliente_id. `colunas` permite pedir só
// o que cada tela precisa (a listagem do detalhe pede pouco, o PDF pede tudo).
export async function buscarDespesasDoLote<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  loteId: string,
  clienteId: string,
  colunas: string
): Promise<T[]> {
  const idsDespesas = await buscarIdsDespesasDoLote(supabase, loteId)

  // Sem vínculos não há o que buscar — e um .in() com lista vazia devolveria
  // resultado vazio de qualquer forma, então evitamos a ida ao banco.
  if (idsDespesas.length === 0) return []

  const { data, error } = await supabase
    .from('expenses')
    .select(colunas)
    .in('id', idsDespesas)
    .eq('cliente_id', clienteId)
    .order('expense_date', { ascending: true })

  if (error) {
    console.error('[reembolsoDespesas] Erro ao buscar despesas do lote:', { loteId, error })
    return []
  }

  return (data ?? []) as T[]
}

// Recalcula total_amount/period_start/period_end de um lote a partir das
// despesas que AINDA estão vinculadas a ele. Se não sobrar nenhuma, o lote
// fica zerado com período nulo, mas continua existindo — excluí-lo
// automaticamente seria destrutivo demais como efeito colateral.
//
// As duas leituras abaixo são feitas aqui (em vez de reusar
// buscarDespesasDoLote) porque esta função precisa DISTINGUIR "nenhuma
// despesa vinculada" de "a consulta falhou". Os helpers de leitura devolvem
// lista vazia em caso de erro, o que é aceitável para exibir uma tela, mas
// aqui zeraria o total de um reembolso por causa de uma falha transitória de
// rede. Em caso de erro, aborta e deixa o total anterior intacto.
export async function recalcularTotaisLote(
  supabase: SupabaseClient,
  loteId: string,
  clienteId: string
) {
  const { data: vinculos, error: erroVinculos } = await supabase
    .from('reembolso_despesas')
    .select('despesa_id')
    .eq('lote_id', loteId)

  if (erroVinculos) {
    console.error('[reembolsoDespesas] Recálculo abortado: falha ao ler vínculos', {
      loteId,
      erroVinculos,
    })
    return
  }

  const idsDespesas = (vinculos ?? []).map((vinculo) => vinculo.despesa_id as string)

  let totalAmount = 0
  let datas: string[] = []

  // Lista vazia é um estado legítimo (a última despesa foi removida do lote),
  // e aí o lote realmente deve ficar zerado.
  if (idsDespesas.length > 0) {
    const { data: despesas, error: erroDespesas } = await supabase
      .from('expenses')
      .select('amount, expense_date')
      .in('id', idsDespesas)
      .eq('cliente_id', clienteId)

    if (erroDespesas) {
      console.error('[reembolsoDespesas] Recálculo abortado: falha ao ler despesas', {
        loteId,
        erroDespesas,
      })
      return
    }

    const lista = despesas ?? []
    totalAmount = lista.reduce((soma, despesa) => soma + (despesa.amount ?? 0), 0)
    datas = lista
      .map((despesa) => despesa.expense_date as string | null)
      .filter((data): data is string => Boolean(data))
      .sort()
  }

  const { error } = await supabase
    .from('reimbursement_batches')
    .update({
      total_amount: totalAmount,
      period_start: datas[0] ?? null,
      period_end: datas[datas.length - 1] ?? null,
    })
    .eq('id', loteId)
    .eq('cliente_id', clienteId)

  if (error) {
    console.error('[reembolsoDespesas] Erro ao gravar totais recalculados:', { loteId, error })
  }
}

// TODOS os lotes do cliente ativo que contêm uma despesa, com o status de
// cada um. Usado ao excluir uma despesa: como ela pode estar em vários lotes,
// todos precisam ser verificados (nenhum pode estar pago) e recalculados.
export async function buscarLotesDaDespesa(
  supabase: SupabaseClient,
  despesaId: string,
  clienteId: string,
  userId: string
): Promise<
  { id: string; status: string; period_start: string | null; period_end: string | null }[]
> {
  const { data: vinculos, error } = await supabase
    .from('reembolso_despesas')
    .select('lote_id')
    .eq('despesa_id', despesaId)

  if (error) {
    console.error('[reembolsoDespesas] Erro ao buscar lotes da despesa:', { despesaId, error })
    return []
  }

  const loteIds = (vinculos ?? []).map((vinculo) => vinculo.lote_id as string)
  if (loteIds.length === 0) return []

  // Confirma no banco que esses lotes são mesmo do cliente ativo antes de
  // devolvê-los — a tabela de junção sozinha não garante isolamento.
  const { data: lotes } = await supabase
    .from('reimbursement_batches')
    .select('id, status, period_start, period_end')
    .in('id', loteIds)
    .eq('user_id', userId)
    .eq('cliente_id', clienteId)
    .order('period_end', { ascending: false })

  return (lotes ?? []).map((lote) => ({
    id: lote.id as string,
    status: lote.status as string,
    period_start: lote.period_start as string | null,
    period_end: lote.period_end as string | null,
  }))
}

// Remove os vínculos de uma despesa com TODOS os lotes. Chamado antes de
// excluir a despesa em si: o ON DELETE CASCADE garantido é o de
// reimbursement_batches -> reembolso_despesas; não dependemos de existir um
// cascade equivalente a partir de expenses, senão a exclusão de uma despesa
// poderia deixar vínculos órfãos apontando para uma linha que sumiu.
export async function desvincularDespesaDeTodosOsLotes(
  supabase: SupabaseClient,
  despesaId: string
): Promise<{ erro: boolean }> {
  const { error } = await supabase
    .from('reembolso_despesas')
    .delete()
    .eq('despesa_id', despesaId)

  if (error) {
    console.error('[reembolsoDespesas] Erro ao desvincular despesa de todos os lotes:', {
      despesaId,
      error,
    })
    return { erro: true }
  }

  return { erro: false }
}

// Quantos lotes do cliente ativo contêm cada despesa. Alimenta o indicador
// "já incluída em N reembolso(s)" nas telas de seleção.
export async function contarLotesPorDespesa(
  supabase: SupabaseClient,
  despesaIds: string[],
  clienteId: string,
  userId: string
): Promise<Record<string, number>> {
  if (despesaIds.length === 0) return {}

  // Restringe aos lotes do cliente ativo antes de contar: um vínculo de outro
  // cliente jamais pode influenciar o número exibido aqui.
  const { data: lotes } = await supabase
    .from('reimbursement_batches')
    .select('id')
    .eq('user_id', userId)
    .eq('cliente_id', clienteId)

  const loteIds = (lotes ?? []).map((lote) => lote.id as string)
  if (loteIds.length === 0) return {}

  const { data: vinculos, error } = await supabase
    .from('reembolso_despesas')
    .select('despesa_id')
    .in('lote_id', loteIds)
    .in('despesa_id', despesaIds)

  if (error) {
    console.error('[reembolsoDespesas] Erro ao contar lotes por despesa:', error)
    return {}
  }

  const contagem: Record<string, number> = {}
  for (const vinculo of vinculos ?? []) {
    const id = vinculo.despesa_id as string
    contagem[id] = (contagem[id] ?? 0) + 1
  }

  return contagem
}

// Vincula despesas a um lote, ignorando as que já estão vinculadas. Sem esse
// cuidado, adicionar duas vezes a mesma despesa criaria linhas duplicadas na
// junção e o total do lote contaria o valor dela em dobro.
export async function vincularDespesasAoLote(
  supabase: SupabaseClient,
  loteId: string,
  despesaIds: string[]
): Promise<{ erro: boolean; vinculadas: number }> {
  const jaVinculadas = new Set(await buscarIdsDespesasDoLote(supabase, loteId))
  const novas = despesaIds.filter((id) => !jaVinculadas.has(id))

  // Todas já estavam no lote: nada a fazer, e isso não é um erro.
  if (novas.length === 0) return { erro: false, vinculadas: 0 }

  const { error } = await supabase
    .from('reembolso_despesas')
    .insert(novas.map((despesaId) => ({ lote_id: loteId, despesa_id: despesaId })))

  if (error) {
    console.error('[reembolsoDespesas] Erro ao vincular despesas ao lote:', { loteId, error })
    return { erro: true, vinculadas: 0 }
  }

  return { erro: false, vinculadas: novas.length }
}

// Remove UMA despesa de UM lote. Não toca na despesa em si nem nos vínculos
// dela com outros lotes.
export async function desvincularDespesaDoLote(
  supabase: SupabaseClient,
  loteId: string,
  despesaId: string
): Promise<{ erro: boolean }> {
  const { error } = await supabase
    .from('reembolso_despesas')
    .delete()
    .eq('lote_id', loteId)
    .eq('despesa_id', despesaId)

  if (error) {
    console.error('[reembolsoDespesas] Erro ao desvincular despesa do lote:', {
      loteId,
      despesaId,
      error,
    })
    return { erro: true }
  }

  return { erro: false }
}
