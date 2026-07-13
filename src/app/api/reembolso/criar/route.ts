import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { expenseIds } = (await request.json()) as { expenseIds?: string[] }

  if (!expenseIds || expenseIds.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos uma despesa' }, { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    // Filtra também por user_id como reforço de segurança além do RLS
    const { data: despesas, error: erroBusca } = await supabase
      .from('expenses')
      .select('id, amount, expense_date')
      .in('id', expenseIds)
      .eq('user_id', user.id)

    if (erroBusca || !despesas || despesas.length === 0) {
      console.error('[/api/reembolso/criar] Erro ao buscar despesas:', erroBusca)
      return NextResponse.json({ error: 'Despesas não encontradas' }, { status: 404 })
    }

    const datas = despesas
      .map((despesa) => despesa.expense_date as string | null)
      .filter((data): data is string => Boolean(data))
      .sort()

    const periodStart = datas[0] ?? null
    const periodEnd = datas[datas.length - 1] ?? null
    const totalAmount = despesas.reduce((soma, despesa) => soma + (despesa.amount ?? 0), 0)

    const { data: lote, error: erroLote } = await supabase
      .from('reimbursement_batches')
      .insert({
        user_id: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        total_amount: totalAmount,
        status: 'aberto',
      })
      .select('id')
      .single()

    if (erroLote || !lote) {
      console.error('[/api/reembolso/criar] Erro ao criar lote:', erroLote)
      return NextResponse.json({ error: 'Não foi possível criar o reembolso' }, { status: 500 })
    }

    const idsEncontrados = despesas.map((despesa) => despesa.id)

    const { error: erroAtualizacao } = await supabase
      .from('expenses')
      .update({ batch_id: lote.id })
      .in('id', idsEncontrados)
      .eq('user_id', user.id)

    if (erroAtualizacao) {
      console.error(
        '[/api/reembolso/criar] Erro ao vincular despesas ao lote, desfazendo criação:',
        erroAtualizacao
      )
      // Sem suporte a transação no client do supabase-js: desfaz o lote criado
      // manualmente para não deixar um lote órfão sem despesas vinculadas.
      await supabase.from('reimbursement_batches').delete().eq('id', lote.id)
      return NextResponse.json({ error: 'Não foi possível criar o reembolso' }, { status: 500 })
    }

    return NextResponse.json({ id: lote.id })
  } catch (error) {
    console.error('[/api/reembolso/criar] Erro inesperado', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível criar o reembolso' }, { status: 500 })
  }
}
