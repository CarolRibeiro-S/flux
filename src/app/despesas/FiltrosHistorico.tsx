'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import {
  filtrosParaQueryString,
  temFiltroAtivo,
  type FiltrosDespesas,
} from '@/lib/filtrosDespesas'

type Props = {
  filtros: FiltrosDespesas
  // Categorias já usadas por este cliente, extraídas das despesas existentes
  categorias: string[]
}

export function FiltrosHistorico({ filtros, categorias }: Props) {
  const router = useRouter()

  // Os valores iniciais vêm do servidor (já lidos da URL), então não é preciso
  // useSearchParams aqui — o estado local é só o rascunho até aplicar.
  const [q, setQ] = useState(filtros.q)
  const [de, setDe] = useState(filtros.de)
  const [ate, setAte] = useState(filtros.ate)
  const [categoria, setCategoria] = useState(filtros.categoria)

  // Painel de data/categoria começa aberto se já houver algum desses filtros
  // ativos — senão a usuária não veria por que a lista está filtrada.
  const [avancadoAberto, setAvancadoAberto] = useState(
    Boolean(filtros.de || filtros.ate || filtros.categoria)
  )

  const algumFiltroAtivo = temFiltroAtivo(filtros)

  // Os filtros vivem na URL (não em estado local) para sobreviverem à
  // navegação: sair para o detalhe de uma despesa e voltar mantém o filtro.
  function aplicar() {
    const queryString = filtrosParaQueryString({ q, de, ate, categoria })
    router.push(queryString ? `/despesas?${queryString}` : '/despesas')
  }

  function limpar() {
    setQ('')
    setDe('')
    setAte('')
    setCategoria('')
    setAvancadoAberto(false)
    router.push('/despesas')
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          aplicar()
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            strokeWidth={2}
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou observação"
            aria-label="Buscar despesas"
            className="w-full rounded-lg border border-white/10 bg-[#0f0f1a] py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#6333ff]"
          />
        </div>

        <button
          type="button"
          onClick={() => setAvancadoAberto((aberto) => !aberto)}
          aria-expanded={avancadoAberto}
          aria-label="Filtros de data e categoria"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            avancadoAberto || de || ate || categoria
              ? 'border-[#6333ff] bg-[#6333ff]/15 text-[#6333ff]'
              : 'border-white/10 bg-[#0f0f1a] text-white/50'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
        </button>
      </form>

      {avancadoAberto && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="filtro-de" className="text-xs text-white/60">
                De
              </label>
              <input
                id="filtro-de"
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-2.5 text-sm text-white outline-none focus:border-[#6333ff]"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="filtro-ate" className="text-xs text-white/60">
                Até
              </label>
              <input
                id="filtro-ate"
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-2.5 text-sm text-white outline-none focus:border-[#6333ff]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-categoria" className="text-xs text-white/60">
              Categoria
            </label>
            <select
              id="filtro-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-2.5 text-sm text-white outline-none focus:border-[#6333ff]"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={aplicar}
          className="flex-1 rounded-lg bg-[#6333ff] py-2.5 text-sm font-semibold text-white"
        >
          Aplicar filtros
        </button>

        {algumFiltroAtivo && (
          <button
            type="button"
            onClick={limpar}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/20 px-3 py-2.5 text-sm font-semibold text-white/70"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Limpar
          </button>
        )}
      </div>
    </div>
  )
}
