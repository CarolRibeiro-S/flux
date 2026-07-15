'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Trash2, CheckCircle2, RotateCcw } from 'lucide-react'
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
  loteId: string
  status: string
  despesas: Despesa[]
}

// Lê a resposta como texto e só então tenta interpretar como JSON, pra
// nunca quebrar com um erro de parse cru caso a API devolva outro formato
// (mesmo padrão usado em CapturaDespesa.tsx e SeletorDespesas.tsx)
async function lerCorpo(response: Response): Promise<{ error?: string } | null> {
  const texto = await response.text()
  try {
    return texto ? JSON.parse(texto) : null
  } catch {
    return null
  }
}

// Loga o erro completo no console (status HTTP, corpo bruto da resposta e o
// contexto da ação) e devolve uma mensagem para mostrar na tela. Quando o
// corpo não é um JSON com "error" (ex: a API devolveu uma página de erro
// genérica), inclui o status HTTP na mensagem em vez de um texto opaco —
// isso é o que faltava antes: um erro que falhava "silenciosamente" na
// prática, porque a mensagem genérica não dizia nada sobre a causa real.
function registrarEDescreverErro(
  contexto: string,
  response: Response,
  corpo: { error?: string } | null,
  mensagemPadrao: string
): string {
  console.error(`[GerenciarLote] ${contexto}`, {
    status: response.status,
    statusText: response.statusText,
    corpo,
  })
  return corpo?.error ?? `${mensagemPadrao} (erro ${response.status})`
}

export function GerenciarLote({ loteId, status, despesas }: Props) {
  const router = useRouter()
  const [removendoId, setRemovendoId] = useState<string | null>(null)
  const [atualizandoStatus, setAtualizandoStatus] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Reembolso pago é tratado como finalizado: as ações de edição de
  // conteúdo (remover/adicionar despesa, excluir o lote) ficam bloqueadas.
  // A única exceção é o próprio status, que pode ser revertido — ver botão
  // "Reabrir reembolso" mais abaixo.
  const pago = status === 'pago'

  async function handleRemoverDespesa(despesa: Despesa) {
    const confirmar = window.confirm(
      `Remover "${despesa.merchant_name ?? 'esta despesa'}" deste reembolso? Ela volta para o histórico.`
    )
    if (!confirmar) return

    setErro(null)
    setRemovendoId(despesa.id)

    try {
      const response = await fetch(`/api/reembolso/${loteId}/despesas`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseId: despesa.id }),
      })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        throw new Error(
          registrarEDescreverErro(
            `Falha ao remover despesa ${despesa.id} do lote ${loteId}`,
            response,
            corpo,
            'Não foi possível remover a despesa'
          )
        )
      }

      router.refresh()
    } catch (error) {
      console.error('[GerenciarLote] Erro ao remover despesa', { loteId, despesaId: despesa.id, error })
      setErro(error instanceof Error ? error.message : 'Erro ao remover despesa.')
    } finally {
      setRemovendoId(null)
    }
  }

  async function handleMarcarStatus(novoStatus: 'pago' | 'aberto') {
    setErro(null)
    setAtualizandoStatus(true)

    try {
      const response = await fetch(`/api/reembolso/${loteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
      })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        throw new Error(
          registrarEDescreverErro(
            `Falha ao atualizar status do lote ${loteId} para "${novoStatus}"`,
            response,
            corpo,
            'Não foi possível atualizar o status'
          )
        )
      }

      router.refresh()
    } catch (error) {
      console.error('[GerenciarLote] Erro ao atualizar status', { loteId, novoStatus, error })
      setErro(error instanceof Error ? error.message : 'Erro ao atualizar status.')
    } finally {
      setAtualizandoStatus(false)
    }
  }

  async function handleExcluirLote() {
    const confirmar = window.confirm(
      'Isso vai excluir este reembolso e devolver as despesas para o histórico. Confirma?'
    )
    if (!confirmar) return

    setErro(null)
    setExcluindo(true)

    try {
      const response = await fetch(`/api/reembolso/${loteId}`, { method: 'DELETE' })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        throw new Error(
          registrarEDescreverErro(
            `Falha ao excluir lote ${loteId}`,
            response,
            corpo,
            'Não foi possível excluir o reembolso'
          )
        )
      }

      router.push('/despesas/reembolso')
      router.refresh()
    } catch (error) {
      console.error('[GerenciarLote] Erro ao excluir reembolso', { loteId, error })
      setErro(error instanceof Error ? error.message : 'Erro ao excluir reembolso.')
      setExcluindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {pago && (
        <div className="flex items-center gap-2 rounded-xl border border-[#00c8c8]/40 bg-[#00c8c8]/10 px-4 py-3 text-[#00c8c8]">
          <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
          <p className="text-sm font-semibold">Reembolso pago — não pode mais ser editado</p>
        </div>
      )}

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
            Despesas incluídas
          </h2>
          {!pago && (
            <Link
              href={`/despesas/reembolso/${loteId}/adicionar`}
              className="text-xs font-semibold text-[#6333ff] hover:underline"
            >
              + Adicionar despesas
            </Link>
          )}
        </div>

        {despesas.length === 0 && (
          <p className="text-sm text-white/50">Nenhuma despesa neste reembolso.</p>
        )}

        <div className="flex flex-col gap-2">
          {despesas.map((despesa) => {
            const categoria = obterCategoria(despesa.category)
            return (
              <div
                key={despesa.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
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

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold">{formatarMoeda(despesa.amount ?? 0)}</p>
                    <p className="text-xs text-white/50">
                      {despesa.expense_date ? formatarDataBR(despesa.expense_date) : '—'}
                    </p>
                  </div>

                  {!pago && (
                    <button
                      type="button"
                      onClick={() => handleRemoverDespesa(despesa)}
                      disabled={removendoId === despesa.id}
                      aria-label="Remover despesa do reembolso"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {!pago && (
          <button
            type="button"
            onClick={() => handleMarcarStatus('pago')}
            disabled={atualizandoStatus}
            className="w-full rounded-xl bg-[#00c8c8] py-3 text-center font-semibold text-[#080810] transition-opacity disabled:opacity-50"
          >
            {atualizandoStatus ? 'Atualizando...' : 'Marcar como pago'}
          </button>
        )}

        {pago && (
          <button
            type="button"
            onClick={() => handleMarcarStatus('aberto')}
            disabled={atualizandoStatus}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 py-3 text-center text-sm font-semibold text-white/70 transition-opacity disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {atualizandoStatus ? 'Atualizando...' : 'Reabrir reembolso (desmarcar como pago)'}
          </button>
        )}

        {!pago && (
          <button
            type="button"
            onClick={handleExcluirLote}
            disabled={excluindo}
            className="w-full rounded-xl border border-red-500/40 py-3 text-center font-semibold text-red-400 transition-opacity disabled:opacity-50"
          >
            {excluindo ? 'Excluindo...' : 'Excluir reembolso'}
          </button>
        )}
      </div>
    </div>
  )
}
