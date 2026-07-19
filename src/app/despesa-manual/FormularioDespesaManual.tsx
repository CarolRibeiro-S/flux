'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SUGESTOES_CATEGORIA } from '@/lib/categorias'

// Data de hoje no formato YYYY-MM-DD, no fuso local. Evita new Date(iso), que
// seria interpretado como UTC e poderia cair no dia errado (mesma precaução
// de formatarDataBR em @/lib/formatadores).
function dataDeHoje() {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

// Lê a resposta como texto e só então tenta interpretar como JSON, mesmo
// padrão do resto do app (CapturaDespesa, GerenciarLote, etc.).
async function lerCorpo(response: Response): Promise<{ id?: string; error?: string } | null> {
  const texto = await response.text()
  try {
    return texto ? JSON.parse(texto) : null
  } catch {
    return null
  }
}

export function FormularioDespesaManual() {
  const router = useRouter()

  const [estabelecimento, setEstabelecimento] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(dataDeHoje())
  const [categoria, setCategoria] = useState('')
  const [observacoes, setObservacoes] = useState('')
  // Padrão true ("Sim, eu paguei"), igual ao formulário de revisão
  const [precisaReembolso, setPrecisaReembolso] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSalvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    // Validação no cliente espelha a do servidor — o servidor continua sendo
    // a autoridade, isto só evita uma ida ao banco para erros óbvios.
    const nome = estabelecimento.trim()
    if (!nome) {
      setErro('Informe o estabelecimento.')
      return
    }
    const valorNumerico = Number(valor)
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      setErro('Informe um valor maior que zero.')
      return
    }
    if (!data) {
      setErro('Informe a data.')
      return
    }

    setSalvando(true)

    try {
      const response = await fetch('/api/despesas/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_name: nome,
          cnpj_emitente: cnpj.trim() || null,
          amount: valorNumerico,
          expense_date: data,
          category: categoria.trim() || null,
          precisa_reembolso: precisaReembolso,
          observacoes: observacoes.trim() || null,
        }),
      })
      const corpo = await lerCorpo(response)

      if (!response.ok) {
        console.error('[FormularioDespesaManual] Falha ao salvar', {
          status: response.status,
          corpo,
        })
        throw new Error(corpo?.error ?? `Não foi possível salvar a despesa (erro ${response.status}).`)
      }

      if (!corpo?.id) {
        throw new Error('Resposta inesperada do servidor.')
      }

      // Vai para o detalhe da despesa recém-criada: confirma exatamente o que
      // foi salvo e já oferece editar/excluir/incluir em reembolso. Voltar
      // para a home (tela de captura) daria a sensação de que "nada aconteceu".
      router.push(`/despesas/${corpo.id}`)
      router.refresh()
    } catch (error) {
      console.error('[FormularioDespesaManual] Erro ao salvar', { error })
      setErro(error instanceof Error ? error.message : 'Erro ao salvar a despesa.')
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={handleSalvar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="estabelecimento" className="text-sm text-white/80">
          Estabelecimento
        </label>
        <input
          id="estabelecimento"
          type="text"
          value={estabelecimento}
          onChange={(e) => setEstabelecimento(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cnpj" className="text-sm text-white/80">
          CNPJ <span className="text-white/40">(opcional)</span>
        </label>
        <input
          id="cnpj"
          type="text"
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="valor" className="text-sm text-white/80">
          Valor
        </label>
        <input
          id="valor"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="0,00"
          className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="data" className="text-sm text-white/80">
          Data
        </label>
        <input
          id="data"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="categoria" className="text-sm text-white/80">
          Categoria <span className="text-white/40">(opcional)</span>
        </label>
        <input
          id="categoria"
          type="text"
          list="sugestoes-categoria-manual"
          placeholder="Ex: Farmácia, Estacionamento, Restaurante"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        />
        <datalist id="sugestoes-categoria-manual">
          {SUGESTOES_CATEGORIA.map((sugestao) => (
            <option key={sugestao} value={sugestao} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="observacoes" className="text-sm text-white/80">
          Observações <span className="text-white/40">(opcional)</span>
        </label>
        <textarea
          id="observacoes"
          rows={3}
          placeholder="Ex: reunião com cliente X, viagem a trabalho"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          className="resize-none rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-white/80">Esta despesa precisa de reembolso?</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPrecisaReembolso(true)}
            aria-pressed={precisaReembolso}
            className={`flex-1 rounded-lg border py-3 text-sm font-semibold transition-colors ${
              precisaReembolso
                ? 'border-[#6333ff] bg-[#6333ff]/15 text-[#6333ff]'
                : 'border-white/10 bg-[#0f0f1a] text-white/50'
            }`}
          >
            Sim, eu paguei
          </button>
          <button
            type="button"
            onClick={() => setPrecisaReembolso(false)}
            aria-pressed={!precisaReembolso}
            className={`flex-1 rounded-lg border py-3 text-sm font-semibold transition-colors ${
              !precisaReembolso
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/10 bg-[#0f0f1a] text-white/50'
            }`}
          >
            Não, cartão da casa
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <button
        type="submit"
        disabled={salvando}
        className="mt-2 w-full rounded-xl bg-[#00c8c8] py-4 text-lg font-semibold text-[#080810] transition-opacity disabled:opacity-50"
      >
        {salvando ? 'Salvando...' : 'Salvar despesa'}
      </button>
    </form>
  )
}
