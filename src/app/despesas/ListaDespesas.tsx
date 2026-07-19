'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckSquare, Square, X } from 'lucide-react'
import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'

export type DespesaLista = {
  id: string
  merchant_name: string | null
  amount: number | null
  expense_date: string | null
  category: string | null
  observacoes: string | null
  precisa_reembolso: boolean | null
}

export type GrupoMes = {
  chave: string
  rotulo: string
  total: number
  despesas: DespesaLista[]
}

type Props = {
  grupos: GrupoMes[]
  // Categorias já usadas por este cliente, oferecidas na edição em massa
  categorias: string[]
}

// Lê a resposta como texto e só então tenta interpretar como JSON, mesmo
// padrão do resto do app (CapturaDespesa, GerenciarLote, GerarPdfButton).
async function lerCorpo(response: Response): Promise<{ error?: string } | null> {
  const texto = await response.text()
  try {
    return texto ? JSON.parse(texto) : null
  } catch {
    return null
  }
}

export function ListaDespesas({ grupos, categorias }: Props) {
  const router = useRouter()
  const [modoSelecao, setModoSelecao] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [categoriaEscolhida, setCategoriaEscolhida] = useState('')

  const totalDespesas = grupos.reduce((soma, grupo) => soma + grupo.despesas.length, 0)

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  function sairDoModoSelecao() {
    setModoSelecao(false)
    setSelecionados(new Set())
    setCategoriaEscolhida('')
    setErro(null)
  }

  // Envia a atualização em massa. O servidor revalida cliente_id de CADA
  // despesa antes de aplicar — aqui é só a chamada.
  async function aplicarEmMassa(updates: { category?: string; precisa_reembolso?: boolean }) {
    setErro(null)
    setSalvando(true)

    try {
      const response = await fetch('/api/despesas/lote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseIds: [...selecionados], updates }),
      })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        console.error('[ListaDespesas] Falha na edição em massa', {
          status: response.status,
          quantidade: selecionados.size,
          updates,
          corpo,
        })
        throw new Error(
          corpo?.error ?? `Não foi possível atualizar as despesas (erro ${response.status}).`
        )
      }

      sairDoModoSelecao()
      router.refresh()
    } catch (error) {
      console.error('[ListaDespesas] Erro na edição em massa', { error })
      setErro(error instanceof Error ? error.message : 'Erro ao atualizar as despesas.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      {totalDespesas > 0 && (
        <div className="flex justify-end">
          {modoSelecao ? (
            <button
              type="button"
              onClick={sairDoModoSelecao}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/60"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Cancelar seleção
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setModoSelecao(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#6333ff]"
            >
              <CheckSquare className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Selecionar várias
            </button>
          )}
        </div>
      )}

      {grupos.map((grupo) => (
        <section key={grupo.chave} className="flex flex-col gap-2">
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
              const selecionado = selecionados.has(despesa.id)

              const conteudo = (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {modoSelecao &&
                        (selecionado ? (
                          <CheckSquare
                            className="h-5 w-5 shrink-0 text-[#6333ff]"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        ) : (
                          <Square
                            className="h-5 w-5 shrink-0 text-white/30"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        ))}

                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                        style={{ backgroundColor: `${categoria.cor}33` }}
                      >
                        {categoria.icone}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">
                            {despesa.merchant_name ?? 'Sem nome'}
                          </p>
                          {/* Só aparece quando true — o caso "não precisa" fica
                              sem nenhuma etiqueta, o visual mais neutro possível */}
                          {despesa.precisa_reembolso && (
                            <span className="shrink-0 rounded-full bg-[#6333ff]/15 px-2 py-0.5 text-[10px] font-semibold text-[#6333ff]">
                              Reembolsável
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: categoria.cor }}>
                          {categoria.rotulo}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{formatarMoeda(despesa.amount ?? 0)}</p>
                      <p className="text-xs text-white/50">
                        {despesa.expense_date ? formatarDataBR(despesa.expense_date) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Observação: só ocupa espaço quando preenchida, sem rótulo
                      solto nem linha vazia quando a despesa não tem uma */}
                  {despesa.observacoes && (
                    <p className="truncate pl-12 text-xs text-white/40">{despesa.observacoes}</p>
                  )}
                </>
              )

              const classesCartao =
                'flex w-full flex-col gap-1.5 rounded-xl border bg-white/5 px-4 py-3 text-left transition-colors'

              // Em modo de seleção o cartão vira botão (marca/desmarca) em vez
              // de link — senão tocar num item navegaria para fora da tela e
              // perderia a seleção inteira.
              return modoSelecao ? (
                <button
                  key={despesa.id}
                  type="button"
                  onClick={() => alternarSelecao(despesa.id)}
                  aria-pressed={selecionado}
                  className={`${classesCartao} ${
                    selecionado ? 'border-[#6333ff] bg-[#6333ff]/10' : 'border-white/10'
                  }`}
                >
                  {conteudo}
                </button>
              ) : (
                <Link
                  key={despesa.id}
                  href={`/despesas/${despesa.id}`}
                  className={`${classesCartao} border-white/10 hover:bg-white/10`}
                >
                  {conteudo}
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      {/* Espaçador: o pb-20 do <body> só cobre a altura do menu inferior. Sem
          isto, a barra de ação (bem mais alta) esconderia a última despesa da
          lista — justamente a que a usuária pode querer tocar para marcar. */}
      {modoSelecao && selecionados.size > 0 && <div aria-hidden="true" className="h-44" />}

      {/* Barra de ação fixa, posicionada acima do menu inferior (que também é
          fixo) para não ficar escondida atrás dele */}
      {modoSelecao && selecionados.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+60px)] z-50 border-t border-white/10 bg-[#12121e] px-4 py-3">
          <div className="mx-auto flex w-full max-w-md flex-col gap-2.5">
            <p className="text-sm font-semibold">
              {selecionados.size} despesa{selecionados.size === 1 ? '' : 's'} selecionada
              {selecionados.size === 1 ? '' : 's'}
            </p>

            {erro && <p className="text-sm text-red-400">{erro}</p>}

            <div className="flex gap-2">
              <select
                value={categoriaEscolhida}
                onChange={(e) => setCategoriaEscolhida(e.target.value)}
                disabled={salvando}
                aria-label="Nova categoria para as despesas selecionadas"
                className="flex-1 rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-2.5 text-sm text-white outline-none focus:border-[#6333ff] disabled:opacity-50"
              >
                <option value="">Alterar categoria...</option>
                {categorias.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => aplicarEmMassa({ category: categoriaEscolhida })}
                disabled={salvando || !categoriaEscolhida}
                className="rounded-lg bg-[#6333ff] px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => aplicarEmMassa({ precisa_reembolso: true })}
                disabled={salvando}
                className="flex-1 rounded-lg border border-[#00c8c8]/40 bg-[#00c8c8]/10 py-2.5 text-sm font-semibold text-[#00c8c8] transition-opacity disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Marcar reembolso'}
              </button>
              <button
                type="button"
                onClick={() => aplicarEmMassa({ precisa_reembolso: false })}
                disabled={salvando}
                className="flex-1 rounded-lg border border-white/20 py-2.5 text-sm font-semibold text-white/70 transition-opacity disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Desmarcar reembolso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
