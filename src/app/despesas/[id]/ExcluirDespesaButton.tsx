'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

// Lê a resposta como texto e só então tenta interpretar como JSON, pra nunca
// quebrar com um erro de parse cru caso a API devolva outro formato (mesmo
// padrão do resto do app: CapturaDespesa, GerenciarLote, GerarPdfButton).
async function lerCorpo(response: Response): Promise<{ error?: string } | null> {
  const texto = await response.text()
  try {
    return texto ? JSON.parse(texto) : null
  } catch {
    return null
  }
}

type Props = {
  despesaId: string
  // Despesa vinculada a um lote de reembolso ainda editável: a exclusão a
  // remove também desse reembolso e recalcula o total do lote.
  emReembolso: boolean
  // Vinculada a um lote já pago: exclusão bloqueada (o servidor também barra).
  reembolsoPago: boolean
}

export function ExcluirDespesaButton({ despesaId, emReembolso, reembolsoPago }: Props) {
  const router = useRouter()
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Faz parte de um reembolso pago: não oferece a ação, só explica o porquê —
  // evita que a usuária tente e receba um erro.
  if (reembolsoPago) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/50">
        Esta despesa faz parte de um reembolso já pago e não pode ser excluída.
      </p>
    )
  }

  async function handleExcluir() {
    const mensagem = emReembolso
      ? 'Excluir esta despesa? Esta ação não pode ser desfeita.\n\nAtenção: ela também será removida do reembolso a que está vinculada, e o total desse reembolso será recalculado.'
      : 'Excluir esta despesa? Esta ação não pode ser desfeita.'

    if (!window.confirm(mensagem)) return

    setErro(null)
    setExcluindo(true)

    try {
      const response = await fetch(`/api/despesas/${despesaId}`, { method: 'DELETE' })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        console.error('[ExcluirDespesaButton] Falha ao excluir despesa', {
          despesaId,
          status: response.status,
          corpo,
        })
        throw new Error(corpo?.error ?? `Não foi possível excluir a despesa (erro ${response.status}).`)
      }

      router.push('/despesas')
      router.refresh()
    } catch (error) {
      console.error('[ExcluirDespesaButton] Erro ao excluir despesa', { despesaId, error })
      setErro(error instanceof Error ? error.message : 'Erro ao excluir a despesa.')
      setExcluindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleExcluir}
        disabled={excluindo}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 py-4 text-lg font-semibold text-red-400 transition-opacity disabled:opacity-50"
      >
        <Trash2 className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        {excluindo ? 'Excluindo...' : 'Excluir despesa'}
      </button>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </div>
  )
}
