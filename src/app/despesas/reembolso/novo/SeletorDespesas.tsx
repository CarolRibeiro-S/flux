'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'

type Despesa = {
  id: string
  merchant_name: string | null
  category: string | null
  amount: number | null
  expense_date: string | null
}

type Props = {
  despesas: Despesa[]
  // Sem loteId: cria um reembolso novo (fluxo original, POST
  // /api/reembolso/criar). Com loteId: adiciona as despesas selecionadas a
  // um lote já existente (POST /api/reembolso/[id]/despesas).
  loteId?: string
  // Quantos reembolsos já incluem cada despesa (id -> quantidade). Só
  // informativo: nenhuma despesa fica bloqueada por já estar em outro lote.
  contagemLotes?: Record<string, number>
  // Ids já vinculados a ESTE lote (só no fluxo de adicionar)
  idsNesteLote?: string[]
}

export function SeletorDespesas({
  despesas,
  loteId,
  contagemLotes = {},
  idsNesteLote = [],
}: Props) {
  const conjuntoNesteLote = useMemo(() => new Set(idsNesteLote), [idsNesteLote])
  const router = useRouter()

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFim, setPeriodoFim] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const total = useMemo(() => {
    return despesas
      .filter((despesa) => selecionadas.has(despesa.id))
      .reduce((soma, despesa) => soma + (despesa.amount ?? 0), 0)
  }, [despesas, selecionadas])

  function toggleDespesa(id: string) {
    setSelecionadas((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) {
        novo.delete(id)
      } else {
        novo.add(id)
      }
      return novo
    })
  }

  // Marca automaticamente as despesas dentro do período, sem desmarcar o que
  // já estava selecionado manualmente antes do filtro
  function handleSelecionarPeriodo() {
    if (!periodoInicio || !periodoFim) return

    setSelecionadas((atual) => {
      const novo = new Set(atual)
      for (const despesa of despesas) {
        if (!despesa.expense_date) continue
        if (despesa.expense_date >= periodoInicio && despesa.expense_date <= periodoFim) {
          novo.add(despesa.id)
        }
      }
      return novo
    })
  }

  async function handleGerar() {
    if (selecionadas.size === 0) return

    setErro(null)
    setCarregando(true)

    try {
      const url = loteId ? `/api/reembolso/${loteId}/despesas` : '/api/reembolso/criar'
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseIds: [...selecionadas] }),
      })

      // Lê como texto primeiro pra nunca quebrar com um erro de parse cru
      // caso a resposta não seja JSON (mesmo padrão usado em CapturaDespesa.tsx)
      const corpoTexto = await response.text()
      let corpo: { id?: string; error?: string } | null = null
      try {
        corpo = corpoTexto ? JSON.parse(corpoTexto) : null
      } catch {
        corpo = null
      }

      if (!response.ok) {
        throw new Error(corpo?.error ?? 'Não foi possível salvar o reembolso.')
      }

      // Adicionando a um lote existente já sabemos o destino (loteId); só ao
      // criar um novo lote a resposta traz o id gerado.
      const idDestino = loteId ?? corpo?.id
      if (!idDestino) {
        throw new Error('Resposta inesperada do servidor.')
      }

      router.push(`/despesas/reembolso/${idDestino}`)
      router.refresh()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar o reembolso.')
      setCarregando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/50">Total selecionado</p>
        <p className="text-3xl font-bold text-[#00c8c8]">{formatarMoeda(total)}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/80">Selecionar por período</p>
        <div className="flex gap-2">
          <input
            type="date"
            value={periodoInicio}
            onChange={(e) => setPeriodoInicio(e.target.value)}
            className="w-1/2 rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-2 text-white outline-none focus:border-[#6333ff]"
          />
          <input
            type="date"
            value={periodoFim}
            onChange={(e) => setPeriodoFim(e.target.value)}
            className="w-1/2 rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-2 text-white outline-none focus:border-[#6333ff]"
          />
        </div>
        <button
          type="button"
          onClick={handleSelecionarPeriodo}
          disabled={!periodoInicio || !periodoFim}
          className="rounded-lg border border-[#6333ff] py-2 text-sm font-semibold text-[#6333ff] disabled:opacity-40"
        >
          Selecionar período
        </button>
      </div>

      {despesas.length === 0 ? (
        <p className="text-sm text-white/50">
          Nenhuma despesa confirmada disponível para reembolso.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {despesas.map((despesa) => {
            const categoria = obterCategoria(despesa.category)
            const marcada = selecionadas.has(despesa.id)
            const quantidadeLotes = contagemLotes[despesa.id] ?? 0
            const jaNesteLote = conjuntoNesteLote.has(despesa.id)

            return (
              <label
                key={despesa.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => toggleDespesa(despesa.id)}
                  className="h-5 w-5 shrink-0 accent-[#6333ff]"
                />

                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                  style={{ backgroundColor: `${categoria.cor}33` }}
                >
                  {categoria.icone}
                </span>

                <span className="min-w-0 flex-1">
                  <p className="truncate font-medium">{despesa.merchant_name ?? 'Sem nome'}</p>
                  <p className="text-xs" style={{ color: categoria.cor }}>
                    {categoria.rotulo}
                  </p>
                  {/* Indicadores discretos: nenhum deles impede a seleção */}
                  {jaNesteLote ? (
                    <span className="mt-0.5 inline-block rounded-full bg-[#00c8c8]/15 px-2 py-0.5 text-[10px] font-semibold text-[#00c8c8]">
                      Já neste reembolso
                    </span>
                  ) : (
                    quantidadeLotes > 0 && (
                      <span className="mt-0.5 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50">
                        Já incluída em {quantidadeLotes} reembolso
                        {quantidadeLotes === 1 ? '' : 's'}
                      </span>
                    )
                  )}
                </span>

                <span className="text-right">
                  <p className="font-semibold">{formatarMoeda(despesa.amount ?? 0)}</p>
                  <p className="text-xs text-white/50">
                    {despesa.expense_date ? formatarDataBR(despesa.expense_date) : '—'}
                  </p>
                </span>
              </label>
            )
          })}
        </div>
      )}

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <button
        type="button"
        onClick={handleGerar}
        disabled={selecionadas.size === 0 || carregando}
        className="w-full rounded-xl bg-[#6333ff] py-4 text-lg font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {carregando
          ? 'Salvando...'
          : loteId
            ? 'Adicionar ao reembolso'
            : 'Gerar reembolso'}
      </button>
    </div>
  )
}
