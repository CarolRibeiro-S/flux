import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verificarPin } from '@/lib/pin'
import { COOKIE_PIN_VERIFICADO, DURACAO_PIN_VERIFICADO_SEGUNDOS } from '@/lib/pinVerificado'

export async function POST(request: NextRequest) {
  const { pin } = (await request.json()) as { pin?: string }

  if (!pin) {
    return NextResponse.json({ error: 'Informe o PIN' }, { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: config, error } = await supabase
    .from('configuracoes_usuario')
    .select('pin_hash')
    .eq('user_id', user.id)
    .single()

  if (error || !config?.pin_hash) {
    return NextResponse.json({ error: 'PIN ainda não configurado' }, { status: 400 })
  }

  const correto = await verificarPin(pin, config.pin_hash)

  if (!correto) {
    return NextResponse.json({ error: 'PIN incorreto' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  // httpOnly: este cookie só é lido no servidor (checagens antes de listar
  // clientes); não precisa nem deve ser acessível via JS no front-end.
  response.cookies.set(COOKIE_PIN_VERIFICADO, '1', {
    maxAge: DURACAO_PIN_VERIFICADO_SEGUNDOS,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  })
  return response
}
