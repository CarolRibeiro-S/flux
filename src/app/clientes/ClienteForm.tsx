'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  clienteId?: string
  nomeInicial?: string
  aoSalvar?: () => void
  aoCancelar?: () => void
}

// Componente reutilizável: sem clienteId, cria um cliente novo; com
// clienteId, edita o existente.
export function ClienteForm({ clienteId, nomeInicial = '', aoSalvar, aoCancelar }: Props) {
  const router = useRouter()
  const [nome, setNome] = useState(nomeInicial)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const editando = Boolean(clienteId)

  async function handleSalvar() {
    if (!nome.trim()) {
      setErro('Informe um nome.')
      return
    }

    setErro(null)
    setCarregando(true)

    try {
      const response = await fetch(editando ? `/api/clientes/${clienteId}` : '/api/clientes', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      })

      if (!response.ok) {
        throw new Error('Não foi possível salvar o cliente.')
      }

      if (!editando) setNome('')
      router.refresh()
      aoSalvar?.()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao salvar cliente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome do cliente"
        className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
      />

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={carregando}
          className="flex-1 rounded-lg bg-[#6333ff] py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {carregando ? 'Salvando...' : editando ? 'Salvar' : 'Adicionar cliente'}
        </button>
        {aoCancelar && (
          <button
            type="button"
            onClick={aoCancelar}
            disabled={carregando}
            className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
