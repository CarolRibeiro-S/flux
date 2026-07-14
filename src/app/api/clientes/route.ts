import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('user_id', user.id)
    .order('nome', { ascending: true })

  if (error) {
    console.error('[/api/clientes] Erro ao listar clientes:', error)
    return NextResponse.json({ error: 'Não foi possível listar os clientes' }, { status: 500 })
  }

  return NextResponse.json({ clientes: clientes ?? [] })
}

export async function POST(request: NextRequest) {
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
    .insert({ user_id: user.id, nome: nome.trim() })
    .select('id, nome')
    .single()

  if (error || !cliente) {
    console.error('[/api/clientes] Erro ao criar cliente:', error)
    return NextResponse.json({ error: 'Não foi possível criar o cliente' }, { status: 500 })
  }

  return NextResponse.json({ cliente })
}
