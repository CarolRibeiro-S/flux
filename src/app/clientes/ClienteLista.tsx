'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClienteForm } from './ClienteForm'

type Cliente = { id: string; nome: string }

export function ClienteLista({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter()
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function handleExcluir(cliente: Cliente) {
    setErro(null)
    setExcluindoId(cliente.id)

    try {
      let response = await fetch(`/api/clientes/${cliente.id}`, { method: 'DELETE' })

      // 409: o backend está avisando que há despesas vinculadas a esse
      // cliente e pedindo confirmação explícita antes de desvinculá-las
      if (response.status === 409) {
        const dados = (await response.json()) as { mensagem?: string }
        const confirmar = window.confirm(
          `${dados.mensagem ?? 'Este cliente tem despesas vinculadas.'} Deseja continuar mesmo assim?`
        )
        if (!confirmar) {
          setExcluindoId(null)
          return
        }
        response = await fetch(`/api/clientes/${cliente.id}?confirmar=true`, { method: 'DELETE' })
      }

      if (!response.ok) {
        throw new Error('Não foi possível excluir o cliente.')
      }

      router.refresh()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao excluir cliente.')
    } finally {
      setExcluindoId(null)
    }
  }

  if (clientes.length === 0) {
    return <p className="text-sm text-white/50">Nenhum cliente cadastrado ainda.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {erro && <p className="text-sm text-red-400">{erro}</p>}

      {clientes.map((cliente) => (
        <div key={cliente.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
          {editandoId === cliente.id ? (
            <ClienteForm
              clienteId={cliente.id}
              nomeInicial={cliente.nome}
              aoSalvar={() => setEditandoId(null)}
              aoCancelar={() => setEditandoId(null)}
            />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{cliente.nome}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditandoId(cliente.id)}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleExcluir(cliente)}
                  disabled={excluindoId === cliente.id}
                  className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-400 disabled:opacity-50"
                >
                  {excluindoId === cliente.id ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
