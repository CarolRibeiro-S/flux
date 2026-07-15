import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { COOKIE_CLIENTE_ATIVO } from './clienteAtivoCookie'

export type ClienteAtivo = {
  id: string
  nome: string
}

// Lançado quando não há cliente ativo válido. Rotas de API devem capturar
// esse erro explicitamente e responder com JSON (nunca deixar propagar um
// redirect HTTP para uma chamada que o front-end espera poder ler com
// response.json() — um fetch() segue redirects por padrão e acabaria dando
// .json() no HTML da página de destino, quebrando com um erro ilegível).
export class ClienteAtivoInvalidoError extends Error {
  constructor() {
    super('Nenhum cliente ativo selecionado, ou o cliente não pertence ao usuário logado')
    this.name = 'ClienteAtivoInvalidoError'
  }
}

// Lê o cookie "cliente_ativo_id" e confirma no banco que ele realmente
// existe e pertence ao usuário logado — nunca confia apenas na presença do
// cookie. Não tem nenhum efeito colateral de navegação: lança
// ClienteAtivoInvalidoError se inválido, para cada tipo de chamador (página
// vs. rota de API) decidir como reagir.
async function resolverClienteAtivo(): Promise<ClienteAtivo> {
  const cookieStore = await cookies()
  const clienteId = cookieStore.get(COOKIE_CLIENTE_ATIVO)?.value

  if (!clienteId) {
    throw new ClienteAtivoInvalidoError()
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new ClienteAtivoInvalidoError()
  }

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('id', clienteId)
    .eq('user_id', user.id)
    .single()

  if (error || !cliente) {
    throw new ClienteAtivoInvalidoError()
  }

  return cliente
}

// Uso em Server Components / páginas: redireciona automaticamente para
// /selecionar-cliente se não houver cliente ativo válido. Correto aqui
// porque a resposta de uma página É uma navegação — um redirect é o
// comportamento esperado pelo browser/WebView.
export async function obterClienteAtivo(): Promise<ClienteAtivo> {
  try {
    return await resolverClienteAtivo()
  } catch (error) {
    if (error instanceof ClienteAtivoInvalidoError) {
      redirect('/selecionar-cliente')
    }
    throw error
  }
}

// Uso em Route Handlers (APIs chamadas via fetch()+.json() pelo front-end):
// NUNCA redireciona. Deixa o chamador capturar ClienteAtivoInvalidoError e
// responder com NextResponse.json(...), pra que o front-end sempre receba
// um corpo JSON interpretável, com status de erro correto, em vez de um
// redirect HTML seguido silenciosamente pelo fetch.
export async function obterClienteAtivoApi(): Promise<ClienteAtivo> {
  return resolverClienteAtivo()
}
