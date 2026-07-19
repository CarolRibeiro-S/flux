import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'

type Updates = {
  category?: string
  precisa_reembolso?: boolean
}

// Limite defensivo: a tela seleciona despesas visíveis na lista, então um
// volume muito acima disso indica chamada manipulada, não uso real.
const MAXIMO_POR_LOTE = 500

// PATCH /api/despesas/lote: aplica a mesma atualização a várias despesas de
// uma vez (edição em massa a partir do histórico). Valida que TODAS as
// despesas pertencem ao cliente ativo antes de alterar qualquer uma.
export async function PATCH(request: NextRequest) {
  try {
    const { expenseIds, updates } = (await request.json()) as {
      expenseIds?: string[]
      updates?: Updates
    }

    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos uma despesa' }, { status: 400 })
    }

    if (expenseIds.length > MAXIMO_POR_LOTE) {
      return NextResponse.json(
        { error: `Selecione no máximo ${MAXIMO_POR_LOTE} despesas por vez` },
        { status: 400 }
      )
    }

    // Monta o objeto de atualização a partir de uma lista fechada de campos:
    // nunca repassa o corpo da requisição direto para o update, senão daria
    // para alterar cliente_id, user_id ou status por esta rota.
    const camposParaAtualizar: Updates = {}

    if (typeof updates?.category === 'string') {
      const categoria = updates.category.trim()
      if (!categoria) {
        return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 })
      }
      camposParaAtualizar.category = categoria
    }

    if (typeof updates?.precisa_reembolso === 'boolean') {
      camposParaAtualizar.precisa_reembolso = updates.precisa_reembolso
    }

    if (Object.keys(camposParaAtualizar).length === 0) {
      return NextResponse.json({ error: 'Nenhuma alteração informada' }, { status: 400 })
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

    // Remove ids repetidos antes de comparar as contagens — um id duplicado no
    // corpo faria a checagem de tamanho falhar sem que nada esteja errado.
    const idsUnicos = [...new Set(expenseIds)]

    // Confirma que toda despesa enviada pertence ao cliente ativo E ao usuário
    const { data: despesas, error: erroBusca } = await supabase
      .from('expenses')
      .select('id')
      .in('id', idsUnicos)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)

    if (erroBusca) {
      console.error('[/api/despesas/lote PATCH] Erro ao buscar despesas:', erroBusca)
      return NextResponse.json({ error: 'Não foi possível atualizar as despesas' }, { status: 500 })
    }

    // Trava de segurança (mesmo padrão de /api/reembolso/criar): se algum id
    // sumiu da busca já filtrada, é porque não pertence ao cliente ativo.
    // Rejeita a operação INTEIRA em vez de aplicar num subconjunto.
    if (!despesas || despesas.length !== idsUnicos.length) {
      console.error('[/api/despesas/lote PATCH] Despesa fora do cliente ativo na seleção', {
        enviadas: idsUnicos.length,
        encontradas: despesas?.length ?? 0,
        clienteId: clienteAtivo.id,
      })
      return NextResponse.json(
        { error: 'Uma ou mais despesas selecionadas não pertencem ao cliente ativo' },
        { status: 403 }
      )
    }

    const { error: erroAtualizacao } = await supabase
      .from('expenses')
      .update(camposParaAtualizar)
      .in('id', idsUnicos)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)

    if (erroAtualizacao) {
      console.error('[/api/despesas/lote PATCH] Erro ao atualizar despesas:', erroAtualizacao)
      return NextResponse.json({ error: 'Não foi possível atualizar as despesas' }, { status: 500 })
    }

    revalidatePath('/despesas')

    return NextResponse.json({ ok: true, atualizadas: idsUnicos.length })
  } catch (error) {
    console.error('[/api/despesas/lote PATCH] Erro inesperado', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível atualizar as despesas' }, { status: 500 })
  }
}
