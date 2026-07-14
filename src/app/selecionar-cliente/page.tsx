import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SeletorClienteAtivo } from './SeletorClienteAtivo'

export default async function SelecionarClientePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Lista todos os clientes do usuário apenas para ele escolher qual fica
  // ativo — nenhuma despesa é buscada ou exibida nesta tela.
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('user_id', user.id)
    .order('nome', { ascending: true })

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">
            Flux<span className="text-[#6333ff]">.</span>
          </h1>
          <p className="mt-1 text-white/60">Escolha o cliente para continuar</p>
        </div>

        <SeletorClienteAtivo clientes={clientes ?? []} />

        <Link href="/clientes" className="text-center text-sm text-white/50 hover:text-white">
          Gerenciar clientes
        </Link>
      </div>
    </div>
  )
}
