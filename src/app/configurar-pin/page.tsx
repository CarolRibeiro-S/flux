import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ConfigurarPinForm } from './ConfigurarPinForm'

// Server Component só para garantir a proteção (usuário logado) antes de
// renderizar; a interatividade do formulário fica no Client Component.
export default async function ConfigurarPinPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#080810] px-6 py-10 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">
          Flux<span className="text-[#6333ff]">.</span>
        </h1>
        <p className="mt-2 text-white/60">Defina um PIN para proteger a lista de clientes</p>
      </div>

      <ConfigurarPinForm />
    </div>
  )
}
