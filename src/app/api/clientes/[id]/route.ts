import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { nome } = (await request.json()) as { nome?: string }

  if (!nome || !nome.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: cliente, error } = await supabase
    .from('clientes')
    .update({ nome: nome.trim() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, nome')
    .single()

  if (error || !cliente) {
    console.error('[/api/clientes/[id]] Erro ao editar cliente:', error)
    return NextResponse.json({ error: 'Não foi possível editar o cliente' }, { status: 500 })
  }

  return NextResponse.json({ cliente })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const confirmado = new URL(request.url).searchParams.get('confirmar') === 'true'

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  // Confirma que o cliente é do próprio usuário antes de qualquer alteração
  const { data: cliente, error: erroCliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (erroCliente || !cliente) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  const { count } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', id)
    .eq('user_id', user.id)

  const despesasVinculadas = count ?? 0

  // Se há despesas vinculadas e a exclusão ainda não foi confirmada
  // explicitamente, avisa e pede confirmação antes de excluir de vez
  if (despesasVinculadas > 0 && !confirmado) {
    return NextResponse.json(
      {
        precisaConfirmar: true,
        despesasVinculadas,
        mensagem: `Este cliente tem ${despesasVinculadas} despesa(s) vinculada(s). Elas ficarão sem cliente (cliente_id = null) se você continuar.`,
      },
      { status: 409 }
    )
  }

  if (despesasVinculadas > 0) {
    const { error: erroDesvincular } = await supabase
      .from('expenses')
      .update({ cliente_id: null })
      .eq('cliente_id', id)
      .eq('user_id', user.id)

    if (erroDesvincular) {
      console.error('[/api/clientes/[id]] Erro ao desvincular despesas:', erroDesvincular)
      return NextResponse.json({ error: 'Não foi possível desvincular as despesas' }, { status: 500 })
    }
  }

  const { error: erroExclusao } = await supabase
    .from('clientes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (erroExclusao) {
    console.error('[/api/clientes/[id]] Erro ao excluir cliente:', erroExclusao)
    return NextResponse.json({ error: 'Não foi possível excluir o cliente' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
