import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterStatusPin } from '@/lib/pinVerificado'
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

  // PIN de segurança: esta tela também expõe nomes de clientes (a lista
  // inteira, inclusive), então precisa da mesma checagem que
  // /selecionar-cliente — antes de qualquer query de clientes.
  const statusPin = await obterStatusPin(user.id)
  if (statusPin.situacao === 'sem_pin_configurado') {
    redirect('/configurar-pin')
  }
  if (statusPin.situacao === 'pin_nao_verificado') {
    redirect('/verificar-pin')
  }

  // Exceção deliberada à regra de isolamento por cliente (não à regra de
  // PIN, essa já foi checada acima): esta é a tela de gerenciamento dos
  // próprios clientes, então é o único lugar (além de /selecionar-cliente)
  // onde faz sentido enxergá-los todos juntos. Nenhuma despesa é listada aqui.
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('user_id', user.id)
    .order('nome', { ascending: true })

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link href="/selecionar-cliente" className="text-sm text-white/60 hover:text-white">
            ← Selecionar cliente
          </Link>
          <Link
            href="/configurar-pin"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/40"
          >
            Alterar PIN
          </Link>
        </div>

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
