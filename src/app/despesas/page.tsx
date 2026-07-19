import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Download, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { formatarMoeda } from '@/lib/formatadores'
import {
  aplicarFiltrosDespesas,
  filtrosParaQueryString,
  lerFiltros,
  temFiltroAtivo,
  temFiltroDeData,
} from '@/lib/filtrosDespesas'
import { prefixoMesCorrente, rotuloMes } from '@/lib/meses'
import { CabecalhoCliente } from '@/components/CabecalhoCliente'
import { FiltrosHistorico } from './FiltrosHistorico'
import { ResumoCategoria, type TotalCategoria } from './ResumoCategoria'
import { ListaDespesas, type DespesaLista, type GrupoMes } from './ListaDespesas'

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string; categoria?: string }>
}) {
  const filtros = lerFiltros(await searchParams)
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

  // Lista principal: filtro triplo (user_id + cliente_id + status) aplicado
  // ANTES dos filtros de tela, que nunca podem afrouxar esse isolamento.
  const consultaBase = supabase
    .from('expenses')
    .select('id, merchant_name, amount, expense_date, category, observacoes, precisa_reembolso')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .eq('status', 'confirmado')

  const { data: despesas } = await aplicarFiltrosDespesas(consultaBase, filtros).order(
    'expense_date',
    { ascending: false }
  )

  const listaDespesas = (despesas ?? []) as DespesaLista[]

  // Categorias oferecidas nos filtros e na edição em massa: extraídas das
  // despesas do próprio cliente, SEM aplicar os filtros de tela — senão
  // filtrar por uma categoria esconderia todas as outras do seletor.
  const { data: despesasParaCategorias } = await supabase
    .from('expenses')
    .select('category')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .eq('status', 'confirmado')

  const categorias = [
    ...new Set(
      (despesasParaCategorias ?? [])
        .map((despesa) => (despesa.category ?? '').trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const totalGeral = listaDespesas.reduce((soma, despesa) => soma + (despesa.amount ?? 0), 0)

  // Agrupamento por mês feito aqui em memória, depois de buscar as despesas
  // já filtradas — não é uma query SQL com GROUP BY.
  const grupos = new Map<string, GrupoMes>()

  for (const despesa of listaDespesas) {
    if (!despesa.expense_date) continue

    const [ano, mes] = despesa.expense_date.split('-')
    const chave = `${ano}-${mes}`

    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, rotulo: rotuloMes(chave), total: 0, despesas: [] })
    }

    const grupo = grupos.get(chave)!
    grupo.total += despesa.amount ?? 0
    grupo.despesas.push(despesa)
  }

  // Resumo por categoria: usa o período filtrado quando há filtro de data;
  // sem filtro de data, recorta o mês corrente para não somar o histórico
  // inteiro (que não é um "resumo" útil).
  const mesCorrente = prefixoMesCorrente()
  const filtrandoPorData = temFiltroDeData(filtros)
  const despesasResumo = filtrandoPorData
    ? listaDespesas
    : listaDespesas.filter((despesa) => despesa.expense_date?.startsWith(mesCorrente))

  const totaisPorCategoria = new Map<string, number>()
  for (const despesa of despesasResumo) {
    const categoria = (despesa.category ?? '').trim() || 'Outros'
    totaisPorCategoria.set(
      categoria,
      (totaisPorCategoria.get(categoria) ?? 0) + (despesa.amount ?? 0)
    )
  }

  const totais: TotalCategoria[] = [...totaisPorCategoria.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)

  const rotuloPeriodoResumo = filtrandoPorData ? 'período filtrado' : rotuloMes(mesCorrente)

  const queryStringFiltros = filtrosParaQueryString(filtros)
  const urlExportar = queryStringFiltros
    ? `/api/despesas/exportar?${queryStringFiltros}`
    : '/api/despesas/exportar'

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <CabecalhoCliente nome={clienteAtivo.nome} />

        <header className="flex items-center justify-between gap-2">
          <Link
            href="/orcamento"
            className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white/80"
          >
            <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Orçamento
          </Link>
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
            {temFiltroAtivo(filtros) && ' com os filtros aplicados'}
          </p>
        </div>

        <FiltrosHistorico filtros={filtros} categorias={categorias} />

        {listaDespesas.length > 0 && (
          <a
            href={urlExportar}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#00c8c8]/40 bg-[#00c8c8]/10 py-3 text-sm font-semibold text-[#00c8c8]"
          >
            <Download className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Exportar CSV
          </a>
        )}

        <ResumoCategoria totais={totais} rotuloPeriodo={rotuloPeriodoResumo} />

        {listaDespesas.length === 0 && (
          <p className="text-sm text-white/50">
            {temFiltroAtivo(filtros)
              ? 'Nenhuma despesa encontrada com esses filtros.'
              : 'Nenhuma despesa confirmada ainda.'}
          </p>
        )}

        <ListaDespesas grupos={[...grupos.values()]} categorias={categorias} />
      </div>
    </div>
  )
}
