'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, History, Receipt, Camera, type LucideIcon } from 'lucide-react'

// Rotas onde o menu não deve aparecer: não autenticado, autenticado mas sem
// cliente ativo selecionado, ou nas telas de configurar/verificar o PIN de
// segurança (etapas obrigatórias que precisam ser concluídas antes de
// qualquer navegação para outras telas)
const ROTAS_OCULTAS = [
  '/login',
  '/auth/callback',
  '/selecionar-cliente',
  '/configurar-pin',
  '/verificar-pin',
]

type ItemMenu = {
  rotulo: string
  href: string
  Icone: LucideIcon
  ativo: (pathname: string) => boolean
}

const ITENS: ItemMenu[] = [
  {
    rotulo: 'Início',
    href: '/',
    Icone: Home,
    ativo: (pathname) => pathname === '/',
  },
  {
    rotulo: 'Histórico',
    href: '/despesas',
    Icone: History,
    // Cobre /despesas e suas subrotas (detalhe, revisão), exceto a seção de reembolso
    ativo: (pathname) =>
      pathname === '/despesas' ||
      (pathname.startsWith('/despesas/') && !pathname.startsWith('/despesas/reembolso')),
  },
  {
    rotulo: 'Reembolso',
    href: '/despesas/reembolso',
    Icone: Receipt,
    ativo: (pathname) => pathname.startsWith('/despesas/reembolso'),
  },
  {
    rotulo: 'Nova despesa',
    href: '/',
    Icone: Camera,
    // Atalho de ação (mesma tela de captura do item "Início"), não representa
    // uma rota própria — por isso nunca fica destacado como aba ativa.
    ativo: () => false,
  },
]

export default function MenuInferior() {
  const pathname = usePathname()

  const oculto = ROTAS_OCULTAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  )
  if (oculto) return null

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-white/10 bg-[#12121e] pb-[env(safe-area-inset-bottom)]"
    >
      {ITENS.map((item) => {
        const ativo = item.ativo(pathname)
        return (
          <Link
            key={item.rotulo}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              ativo ? 'text-[#6333ff]' : 'text-white/50'
            }`}
          >
            <item.Icone size={22} strokeWidth={ativo ? 2.4 : 2} />
            {item.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
