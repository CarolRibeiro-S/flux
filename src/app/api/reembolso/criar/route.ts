import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'
import { vincularDespesasAoLote } from '@/lib/reembolsoDespesas'

export async function POST(request: NextRequest) {
  const { expenseIds } = (await request.json()) as { expenseIds?: string[] }

  if (!expenseIds || expenseIds.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos uma despesa' }, { status: 400 })
  }

  // Nunca redireciona (ver comentário em obterClienteAtivoApi): responde
  // com JSON de erro para o front-end conseguir interpretar
  let clienteAtivo
  try {
    clienteAtivo = await obterClienteAtivoApi()
  } catch (error) {
    if (error instanceof ClienteAtivoInvalidoError) {
      return NextResponse.json(
        { error: 'Nenhum cliente ativo selecionado. Selecione um cliente e tente novamente.' },
        { status: 400 }
      )
    }
    throw error
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    // Filtra também por user_id e cliente_id como reforço de segurança além
    // do RLS, e por precisa_reembolso = true — nunca confia só no filtro já
    // aplicado na tela (despesas pagas no cartão da casa não entram em lote)
    const { data: despesas, error: erroBusca } = await supabase
      .from('expenses')
      .select('id, amount, expense_date')
      .in('id', expenseIds)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .eq('precisa_reembolso', true)

    if (erroBusca || !despesas || despesas.length === 0) {
      console.error('[/api/reembolso/criar] Erro ao buscar despesas:', erroBusca)
      return NextResponse.json({ error: 'Despesas não encontradas' }, { status: 404 })
    }

    // Trava de segurança redundante: todas as despesas selecionadas precisam
    // ter sido encontradas na busca já filtrada por cliente_id acima. Se
    // algum id sumiu, é porque pertence a outro cliente (ou não existe) —
    // rejeita a operação inteira em vez de seguir com um subconjunto.
    if (despesas.length !== expenseIds.length) {
      console.error(
        '[/api/reembolso/criar] Uma ou mais despesas selecionadas não pertencem ao cliente ativo',
        { expenseIds, encontradas: despesas.map((d) => d.id), clienteId: clienteAtivo.id }
      )
      return NextResponse.json(
        { error: 'Uma ou mais despesas selecionadas não pertencem ao cliente ativo' },
        { status: 403 }
      )
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
        cliente_id: clienteAtivo.id,
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

    // Vínculo agora é feito em reembolso_despesas (uma linha por despesa), e
    // não mais escrevendo expenses.batch_id. Isso é o que permite a mesma
    // despesa participar de vários lotes ao mesmo tempo.
    const { erro: erroVinculo } = await vincularDespesasAoLote(supabase, lote.id, idsEncontrados)

    if (erroVinculo) {
      console.error('[/api/reembolso/criar] Erro ao vincular despesas ao lote, desfazendo criação')
      // Sem suporte a transação no client do supabase-js: desfaz o lote criado
      // manualmente para não deixar um lote órfão sem despesas vinculadas.
      // Os vínculos porventura criados somem junto pelo ON DELETE CASCADE.
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
