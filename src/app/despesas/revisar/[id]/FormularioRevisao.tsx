'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const CATEGORIAS = [
  { valor: 'alimentacao', rotulo: 'Alimentação' },
  { valor: 'transporte', rotulo: 'Transporte' },
  { valor: 'hospedagem', rotulo: 'Hospedagem' },
  { valor: 'material', rotulo: 'Material' },
  { valor: 'outros', rotulo: 'Outros' },
] as const

type Despesa = {
  id: string
  merchant_name: string | null
  cnpj_emitente: string | null
  amount: number | null
  expense_date: string | null
  category: string | null
  image_path: string
}

export function FormularioRevisao({ despesa }: { despesa: Despesa }) {
  const router = useRouter()
  const supabase = createClient()

  const [estabelecimento, setEstabelecimento] = useState(despesa.merchant_name ?? '')
  const [cnpj, setCnpj] = useState(despesa.cnpj_emitente ?? '')
  const [valor, setValor] = useState(despesa.amount?.toString() ?? '')
  const [data, setData] = useState(despesa.expense_date ?? '')
  const [categoria, setCategoria] = useState(despesa.category ?? 'outros')
  const [carregando, setCarregando] = useState<'confirmar' | 'descartar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function handleConfirmar() {
    setErro(null)
    setCarregando('confirmar')

    const { error } = await supabase
      .from('expenses')
      .update({
        status: 'confirmado',
        merchant_name: estabelecimento || null,
        cnpj_emitente: cnpj || null,
        amount: valor ? Number(valor) : null,
        expense_date: data || null,
        category: categoria,
      })
      .eq('id', despesa.id)

    if (error) {
      setErro('Não foi possível salvar a despesa.')
      setCarregando(null)
      return
    }

    router.push('/')
    router.refresh()
  }

  async function handleDescartar() {
    setErro(null)
    setCarregando('descartar')

    await supabase.storage.from('receipts').remove([despesa.image_path])

    const { error } = await supabase.from('expenses').delete().eq('id', despesa.id)

    if (error) {
      setErro('Não foi possível descartar a despesa.')
      setCarregando(null)
      return
    }

    router.push('/')
    router.refresh()
  }

  const desabilitado = carregando !== null

  return (
    <div className="flex flex-col gap-4">
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
          CNPJ
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
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
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
          Categoria
        </label>
        <select
          id="categoria"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        >
          {CATEGORIAS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <div className="mt-2 flex flex-col gap-3">
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={desabilitado}
          className="w-full rounded-xl bg-[#00c8c8] py-4 text-lg font-semibold text-[#080810] transition-opacity disabled:opacity-50"
        >
          {carregando === 'confirmar' ? 'Salvando...' : 'Confirmar despesa'}
        </button>

        <button
          type="button"
          onClick={handleDescartar}
          disabled={desabilitado}
          className="w-full rounded-xl border border-white/20 py-4 text-lg font-semibold text-white/80 transition-opacity disabled:opacity-50"
        >
          {carregando === 'descartar' ? 'Descartando...' : 'Descartar'}
        </button>
      </div>
    </div>
  )
}
