import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_PIN_VERIFICADO } from '@/lib/pinVerificado'

// Invalida a verificação de PIN atual e manda o usuário de volta pra tela de
// seleção de cliente, onde o PIN será exigido de novo. Usada pelo link
// "Trocar cliente": trocar de cliente sempre deve pedir o PIN outra vez,
// mesmo que a verificação anterior ainda estivesse dentro da validade.
//
// É uma navegação real (GET, link <a> comum, não fetch), por isso um
// redirect de servidor aqui é seguido normalmente pelo browser — sem o
// problema de fetch() seguir redirect e tentar .json() em HTML.
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/selecionar-cliente', request.url))
  response.cookies.set(COOKIE_PIN_VERIFICADO, '', { maxAge: 0, path: '/' })
  return response
}
