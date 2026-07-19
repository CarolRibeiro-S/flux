'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Trash2, Pencil, Check, X } from 'lucide-react'
import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda } from '@/lib/formatadores'
import { deslocarMes, rotuloMes } from '@/lib/meses'

export type OrcamentoComGasto = {
  id: string
  categoria: string
  valorLimite: number
  gasto: number
}

type Props = {
  prefixoMes: string
  orcamentos: OrcamentoComGasto[]
  categorias: string[]
}

// Lê a resposta como texto e só então tenta interpretar como JSON, mesmo
// padrão do resto do app.
async function lerCorpo(response: Response): Promise<{ error?: string } | null> {
  const texto = await response.text()
  try {
    return texto ? JSON.parse(texto) : null
  } catch {
    return null
  }
}

export function GerenciarOrcamentos({ prefixoMes, orcamentos, categorias }: Props) {
  const router = useRouter()

  const [categoria, setCategoria] = useState('')
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // id do orçamento em edição inline (null = nenhum)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [valorEditado, setValorEditado] = useState('')

  function irParaMes(novoPrefixo: string) {
    router.push(`/orcamento?mes=${novoPrefixo}`)
  }

  async function handleCriar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    const categoriaLimpa = categoria.trim()
    const valorNumerico = Number(valor)

    if (!categoriaLimpa) {
      setErro('Informe a categoria.')
      return
    }
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      setErro('Informe um valor maior que zero.')
      return
    }

    setSalvando(true)

    try {
      const response = await fetch('/api/orcamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria: categoriaLimpa,
          valor_limite: valorNumerico,
          mes: prefixoMes,
        }),
      })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        console.error('[GerenciarOrcamentos] Falha ao criar orçamento', {
          status: response.status,
          corpo,
        })
        throw new Error(
          corpo?.error ?? `Não foi possível salvar o orçamento (erro ${response.status}).`
        )
      }

      setCategoria('')
      setValor('')
      router.refresh()
    } catch (error) {
      console.error('[GerenciarOrcamentos] Erro ao criar orçamento', { error })
      setErro(error instanceof Error ? error.message : 'Erro ao salvar o orçamento.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleSalvarEdicao(id: string) {
    setErro(null)

    const valorNumerico = Number(valorEditado)
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      setErro('Informe um valor maior que zero.')
      return
    }

    setSalvando(true)

    try {
      const response = await fetch(`/api/orcamentos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_limite: valorNumerico }),
      })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        console.error('[GerenciarOrcamentos] Falha ao editar orçamento', {
          id,
          status: response.status,
          corpo,
        })
        throw new Error(
          corpo?.error ?? `Não foi possível atualizar o orçamento (erro ${response.status}).`
        )
      }

      setEditandoId(null)
      router.refresh()
    } catch (error) {
      console.error('[GerenciarOrcamentos] Erro ao editar orçamento', { id, error })
      setErro(error instanceof Error ? error.message : 'Erro ao atualizar o orçamento.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(orcamento: OrcamentoComGasto) {
    if (!window.confirm(`Excluir o orçamento de "${orcamento.categoria}" deste mês?`)) return

    setErro(null)
    setSalvando(true)

    try {
      const response = await fetch(`/api/orcamentos/${orcamento.id}`, { method: 'DELETE' })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        console.error('[GerenciarOrcamentos] Falha ao excluir orçamento', {
          id: orcamento.id,
          status: response.status,
          corpo,
        })
        throw new Error(
          corpo?.error ?? `Não foi possível excluir o orçamento (erro ${response.status}).`
        )
      }

      router.refresh()
    } catch (error) {
      console.error('[GerenciarOrcamentos] Erro ao excluir orçamento', { id: orcamento.id, error })
      setErro(error instanceof Error ? error.message : 'Erro ao excluir o orçamento.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Navegação de mês: sem ela, um orçamento criado para o mês seguinte
          sumiria da tela e pareceria não ter sido salvo */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-2 py-2">
        <button
          type="button"
          onClick={() => irParaMes(deslocarMes(prefixoMes, -1))}
          aria-label="Mês anterior"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <span className="text-sm font-semibold">{rotuloMes(prefixoMes)}</span>
        <button
          type="button"
          onClick={() => irParaMes(deslocarMes(prefixoMes, 1))}
          aria-label="Próximo mês"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <form
        onSubmit={handleCriar}
        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Novo limite
        </h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="orcamento-categoria" className="text-sm text-white/80">
            Categoria
          </label>
          <input
            id="orcamento-categoria"
            type="text"
            list="categorias-orcamento"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Ex: Alimentação, Combustível"
            disabled={salvando}
            className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff] disabled:opacity-50"
          />
          <datalist id="categorias-orcamento">
            {categorias.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="orcamento-valor" className="text-sm text-white/80">
            Limite mensal (R$)
          </label>
          <input
            id="orcamento-valor"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            disabled={salvando}
            className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff] disabled:opacity-50"
          />
        </div>

        <p className="text-xs text-white/40">
          O limite será criado para {rotuloMes(prefixoMes)}.
        </p>

        <button
          type="submit"
          disabled={salvando}
          className="w-full rounded-xl bg-[#6333ff] py-3 text-center font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Definir limite'}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Limites de {rotuloMes(prefixoMes)}
        </h2>

        {orcamentos.length === 0 && (
          <p className="text-sm text-white/50">Nenhum limite definido para este mês.</p>
        )}

        {orcamentos.map((orcamento) => {
          const visual = obterCategoria(orcamento.categoria)
          const estourou = orcamento.gasto > orcamento.valorLimite
          // A barra para em 100% mesmo estourando: o excesso é comunicado pela
          // cor e pelo texto, não por uma barra vazando do container.
          const proporcao =
            orcamento.valorLimite > 0
              ? Math.min((orcamento.gasto / orcamento.valorLimite) * 100, 100)
              : 0
          const restante = orcamento.valorLimite - orcamento.gasto
          const cor = estourou ? '#ff5c5c' : '#00c8c8'
          const emEdicao = editandoId === orcamento.id

          return (
            <div
              key={orcamento.id}
              className={`flex flex-col gap-2 rounded-2xl border bg-white/5 p-4 ${
                estourou ? 'border-[#ff5c5c]/50' : 'border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true">{visual.icone}</span>
                  <span className="truncate font-medium">{orcamento.categoria}</span>
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  {!emEdicao && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoId(orcamento.id)
                        setValorEditado(String(orcamento.valorLimite))
                        setErro(null)
                      }}
                      disabled={salvando}
                      aria-label={`Editar limite de ${orcamento.categoria}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleExcluir(orcamento)}
                    disabled={salvando}
                    aria-label={`Excluir orçamento de ${orcamento.categoria}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </div>

              {emEdicao ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={valorEditado}
                    onChange={(e) => setValorEditado(e.target.value)}
                    aria-label={`Novo limite de ${orcamento.categoria}`}
                    className="flex-1 rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-2 text-sm text-white outline-none focus:border-[#6333ff]"
                  />
                  <button
                    type="button"
                    onClick={() => handleSalvarEdicao(orcamento.id)}
                    disabled={salvando}
                    aria-label="Salvar novo limite"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6333ff] text-white disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    disabled={salvando}
                    aria-label="Cancelar edição"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 text-white/60 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span style={{ color: cor }} className="font-semibold">
                      {formatarMoeda(orcamento.gasto)}
                    </span>
                    <span className="text-white/50">
                      de {formatarMoeda(orcamento.valorLimite)}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${proporcao}%`, backgroundColor: cor }}
                    />
                  </div>

                  <p className="text-xs" style={{ color: estourou ? '#ff5c5c' : undefined }}>
                    {estourou ? (
                      <span className="font-semibold">
                        Ultrapassou {formatarMoeda(Math.abs(restante))}
                      </span>
                    ) : (
                      <span className="text-white/50">
                        Restam {formatarMoeda(restante)}
                      </span>
                    )}
                  </p>
                </>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
