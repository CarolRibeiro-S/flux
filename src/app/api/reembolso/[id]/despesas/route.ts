import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Recalcula total_amount/period_start/period_end do lote a partir das
// despesas que ainda restam vinculadas a ele. Se não sobrar nenhuma, o lote
// fica com total zero e período nulo, mas continua existindo — decisão
// explicada na resposta ao usuário (excluir automaticamente seria
// destrutivo demais como efeito colateral de remover um único item).
async function recalcularTotais(supabase: SupabaseClient, loteId: string, clienteId: string) {
  const { data: despesasRestantes } = await supabase
    .from('expenses')
    .select('amount, expense_date')
    .eq('batch_id', loteId)
    .eq('cliente_id', clienteId)

  const lista = despesasRestantes ?? []

  const datas = lista
    .map((despesa) => despesa.expense_date as string | null)
    .filter((data): data is string => Boolean(data))
    .sort()

  const totalAmount = lista.reduce((soma, despesa) => soma + (despesa.amount ?? 0), 0)

  await supabase
    .from('reimbursement_batches')
    .update({
      total_amount: totalAmount,
      period_start: datas[0] ?? null,
      period_end: datas[datas.length - 1] ?? null,
    })
    .eq('id', loteId)
}

// DELETE: remove APENAS uma despesa do lote (não exclui o lote)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: loteId } = await params
  const { expenseId } = (await request.json()) as { expenseId?: string }

  if (!expenseId) {
    return NextResponse.json({ error: 'expenseId é obrigatório' }, { status: 400 })
  }

  let clienteAtivo
  try {
    clienteAtivo = await obterClienteAtivoApi()
  } catch (error) {
    if (error instanceof ClienteAtivoInvalidoError) {
      return NextResponse.json({ error: 'Nenhum cliente ativo selecionado.' }, { status: 400 })
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

  // Confirma que o lote é do cliente ativo antes de qualquer alteração
  const { data: lote, error: erroLote } = await supabase
    .from('reimbursement_batches')
    .select('id, status')
    .eq('id', loteId)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (erroLote || !lote) {
    return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 })
  }

  if (lote.status === 'pago') {
    return NextResponse.json(
      { error: 'Reembolso já marcado como pago não pode mais ser editado' },
      { status: 409 }
    )
  }

  // Confirma que a despesa realmente pertence a este lote E ao cliente
  // ativo antes de desvinculá-la — nunca confia só no id vindo do front-end.
  const { data: despesa, error: erroDespesa } = await supabase
    .from('expenses')
    .select('id')
    .eq('id', expenseId)
    .eq('batch_id', loteId)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (erroDespesa || !despesa) {
    return NextResponse.json({ error: 'Despesa não encontrada neste lote' }, { status: 404 })
  }

  const { error: erroRemocao } = await supabase
    .from('expenses')
    .update({ batch_id: null })
    .eq('id', expenseId)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)

  if (erroRemocao) {
    console.error('[/api/reembolso/[id]/despesas] Erro ao remover despesa do lote:', erroRemocao)
    return NextResponse.json({ error: 'Não foi possível remover a despesa' }, { status: 500 })
  }

  await recalcularTotais(supabase, loteId, clienteAtivo.id)

  return NextResponse.json({ ok: true })
}

// POST: adiciona despesas extras a um lote já existente
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: loteId } = await params
  const { expenseIds } = (await request.json()) as { expenseIds?: string[] }

  if (!expenseIds || expenseIds.length === 0) {
    return NextResponse.json({ error: 'Selecione ao menos uma despesa' }, { status: 400 })
  }

  let clienteAtivo
  try {
    clienteAtivo = await obterClienteAtivoApi()
  } catch (error) {
    if (error instanceof ClienteAtivoInvalidoError) {
      return NextResponse.json({ error: 'Nenhum cliente ativo selecionado.' }, { status: 400 })
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

  const { data: lote, error: erroLote } = await supabase
    .from('reimbursement_batches')
    .select('id, status')
    .eq('id', loteId)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (erroLote || !lote) {
    return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 })
  }

  if (lote.status === 'pago') {
    return NextResponse.json(
      { error: 'Reembolso já marcado como pago não pode mais ser editado' },
      { status: 409 }
    )
  }

  // Só aceita despesas do mesmo cliente ativo, marcadas como precisando de
  // reembolso, e que ainda não têm batch_id — nunca confia só no filtro já
  // aplicado na tela (reembolso/novo e reembolso/[id]/adicionar)
  const { data: despesas, error: erroBusca } = await supabase
    .from('expenses')
    .select('id')
    .in('id', expenseIds)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .eq('precisa_reembolso', true)
    .is('batch_id', null)

  if (erroBusca || !despesas || despesas.length === 0) {
    return NextResponse.json({ error: 'Despesas não encontradas' }, { status: 404 })
  }

  // Trava de segurança redundante, mesmo padrão de /api/reembolso/criar: se
  // algum id sumiu da busca filtrada, é porque não pertence ao cliente ativo
  // ou já está vinculado a outro lote — rejeita tudo em vez de seguir parcial.
  if (despesas.length !== expenseIds.length) {
    console.error(
      '[/api/reembolso/[id]/despesas] Uma ou mais despesas não podem ser adicionadas a este lote',
      { expenseIds, encontradas: despesas.map((d) => d.id), clienteId: clienteAtivo.id }
    )
    return NextResponse.json(
      { error: 'Uma ou mais despesas selecionadas não podem ser adicionadas a este lote' },
      { status: 403 }
    )
  }

  const idsEncontrados = despesas.map((despesa) => despesa.id)

  const { error: erroVinculo } = await supabase
    .from('expenses')
    .update({ batch_id: loteId })
    .in('id', idsEncontrados)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)

  if (erroVinculo) {
    console.error('[/api/reembolso/[id]/despesas] Erro ao adicionar despesas ao lote:', erroVinculo)
    return NextResponse.json({ error: 'Não foi possível adicionar as despesas' }, { status: 500 })
  }

  await recalcularTotais(supabase, loteId, clienteAtivo.id)

  return NextResponse.json({ ok: true })
}
