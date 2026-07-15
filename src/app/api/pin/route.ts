import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hashPin, pinValido } from '@/lib/pin'
import { COOKIE_PIN_VERIFICADO, DURACAO_PIN_VERIFICADO_SEGUNDOS } from '@/lib/pinVerificado'

// Cria ou atualiza o PIN do usuário logado (mesma rota serve os dois casos:
// primeira definição e troca posterior)
export async function POST(request: NextRequest) {
  const { pin } = (await request.json()) as { pin?: string }

  if (!pin || !pinValido(pin)) {
    return NextResponse.json(
      { error: 'O PIN deve ter de 4 a 6 dígitos numéricos' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const pinHash = await hashPin(pin)

  // Verifica existência antes de decidir entre update/insert, em vez de
  // depender de upsert+onConflict (que exige uma constraint específica que
  // não temos como confirmar no schema a partir daqui)
  const { data: existente } = await supabase
    .from('configuracoes_usuario')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  const { error } = existente
    ? await supabase
        .from('configuracoes_usuario')
        .update({ pin_hash: pinHash })
        .eq('user_id', user.id)
    : await supabase.from('configuracoes_usuario').insert({ user_id: user.id, pin_hash: pinHash })

  if (error) {
    console.error('[/api/pin] Erro ao salvar PIN:', error)
    return NextResponse.json({ error: 'Não foi possível salvar o PIN' }, { status: 500 })
  }

  // Quem acabou de definir/confirmar o PIN corretamente já provou que o
  // conhece agora mesmo — marca a verificação como feita nesta sessão, para
  // não pedir o mesmo PIN de novo em seguida.
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_PIN_VERIFICADO, '1', {
    maxAge: DURACAO_PIN_VERIFICADO_SEGUNDOS,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  })
  return response
}
