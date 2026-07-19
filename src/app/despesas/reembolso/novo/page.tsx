import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { contarLotesPorDespesa } from '@/lib/reembolsoDespesas'
import { SeletorDespesas } from './SeletorDespesas'

export default async function NovoReembolsoPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const clienteAtivo = await obterClienteAtivo()

  // Só despesas confirmadas do cliente ativo, marcadas como precisando de
  // reembolso (precisa_reembolso = true — despesas pagas no cartão da casa
  // não fazem sentido num lote de reembolso).
  //
  // NÃO há mais filtro por vínculo com lote: uma despesa continua disponível
  // mesmo já estando em outros reembolsos, porque a relação virou
  // muitos-para-muitos (ver @/lib/reembolsoDespesas).
  const { data: despesas } = await supabase
    .from('expenses')
    .select('id, merchant_name, category, amount, expense_date')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .eq('status', 'confirmado')
    .eq('precisa_reembolso', true)
    .order('expense_date', { ascending: false })

  const listaDespesas = despesas ?? []

  // Só informativo: quantos reembolsos já incluem cada despesa. Não impede a
  // seleção, apenas evita que ela inclua algo em duplicidade sem perceber.
  const contagemLotes = await contarLotesPorDespesa(
    supabase,
    listaDespesas.map((despesa) => despesa.id),
    clienteAtivo.id,
    user.id
  )

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link href="/despesas/reembolso" className="text-sm text-white/60 hover:text-white">
          ← Reembolsos
        </Link>

        <h1 className="text-2xl font-semibold">Novo reembolso</h1>

        <SeletorDespesas despesas={listaDespesas} contagemLotes={contagemLotes} />
      </div>
    </div>
  )
}
