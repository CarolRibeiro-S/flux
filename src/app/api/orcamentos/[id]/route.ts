import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'

// Confirma que o orçamento existe E pertence ao cliente ativo do usuário
// logado. Todas as rotas abaixo passam por aqui antes de alterar qualquer
// coisa — nunca confiam só no id vindo da URL.
async function carregarContexto(id: string) {
  let clienteAtivo
  try {
    clienteAtivo = await obterClienteAtivoApi()
  } catch (error) {
    if (error instanceof ClienteAtivoInvalidoError) {
      return {
        erro: NextResponse.json({ error: 'Nenhum cliente ativo selecionado.' }, { status: 400 }),
      } as const
    }
    throw error
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) } as const
  }

  const { data: orcamento, error } = await supabase
    .from('orcamentos')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (error || !orcamento) {
    console.error('[/api/orcamentos/[id]] Orçamento não encontrado', {
      id,
      userId: user.id,
      clienteId: clienteAtivo.id,
      error,
    })
    return { erro: NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 }) } as const
  }

  return { supabase, user, clienteAtivo } as const
}

// PATCH /api/orcamentos/[id]: altera o valor limite e/ou a categoria.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const { categoria, valor_limite } = (await request.json()) as {
      categoria?: string
      valor_limite?: number
    }

    // Lista fechada de campos atualizáveis: mes_referencia, cliente_id e
    // user_id nunca podem ser alterados por esta rota.
    const camposParaAtualizar: { categoria?: string; valor_limite?: number } = {}

    if (typeof categoria === 'string') {
      const categoriaLimpa = categoria.trim()
      if (!categoriaLimpa) {
        return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 })
      }
      camposParaAtualizar.categoria = categoriaLimpa
    }

    if (valor_limite !== undefined) {
      if (typeof valor_limite !== 'number' || !Number.isFinite(valor_limite) || valor_limite <= 0) {
        return NextResponse.json(
          { error: 'Informe um valor limite maior que zero' },
          { status: 400 }
        )
      }
      camposParaAtualizar.valor_limite = valor_limite
    }

    if (Object.keys(camposParaAtualizar).length === 0) {
      return NextResponse.json({ error: 'Nenhuma alteração informada' }, { status: 400 })
    }

    const contexto = await carregarContexto(id)
    if ('erro' in contexto) return contexto.erro

    const { supabase, user, clienteAtivo } = contexto

    const { data: orcamento, error } = await supabase
      .from('orcamentos')
      .update(camposParaAtualizar)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .select('id, categoria, valor_limite, mes_referencia')
      .single()

    if (error || !orcamento) {
      console.error('[/api/orcamentos/[id] PATCH] Erro ao atualizar orçamento:', error)
      return NextResponse.json({ error: 'Não foi possível atualizar o orçamento' }, { status: 500 })
    }

    revalidatePath('/orcamento')

    return NextResponse.json({ orcamento })
  } catch (error) {
    console.error('[/api/orcamentos/[id] PATCH] Erro inesperado', {
      id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível atualizar o orçamento' }, { status: 500 })
  }
}

// DELETE /api/orcamentos/[id]: remove o limite daquela categoria/mês.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const contexto = await carregarContexto(id)
    if ('erro' in contexto) return contexto.erro

    const { supabase, user, clienteAtivo } = contexto

    const { error } = await supabase
      .from('orcamentos')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)

    if (error) {
      console.error('[/api/orcamentos/[id] DELETE] Erro ao excluir orçamento:', error)
      return NextResponse.json({ error: 'Não foi possível excluir o orçamento' }, { status: 500 })
    }

    revalidatePath('/orcamento')

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[/api/orcamentos/[id] DELETE] Erro inesperado', {
      id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível excluir o orçamento' }, { status: 500 })
  }
}
