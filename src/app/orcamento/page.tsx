import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import {
  ehPrefixoMesValido,
  paraMesReferencia,
  prefixoMesCorrente,
  primeiroDiaDoMesSeguinte,
} from '@/lib/meses'
import { CabecalhoCliente } from '@/components/CabecalhoCliente'
import { GerenciarOrcamentos, type OrcamentoComGasto } from './GerenciarOrcamentos'

type Orcamento = {
  id: string
  categoria: string
  valor_limite: number | null
  mes_referencia: string
}

export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const clienteAtivo = await obterClienteAtivo()

  // Mês exibido: o da URL quando válido, senão o corrente. Validar aqui evita
  // levar lixo da query string direto para a query do banco.
  const prefixoMes = mes && ehPrefixoMesValido(mes) ? mes : prefixoMesCorrente()

  // Orçamentos do mês, sempre isolados por user_id + cliente_id
  const { data: orcamentos } = await supabase
    .from('orcamentos')
    .select('id, categoria, valor_limite, mes_referencia')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .eq('mes_referencia', paraMesReferencia(prefixoMes))
    .order('categoria', { ascending: true })

  const listaOrcamentos = (orcamentos ?? []) as Orcamento[]

  // Despesas confirmadas do MESMO mês e do MESMO cliente, para comparar com os
  // limites. Intervalo meio-aberto [dia 1 do mês, dia 1 do mês seguinte) para
  // não depender de saber quantos dias o mês tem.
  const { data: despesasDoMes } = await supabase
    .from('expenses')
    .select('category, amount')
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .eq('status', 'confirmado')
    .gte('expense_date', paraMesReferencia(prefixoMes))
    .lt('expense_date', primeiroDiaDoMesSeguinte(prefixoMes))

  // Soma o gasto por categoria. A chave é normalizada (minúscula, sem espaços
  // nas pontas) para que "Farmácia" e "farmácia " caiam no mesmo orçamento.
  //
  // Despesa sem categoria entra como "Outros" — o MESMO fallback usado no
  // resumo do histórico. Descartá-las aqui faria um orçamento de "Outros"
  // marcar R$ 0,00 gasto enquanto o histórico mostra gasto nessa categoria.
  const gastoPorCategoria = new Map<string, number>()
  for (const despesa of despesasDoMes ?? []) {
    const chave = ((despesa.category ?? '').trim() || 'Outros').toLowerCase()
    gastoPorCategoria.set(chave, (gastoPorCategoria.get(chave) ?? 0) + (despesa.amount ?? 0))
  }

  const orcamentosComGasto: OrcamentoComGasto[] = listaOrcamentos.map((orcamento) => ({
    id: orcamento.id,
    categoria: orcamento.categoria,
    valorLimite: orcamento.valor_limite ?? 0,
    gasto: gastoPorCategoria.get(orcamento.categoria.trim().toLowerCase()) ?? 0,
  }))

  // Categorias já usadas por este cliente, sugeridas no formulário
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

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <CabecalhoCliente nome={clienteAtivo.nome} />

        <Link href="/despesas" className="text-sm text-white/60 hover:text-white">
          ← Histórico
        </Link>

        <h1 className="text-2xl font-semibold">Orçamento</h1>

        <GerenciarOrcamentos
          prefixoMes={prefixoMes}
          orcamentos={orcamentosComGasto}
          categorias={categorias}
        />
      </div>
    </div>
  )
}
