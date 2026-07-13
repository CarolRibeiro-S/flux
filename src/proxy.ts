import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Em Next.js 16, "middleware" foi renomeado para "proxy".
// Continua rodando antes de cada navegação, atualizando a sessão do usuário.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
