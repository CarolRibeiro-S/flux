'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TecladoNumerico } from '@/components/TecladoNumerico'

type Etapa = 'digitar' | 'confirmar'

// Fluxo em duas etapas (digitar, depois confirmar) reaproveitando o mesmo
// teclado — funciona tanto pra definir o PIN pela primeira vez quanto pra
// trocar um já existente (a rota POST /api/pin cobre os dois casos).
export function ConfigurarPinForm() {
  const router = useRouter()
  const [etapa, setEtapa] = useState<Etapa>('digitar')
  const [pin, setPin] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const valorAtual = etapa === 'digitar' ? pin : confirmacao
  const setValorAtual = etapa === 'digitar' ? setPin : setConfirmacao

  function handleMudar(novoValor: string) {
    setErro(null)
    setValorAtual(novoValor)
  }

  function handleContinuar() {
    if (pin.length < 4) return
    setEtapa('confirmar')
  }

  function handleVoltar() {
    setConfirmacao('')
    setErro(null)
    setEtapa('digitar')
  }

  async function handleSalvar() {
    if (confirmacao.length < 4 || salvando) return

    if (confirmacao !== pin) {
      setErro('Os PINs não coincidem. Tente de novo.')
      setConfirmacao('')
      return
    }

    setErro(null)
    setSalvando(true)

    try {
      const response = await fetch('/api/pin', {
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
        throw new Error(corpo?.error ?? 'Não foi possível salvar o PIN.')
      }

      // Definir/confirmar o PIN corretamente já prova que o usuário o
      // conhece; a rota já marca a verificação, então segue direto.
      router.push('/selecionar-cliente')
      router.refresh()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar o PIN.')
      setSalvando(false)
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6">
      <p className="text-center text-sm text-white/50">
        {etapa === 'digitar'
          ? 'Digite um PIN de 4 a 6 dígitos'
          : 'Digite o PIN novamente para confirmar'}
      </p>

      <TecladoNumerico valor={valorAtual} onChange={handleMudar} maxLength={6} />

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      {etapa === 'digitar' ? (
        <button
          type="button"
          onClick={handleContinuar}
          disabled={pin.length < 4}
          className="w-full rounded-xl bg-[#6333ff] py-4 text-lg font-semibold text-white transition-opacity disabled:opacity-40"
        >
          Continuar
        </button>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={handleSalvar}
            disabled={confirmacao.length < 4 || salvando}
            className="w-full rounded-xl bg-[#00c8c8] py-4 text-lg font-semibold text-[#080810] transition-opacity disabled:opacity-40"
          >
            {salvando ? 'Salvando...' : 'Salvar PIN'}
          </button>
          <button
            type="button"
            onClick={handleVoltar}
            disabled={salvando}
            className="text-sm text-white/60 underline-offset-4 hover:underline disabled:opacity-40"
          >
            Voltar
          </button>
        </div>
      )}
    </div>
  )
}
