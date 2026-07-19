import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'
import {
  buscarLotesDaDespesa,
  desvincularDespesaDeTodosOsLotes,
  recalcularTotaisLote,
} from '@/lib/reembolsoDespesas'

// DELETE /api/despesas/[id]: exclui uma despesa (linha + imagem no Storage),
// reaproveitando a lógica que já existia em FormularioRevisao.tsx, mas agora
// acessível direto do histórico/detalhe, sem precisar entrar na edição.
//
// Como a relação com lotes virou muitos-para-muitos, a despesa pode estar em
// VÁRIOS reembolsos ao mesmo tempo — todos precisam ser recalculados depois
// da exclusão, não apenas um.
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
      .select('id, image_path')
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

    // Levanta TODOS os lotes que contêm esta despesa ANTES de excluí-la —
    // depois da exclusão os vínculos já não existem para serem consultados.
    const lotesRelacionados = await buscarLotesDaDespesa(
      supabase,
      despesa.id,
      clienteAtivo.id,
      user.id
    )

    // Basta UM lote pago para bloquear: excluir a despesa alteraria o total de
    // um reembolso tratado como finalizado (mesma regra do DELETE/PATCH de
    // lote e da remoção de despesa de lote).
    const lotePago = lotesRelacionados.find((lote) => lote.status === 'pago')
    if (lotePago) {
      return NextResponse.json(
        {
          error:
            'Esta despesa faz parte de um reembolso já pago e não pode ser excluída.',
        },
        { status: 409 }
      )
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

    // Remove os vínculos antes da despesa, para não depender de um
    // ON DELETE CASCADE a partir de expenses (o cascade garantido é o de
    // reimbursement_batches). Se ele existir, isto é apenas um no-op.
    await desvincularDespesaDeTodosOsLotes(supabase, despesa.id)

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

    // Recalcula TODOS os lotes que continham a despesa — não apenas um, já que
    // a relação é muitos-para-muitos.
    for (const lote of lotesRelacionados) {
      await recalcularTotaisLote(supabase, lote.id, clienteAtivo.id)
      revalidatePath(`/despesas/reembolso/${lote.id}`)
    }

    if (lotesRelacionados.length > 0) {
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
