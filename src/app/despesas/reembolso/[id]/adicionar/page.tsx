import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { SeletorDespesas } from '../../novo/SeletorDespesas'

export default async function AdicionarDespesasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const clienteAtivo = await obterClienteAtivo()

  // Filtro triplo do lote, igual às outras telas da área de reembolso
  const { data: lote, error } = await supabase
    .from('reimbursement_batches')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (error || !lote) {
    notFound()
  }

  // Reembolso já pago não aceita mais alterações — volta pro detalhe
  if (lote.status === 'pago') {
    redirect(`/despesas/reembolso/${id}`)
  }

  // Mesma query de novo/page.tsx: despesas confirmadas do cliente ativo,
  // marcadas como precisando de reembolso, que ainda não entraram em nenhum lote
  const { data: despesas } = await supabase
    .from('expenses')
    .select('id, merchant_name, category, amount, expense_date')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .eq('status', 'confirmado')
    .eq('precisa_reembolso', true)
    .is('batch_id', null)
    .order('expense_date', { ascending: false })

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link
          href={`/despesas/reembolso/${id}`}
          className="text-sm text-white/60 hover:text-white"
        >
          ← Voltar ao reembolso
        </Link>

        <h1 className="text-2xl font-semibold">Adicionar despesas</h1>

        <SeletorDespesas despesas={despesas ?? []} loteId={id} />
      </div>
    </div>
  )
}
