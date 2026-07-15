import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'

const STATUS_PERMITIDOS = ['aberto', 'enviado', 'pago'] as const

// DELETE /api/reembolso/[id]: exclui o lote inteiro, devolvendo as despesas
// vinculadas para o histórico/seleção (batch_id = null) antes de excluir a
// linha do lote, e removendo o PDF gerado do Storage se existir.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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

  // Filtro triplo: id + user_id + cliente_id, como em toda a área de reembolso
  const { data: lote, error: erroLote } = await supabase
    .from('reimbursement_batches')
    .select('id, status, pdf_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (erroLote || !lote) {
    return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 })
  }

  // Reembolso já pago é tratado como finalizado: excluí-lo apagaria um
  // registro de algo que já efetivamente aconteceu. Ver explicação completa
  // na resposta ao usuário sobre por que isso é bloqueado.
  if (lote.status === 'pago') {
    return NextResponse.json(
      { error: 'Reembolso já marcado como pago não pode mais ser excluído' },
      { status: 409 }
    )
  }

  // Libera as despesas de volta para o histórico/seleção ANTES de excluir o
  // lote — nunca deixa uma despesa presa a um batch_id que deixou de existir.
  const { error: erroLiberar } = await supabase
    .from('expenses')
    .update({ batch_id: null })
    .eq('batch_id', lote.id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)

  if (erroLiberar) {
    console.error('[/api/reembolso/[id]] Erro ao liberar despesas do lote:', erroLiberar)
    return NextResponse.json({ error: 'Não foi possível excluir o reembolso' }, { status: 500 })
  }

  if (lote.pdf_path) {
    // Client admin: o bucket "reimbursements" já é manipulado via admin em
    // /api/reembolso/[id]/pdf (upload), a remoção segue o mesmo padrão.
    const supabaseAdmin = createAdminClient()
    const { error: erroStorage } = await supabaseAdmin.storage
      .from('reimbursements')
      .remove([lote.pdf_path])

    // Não bloqueia a exclusão do lote por causa disso — só loga. Preferível
    // deixar um arquivo órfão no Storage a travar o usuário numa exclusão
    // que já desvinculou as despesas com sucesso.
    if (erroStorage) {
      console.error('[/api/reembolso/[id]] Erro ao remover PDF do Storage:', erroStorage)
    }
  }

  const { error: erroExclusao } = await supabase
    .from('reimbursement_batches')
    .delete()
    .eq('id', lote.id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)

  if (erroExclusao) {
    console.error('[/api/reembolso/[id]] Erro ao excluir lote:', erroExclusao)
    return NextResponse.json({ error: 'Não foi possível excluir o reembolso' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// PATCH /api/reembolso/[id]: atualiza o status do lote. Também é o
// mecanismo usado para "reabrir" um lote marcado como pago por engano (ver
// explicação sobre reversibilidade na resposta ao usuário) — por isso, ao
// contrário do DELETE e da rota de despesas, esta rota NÃO bloqueia a
// alteração quando o status atual já é "pago".
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { status } = (await request.json()) as { status?: string }

  if (!status || !STATUS_PERMITIDOS.includes(status as (typeof STATUS_PERMITIDOS)[number])) {
    return NextResponse.json(
      { error: `Status inválido. Use um de: ${STATUS_PERMITIDOS.join(', ')}` },
      { status: 400 }
    )
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

  const { data: loteExistente, error: erroBusca } = await supabase
    .from('reimbursement_batches')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (erroBusca || !loteExistente) {
    return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 })
  }

  const { data: lote, error: erroAtualizacao } = await supabase
    .from('reimbursement_batches')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .select('id, status')
    .single()

  if (erroAtualizacao || !lote) {
    console.error('[/api/reembolso/[id]] Erro ao atualizar status do lote:', erroAtualizacao)
    return NextResponse.json({ error: 'Não foi possível atualizar o status' }, { status: 500 })
  }

  return NextResponse.json({ lote })
}
