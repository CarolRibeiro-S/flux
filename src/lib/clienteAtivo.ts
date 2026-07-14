import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { COOKIE_CLIENTE_ATIVO } from './clienteAtivoCookie'

export type ClienteAtivo = {
  id: string
  nome: string
}

// Função central usada por TODA página/rota que busca despesas ou lotes de
// reembolso. Lê o cookie "cliente_ativo_id", confirma no banco que esse
// cliente realmente existe e pertence ao usuário logado — nunca confia
// apenas na presença do cookie — e devolve o cliente completo. Se o cookie
// estiver ausente ou apontar pra um cliente inexistente/de outro usuário,
// redireciona para /selecionar-cliente. Funciona tanto em Server Components
// quanto em Route Handlers: o `redirect` do Next serve um 307/303 nos dois casos.
export async function obterClienteAtivo(): Promise<ClienteAtivo> {
  const cookieStore = await cookies()
  const clienteId = cookieStore.get(COOKIE_CLIENTE_ATIVO)?.value

  if (!clienteId) {
    redirect('/selecionar-cliente')
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('id', clienteId)
    .eq('user_id', user.id)
    .single()

  if (error || !cliente) {
    redirect('/selecionar-cliente')
  }

  return cliente
}
