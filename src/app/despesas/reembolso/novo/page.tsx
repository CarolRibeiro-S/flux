import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SeletorDespesas } from './SeletorDespesas'

export default async function NovoReembolsoPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Só despesas confirmadas que ainda não entraram em nenhum lote de reembolso
  const { data: despesas } = await supabase
    .from('expenses')
    .select('id, merchant_name, category, amount, expense_date')
    .eq('user_id', user.id)
    .eq('status', 'confirmado')
    .is('batch_id', null)
    .order('expense_date', { ascending: false })

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link href="/despesas/reembolso" className="text-sm text-white/60 hover:text-white">
          ← Reembolsos
        </Link>

        <h1 className="text-2xl font-semibold">Novo reembolso</h1>

        <SeletorDespesas despesas={despesas ?? []} />
      </div>
    </div>
  )
}
