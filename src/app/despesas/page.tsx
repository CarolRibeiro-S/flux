import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'
import { CabecalhoCliente } from '@/components/CabecalhoCliente'

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type Despesa = {
  id: string
  merchant_name: string | null
  amount: number | null
  expense_date: string | null
  category: string | null
}

type Grupo = {
  rotulo: string
  total: number
  despesas: Despesa[]
}

export default async function DespesasPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Isolamento por cliente: toda busca de despesas filtra também por
  // cliente_id do cliente ativo, nunca só por user_id.
  const clienteAtivo = await obterClienteAtivo()

  const { data: despesas } = await supabase
    .from('expenses')
    .select('id, merchant_name, amount, expense_date, category')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .eq('status', 'confirmado')
    .order('expense_date', { ascending: false })

  const listaDespesas = (despesas ?? []) as Despesa[]

  const totalGeral = listaDespesas.reduce((soma, despesa) => soma + (despesa.amount ?? 0), 0)

  // Agrupamento por mês feito aqui em memória, depois de buscar todas as
  // despesas confirmadas do usuário — não é uma query SQL com GROUP BY.
  const grupos = new Map<string, Grupo>()

  for (const despesa of listaDespesas) {
    if (!despesa.expense_date) continue

    const [ano, mes] = despesa.expense_date.split('-')
    const chave = `${ano}-${mes}`

    if (!grupos.has(chave)) {
      grupos.set(chave, {
        rotulo: `${NOMES_MESES[Number(mes) - 1]} ${ano}`,
        total: 0,
        despesas: [],
      })
    }

    const grupo = grupos.get(chave)!
    grupo.total += despesa.amount ?? 0
    grupo.despesas.push(despesa)
  }

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <CabecalhoCliente nome={clienteAtivo.nome} />

        {/* Link "← Início" removido: já coberto pelo item "Início" do menu inferior */}
        <header className="flex items-center justify-end">
          <Link
            href="/"
            className="rounded-lg bg-[#6333ff] px-4 py-2 text-sm font-semibold text-white"
          >
            + Nova despesa
          </Link>
        </header>

        <div>
          <h1 className="text-2xl font-semibold">Histórico</h1>
          <p className="mt-1 text-3xl font-bold text-[#00c8c8]">{formatarMoeda(totalGeral)}</p>
          <p className="text-sm text-white/50">
            {listaDespesas.length} despesa{listaDespesas.length === 1 ? '' : 's'} confirmada
            {listaDespesas.length === 1 ? '' : 's'}
          </p>
        </div>

        {listaDespesas.length === 0 && (
          <p className="text-sm text-white/50">Nenhuma despesa confirmada ainda.</p>
        )}

        {[...grupos.entries()].map(([chave, grupo]) => (
          <section key={chave} className="flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                {grupo.rotulo}
              </h2>
              <span className="text-sm font-semibold text-white/80">
                {formatarMoeda(grupo.total)}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {grupo.despesas.map((despesa) => {
                const categoria = obterCategoria(despesa.category)
                return (
                  <Link
                    key={despesa.id}
                    href={`/despesas/${despesa.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                        style={{ backgroundColor: `${categoria.cor}33` }}
                      >
                        {categoria.icone}
                      </span>
                      <div>
                        <p className="font-medium">{despesa.merchant_name ?? 'Sem nome'}</p>
                        <p className="text-xs" style={{ color: categoria.cor }}>
                          {categoria.rotulo}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold">{formatarMoeda(despesa.amount ?? 0)}</p>
                      <p className="text-xs text-white/50">
                        {despesa.expense_date ? formatarDataBR(despesa.expense_date) : '—'}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
