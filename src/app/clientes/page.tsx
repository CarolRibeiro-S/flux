import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClienteForm } from './ClienteForm'
import { ClienteLista } from './ClienteLista'

export default async function ClientesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Exceção deliberada à regra de isolamento por cliente: esta é a tela de
  // gerenciamento dos próprios clientes, então é o único lugar (além de
  // /selecionar-cliente) onde faz sentido enxergá-los todos juntos. Nenhuma
  // despesa é listada aqui.
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('user_id', user.id)
    .order('nome', { ascending: true })

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link href="/selecionar-cliente" className="text-sm text-white/60 hover:text-white">
          ← Selecionar cliente
        </Link>

        <h1 className="text-2xl font-semibold">Clientes</h1>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">
            Novo cliente
          </h2>
          <ClienteForm />
        </div>

        <ClienteLista clientes={clientes ?? []} />
      </div>
    </div>
  )
}
