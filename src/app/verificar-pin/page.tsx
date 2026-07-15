import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterStatusPin } from '@/lib/pinVerificado'
import { VerificarPinForm } from './VerificarPinForm'

export default async function VerificarPinPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const status = await obterStatusPin(user.id)

  // Sem PIN configurado ainda: não há o que verificar
  if (status.situacao === 'sem_pin_configurado') {
    redirect('/configurar-pin')
  }

  // Já verificado (ex: usuário voltou pra esta URL por engano): segue o fluxo normal
  if (status.situacao === 'pin_verificado') {
    redirect('/selecionar-cliente')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#080810] px-6 py-10 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">
          Flux<span className="text-[#6333ff]">.</span>
        </h1>
        <p className="mt-2 text-white/60">Digite seu PIN para ver os clientes</p>
      </div>

      <VerificarPinForm />
    </div>
  )
}
