import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'
import {
  desvincularDespesaDoLote,
  recalcularTotaisLote,
  vincularDespesasAoLote,
} from '@/lib/reembolsoDespesas'

// Vínculo lote <-> despesa vive em reembolso_despesas (muitos-para-muitos):
// as duas rotas abaixo criam/removem LINHAS DE VÍNCULO, nunca alteram a
// despesa em si. Remover uma despesa de um lote não a tira dos outros lotes
// nem do histórico.

// DELETE: remove APENAS o vínculo desta despesa com ESTE lote
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: loteId } = await params

  try {
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

    // Confirma que a despesa é do cliente ativo. O vínculo em si é conferido
    // pelo próprio DELETE (lote_id + despesa_id) — mas checar a despesa aqui
    // garante que um id de outro cliente nunca chegue à tabela de junção.
    const { data: despesa, error: erroDespesa } = await supabase
      .from('expenses')
      .select('id')
      .eq('id', expenseId)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .single()

    if (erroDespesa || !despesa) {
      return NextResponse.json({ error: 'Despesa não encontrada' }, { status: 404 })
    }

    const { erro } = await desvincularDespesaDoLote(supabase, loteId, expenseId)

    if (erro) {
      return NextResponse.json({ error: 'Não foi possível remover a despesa' }, { status: 500 })
    }

    // Recalcula com base nas despesas que restaram NESTE lote
    await recalcularTotaisLote(supabase, loteId, clienteAtivo.id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/reembolso/[id]/despesas DELETE] Erro inesperado', {
      loteId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível remover a despesa' }, { status: 500 })
  }
}

// POST: adiciona despesas a um lote já existente
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: loteId } = await params

  try {
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

    // Só aceita despesas do cliente ativo marcadas como precisando de
    // reembolso. NÃO há mais checagem de "despesa ainda sem lote": qualquer
    // despesa do cliente pode entrar em qualquer lote dele, mesmo já estando
    // em outros (relação muitos-para-muitos).
    const idsUnicos = [...new Set(expenseIds)]

    const { data: despesas, error: erroBusca } = await supabase
      .from('expenses')
      .select('id')
      .in('id', idsUnicos)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .eq('precisa_reembolso', true)

    if (erroBusca || !despesas || despesas.length === 0) {
      return NextResponse.json({ error: 'Despesas não encontradas' }, { status: 404 })
    }

    // Trava de segurança redundante, mesmo padrão de /api/reembolso/criar: se
    // algum id sumiu da busca filtrada, é porque não pertence ao cliente ativo
    // — rejeita tudo em vez de seguir parcial.
    if (despesas.length !== idsUnicos.length) {
      console.error(
        '[/api/reembolso/[id]/despesas POST] Uma ou mais despesas não podem ser adicionadas a este lote',
        { expenseIds: idsUnicos, encontradas: despesas.map((d) => d.id), clienteId: clienteAtivo.id }
      )
      return NextResponse.json(
        { error: 'Uma ou mais despesas selecionadas não podem ser adicionadas a este lote' },
        { status: 403 }
      )
    }

    const idsEncontrados = despesas.map((despesa) => despesa.id)

    // vincularDespesasAoLote ignora as que já estão neste lote, então
    // reenviar uma despesa já incluída é um no-op e não duplica o total.
    const { erro: erroVinculo } = await vincularDespesasAoLote(supabase, loteId, idsEncontrados)

    if (erroVinculo) {
      return NextResponse.json({ error: 'Não foi possível adicionar as despesas' }, { status: 500 })
    }

    await recalcularTotaisLote(supabase, loteId, clienteAtivo.id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/reembolso/[id]/despesas POST] Erro inesperado', {
      loteId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível adicionar as despesas' }, { status: 500 })
  }
}
