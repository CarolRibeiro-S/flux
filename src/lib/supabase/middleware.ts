import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_CLIENTE_ATIVO } from '@/lib/clienteAtivoCookie'

// Rotas onde não exigimos um cliente ativo selecionado: gerenciamento de
// clientes (e sua API de suporte), a própria tela de seleção, e as rotas
// públicas de autenticação.
const ROTAS_SEM_CLIENTE_ATIVO = [
  '/clientes',
  '/selecionar-cliente',
  '/login',
  '/auth/callback',
  '/api/clientes',
]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Importante: não remova essa linha. Ela garante que o token do usuário
  // seja validado a cada requisição.
  const { data: { user } } = await supabase.auth.getUser()

  // Se não estiver logado e tentar acessar rota protegida, redireciona pro login
  // (login e o callback do OAuth ficam sempre acessíveis)
  const publicPaths = ['/login', '/auth/callback']
  const isPublicPath = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path))

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // REGRA DE ISOLAMENTO POR CLIENTE: todo usuário logado precisa ter um
  // cliente ativo selecionado antes de acessar qualquer tela que lide com
  // despesas/reembolsos. Isso vale para páginas E rotas de API (o matcher
  // abaixo cobre praticamente tudo, exceto assets estáticos).
  const dispensaClienteAtivo = ROTAS_SEM_CLIENTE_ATIVO.some(
    (rota) => request.nextUrl.pathname === rota || request.nextUrl.pathname.startsWith(`${rota}/`)
  )

  if (user && !dispensaClienteAtivo) {
    const clienteId = request.cookies.get(COOKIE_CLIENTE_ATIVO)?.value
    let clienteValido = false

    if (clienteId) {
      // Não confia apenas na presença do cookie: confirma no banco que esse
      // cliente realmente existe e pertence ao usuário logado.
      const { data: cliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('id', clienteId)
        .eq('user_id', user.id)
        .single()
      clienteValido = Boolean(cliente)
    }

    if (!clienteValido) {
      const url = request.nextUrl.clone()
      url.pathname = '/selecionar-cliente'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
