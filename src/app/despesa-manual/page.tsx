import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { CabecalhoCliente } from '@/components/CabecalhoCliente'
import { FormularioDespesaManual } from './FormularioDespesaManual'

// Cadastro manual de despesa (sem foto). Protegida: exige usuário logado e
// cliente ativo — obterClienteAtivo redireciona se não houver, mantendo o
// mesmo isolamento das demais telas.
export default async function DespesaManualPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const clienteAtivo = await obterClienteAtivo()

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <CabecalhoCliente nome={clienteAtivo.nome} />

        <Link href="/" className="text-sm text-white/60 hover:text-white">
          ← Voltar
        </Link>

        <div>
          <h1 className="text-2xl font-semibold">Adicionar sem foto</h1>
          <p className="mt-1 text-sm text-white/50">
            Digite os dados da despesa. Ela entra direto no histórico, já confirmada.
          </p>
        </div>

        <FormularioDespesaManual />
      </div>
    </div>
  )
}
