'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TecladoNumerico } from '@/components/TecladoNumerico'

export function VerificarPinForm() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [verificando, setVerificando] = useState(false)

  function handleMudar(novoValor: string) {
    setErro(null)
    setPin(novoValor)
  }

  async function handleConfirmar() {
    if (pin.length < 4 || verificando) return

    setErro(null)
    setVerificando(true)

    try {
      const response = await fetch('/api/pin/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      const textoResposta = await response.text()
      let corpo: { error?: string } | null = null
      try {
        corpo = textoResposta ? JSON.parse(textoResposta) : null
      } catch {
        corpo = null
      }

      if (!response.ok) {
        throw new Error(corpo?.error ?? 'PIN incorreto.')
      }

      router.push('/selecionar-cliente')
      router.refresh()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao verificar o PIN.')
      setPin('')
      setVerificando(false)
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6">
      <TecladoNumerico valor={pin} onChange={handleMudar} maxLength={6} />

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <button
        type="button"
        onClick={handleConfirmar}
        disabled={pin.length < 4 || verificando}
        className="w-full rounded-xl bg-[#6333ff] py-4 text-lg font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {verificando ? 'Verificando...' : 'Confirmar'}
      </button>
    </div>
  )
}
