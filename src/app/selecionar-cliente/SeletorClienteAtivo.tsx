'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { definirClienteAtivoCookie } from '@/lib/clienteAtivoCookie'

type Cliente = { id: string; nome: string }

export function SeletorClienteAtivo({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter()
  const [nomeNovo, setNomeNovo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function escolher(clienteId: string) {
    definirClienteAtivoCookie(clienteId)
    router.push('/')
    router.refresh()
  }

  async function criarEEscolher() {
    if (!nomeNovo.trim()) return

    setErro(null)
    setCarregando(true)

    try {
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeNovo }),
      })

      if (!response.ok) {
        throw new Error('Não foi possível criar o cliente.')
      }

      const { cliente } = (await response.json()) as { cliente: Cliente }
      escolher(cliente.id)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao criar cliente.')
      setCarregando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {clientes.length > 0 && (
        <div className="flex flex-col gap-2">
          {clientes.map((cliente) => (
            <button
              key={cliente.id}
              type="button"
              onClick={() => escolher(cliente.id)}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left text-lg font-semibold transition-colors hover:border-[#6333ff] hover:bg-[#6333ff]/10"
            >
              {cliente.nome}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/80">Novo cliente</p>
        <input
          type="text"
          value={nomeNovo}
          onChange={(e) => setNomeNovo(e.target.value)}
          placeholder="Nome do cliente"
          className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        />
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <button
          type="button"
          onClick={criarEEscolher}
          disabled={!nomeNovo.trim() || carregando}
          className="w-full rounded-xl bg-[#00c8c8] py-3 text-base font-semibold text-[#080810] transition-opacity disabled:opacity-50"
        >
          {carregando ? 'Criando...' : 'Criar e continuar'}
        </button>
      </div>
    </div>
  )
}
