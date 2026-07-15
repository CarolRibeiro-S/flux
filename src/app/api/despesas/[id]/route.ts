import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Recalcula total_amount/period_start/period_end de um lote a partir das
// despesas que ainda restam vinculadas a ele. Mesma lógica de
// /api/reembolso/[id]/despesas — quando uma despesa é excluída direto do
// histórico, o lote a que ela pertencia precisa refletir o novo total.
async function recalcularTotaisLote(
  supabase: SupabaseClient,
  loteId: string,
  clienteId: string
) {
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
    .eq('cliente_id', clienteId)
}

// DELETE /api/despesas/[id]: exclui uma despesa (linha + imagem no Storage),
// reaproveitando a lógica que já existia em FormularioRevisao.tsx, mas agora
// acessível direto do histórico/detalhe, sem precisar entrar na edição.
// Se a despesa estiver vinculada a um lote de reembolso (batch_id), o total
// desse lote é recalculado após a exclusão.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
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

    // Filtro triplo: id + user_id + cliente_id, como em toda a área de despesas.
    // Uma despesa de outro cliente nunca é encontrada aqui.
    const { data: despesa, error: erroDespesa } = await supabase
      .from('expenses')
      .select('id, image_path, batch_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .single()

    if (erroDespesa || !despesa) {
      console.error('[/api/despesas/[id] DELETE] Despesa não encontrada', {
        id,
        userId: user.id,
        clienteId: clienteAtivo.id,
        erroDespesa,
      })
      return NextResponse.json({ error: 'Despesa não encontrada' }, { status: 404 })
    }

    // Se a despesa pertence a um lote já pago, excluí-la alteraria um
    // reembolso tratado como finalizado (mesma regra do DELETE/PATCH de lote e
    // da remoção de despesa de lote). Bloqueia com mensagem clara.
    if (despesa.batch_id) {
      const { data: lote } = await supabase
        .from('reimbursement_batches')
        .select('status')
        .eq('id', despesa.batch_id)
        .eq('cliente_id', clienteAtivo.id)
        .single()

      if (lote?.status === 'pago') {
        return NextResponse.json(
          {
            error:
              'Esta despesa faz parte de um reembolso já pago e não pode ser excluída.',
          },
          { status: 409 }
        )
      }
    }

    // Remove a imagem do Storage antes da linha. Não bloqueia a exclusão da
    // despesa se falhar — preferível um arquivo órfão no Storage a travar a
    // usuária (mesma decisão do DELETE de lote com o PDF).
    if (despesa.image_path) {
      const { error: erroStorage } = await supabase.storage
        .from('receipts')
        .remove([despesa.image_path])

      if (erroStorage) {
        console.error('[/api/despesas/[id] DELETE] Erro ao remover imagem do Storage:', erroStorage)
      }
    }

    const { error: erroExclusao } = await supabase
      .from('expenses')
      .delete()
      .eq('id', despesa.id)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)

    if (erroExclusao) {
      console.error('[/api/despesas/[id] DELETE] Erro ao excluir despesa:', erroExclusao)
      return NextResponse.json({ error: 'Não foi possível excluir a despesa' }, { status: 500 })
    }

    // Recalcula o total do lote só depois de a despesa já ter saído dele
    if (despesa.batch_id) {
      await recalcularTotaisLote(supabase, despesa.batch_id, clienteAtivo.id)
      revalidatePath(`/despesas/reembolso/${despesa.batch_id}`)
      revalidatePath('/despesas/reembolso')
    }

    revalidatePath('/despesas')

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/despesas/[id] DELETE] Erro inesperado', {
      id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível excluir a despesa' }, { status: 500 })
  }
}
