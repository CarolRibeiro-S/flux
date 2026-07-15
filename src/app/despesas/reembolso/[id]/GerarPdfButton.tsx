'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Lê a resposta como texto e só então tenta interpretar como JSON, pra
// nunca quebrar com um erro de parse cru caso a API devolva outro formato
async function lerCorpo(response: Response): Promise<{ error?: string } | null> {
  const texto = await response.text()
  try {
    return texto ? JSON.parse(texto) : null
  } catch {
    return null
  }
}

// Causa raiz do bug "Gerar PDF não funciona na primeira tentativa": o botão
// era um <form action="/api/..." method="POST"> nativo. O browser de fato
// aguarda a resposta antes de seguir o redirect — isso já funcionava — mas
// dentro da WebView do Capacitor não existe nenhuma barra de endereço/spinner
// nativo visível durante essa espera. A geração do PDF embute fotos das
// notas fiscais e pode levar vários segundos; sem nenhum feedback na tela,
// a usuária via a tela "congelada" e concluía que não tinha funcionado.
// Trocar para um botão controlado via fetch() dá um estado de carregamento
// visível e garante explicitamente que a UI só muda depois da resposta.
export function GerarPdfButton({ loteId }: { loteId: string }) {
  const router = useRouter()
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleGerar() {
    setErro(null)
    setGerando(true)

    try {
      const response = await fetch(`/api/reembolso/${loteId}/pdf`, { method: 'POST' })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        console.error('[GerarPdfButton] Falha ao gerar PDF', {
          loteId,
          status: response.status,
          corpo,
        })
        throw new Error(corpo?.error ?? `Não foi possível gerar o PDF (erro ${response.status}).`)
      }

      // Server Component é re-executado com os dados atualizados
      // (pdf_path já preenchido); a tela troca para "Baixar PDF" sozinha.
      router.refresh()
    } catch (error) {
      console.error('[GerarPdfButton] Erro ao gerar PDF', { loteId, error })
      setErro(error instanceof Error ? error.message : 'Erro ao gerar o PDF.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleGerar}
        disabled={gerando}
        className="w-full rounded-xl bg-[#6333ff] py-3 text-center font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {gerando ? 'Gerando PDF...' : 'Gerar PDF'}
      </button>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </div>
  )
}
