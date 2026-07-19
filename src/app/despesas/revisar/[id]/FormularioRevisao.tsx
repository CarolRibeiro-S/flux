'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { lerClienteAtivoIdCookie } from '@/lib/clienteAtivoCookie'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'
import { obterTipoComprovante } from '@/lib/tiposComprovante'
import { SUGESTOES_CATEGORIA } from '@/lib/categorias'

type Despesa = {
  id: string
  merchant_name: string | null
  cnpj_emitente: string | null
  amount: number | null
  expense_date: string | null
  category: string | null
  observacoes: string | null
  precisa_reembolso: boolean | null
  tipo_comprovante: string | null
  image_path: string
}

type DespesaDuplicada = {
  id: string
  merchant_name: string | null
  amount: number | null
  expense_date: string | null
}

export function FormularioRevisao({
  despesa,
  despesaDuplicada,
}: {
  despesa: Despesa
  despesaDuplicada?: DespesaDuplicada | null
}) {
  const router = useRouter()
  const supabase = createClient()

  // Some ao dispensar o aviso ("revisar normalmente") ou depois de descartar
  const [avisoDuplicataVisivel, setAvisoDuplicataVisivel] = useState(Boolean(despesaDuplicada))

  const [estabelecimento, setEstabelecimento] = useState(despesa.merchant_name ?? '')
  const [cnpj, setCnpj] = useState(despesa.cnpj_emitente ?? '')
  const [valor, setValor] = useState(despesa.amount?.toString() ?? '')
  const [data, setData] = useState(despesa.expense_date ?? '')
  const [categoria, setCategoria] = useState(despesa.category ?? '')
  const [observacoes, setObservacoes] = useState(despesa.observacoes ?? '')
  // Padrão true ("Sim, eu paguei") quando a coluna ainda não tiver um valor
  // definido — mesmo default da migration (precisa_reembolso boolean default true)
  const [precisaReembolso, setPrecisaReembolso] = useState(despesa.precisa_reembolso ?? true)
  const [carregando, setCarregando] = useState<'confirmar' | 'descartar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Só informativo: mostra o que a extração identificou (nota fiscal ou
  // comprovante PIX). Não altera nenhum campo do formulário — os campos são
  // os mesmos para os dois tipos.
  const tipoComprovante = obterTipoComprovante(despesa.tipo_comprovante)

  async function handleConfirmar() {
    setErro(null)

    // Isolamento por cliente também nas mutações feitas via browser: sem um
    // cliente ativo no cookie, nem tenta salvar.
    const clienteAtivoId = lerClienteAtivoIdCookie()
    if (!clienteAtivoId) {
      setErro('Nenhum cliente ativo selecionado.')
      return
    }

    setCarregando('confirmar')

    const { error } = await supabase
      .from('expenses')
      .update({
        status: 'confirmado',
        merchant_name: estabelecimento || null,
        cnpj_emitente: cnpj || null,
        amount: valor ? Number(valor) : null,
        expense_date: data || null,
        category: categoria.trim() || null,
        observacoes: observacoes.trim() || null,
        precisa_reembolso: precisaReembolso,
      })
      .eq('id', despesa.id)
      .eq('cliente_id', clienteAtivoId)

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

    const clienteAtivoId = lerClienteAtivoIdCookie()
    if (!clienteAtivoId) {
      setErro('Nenhum cliente ativo selecionado.')
      return
    }

    setCarregando('descartar')

    // Despesa manual não tem comprovante no Storage (image_path vazio) — só
    // tenta remover o arquivo quando há um caminho de fato.
    if (despesa.image_path) {
      await supabase.storage.from('receipts').remove([despesa.image_path])
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', despesa.id)
      .eq('cliente_id', clienteAtivoId)

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
      {tipoComprovante && (
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: `${tipoComprovante.cor}33`, color: tipoComprovante.cor }}
        >
          {tipoComprovante.icone} {tipoComprovante.rotulo}
        </span>
      )}

      {avisoDuplicataVisivel && despesaDuplicada && (
        <div className="flex flex-col gap-3 rounded-xl border border-orange-400/40 bg-orange-400/10 p-4">
          <p className="text-sm text-orange-300">
            ⚠️ Já existe uma despesa parecida (mesmo valor, data e CNPJ) cadastrada para
            este cliente: <strong>{despesaDuplicada.merchant_name ?? 'Sem nome'}</strong>
            {' — '}
            {despesaDuplicada.amount != null ? formatarMoeda(despesaDuplicada.amount) : '—'}
            {' em '}
            {despesaDuplicada.expense_date ? formatarDataBR(despesaDuplicada.expense_date) : '—'}
            . Deseja continuar mesmo assim?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAvisoDuplicataVisivel(false)}
              disabled={desabilitado}
              className="flex-1 rounded-lg border border-orange-400/40 py-2 text-sm font-semibold text-orange-300 transition-opacity disabled:opacity-50"
            >
              Revisar normalmente
            </button>
            <button
              type="button"
              onClick={handleDescartar}
              disabled={desabilitado}
              className="flex-1 rounded-lg bg-orange-400/20 py-2 text-sm font-semibold text-orange-200 transition-opacity disabled:opacity-50"
            >
              {carregando === 'descartar' ? 'Descartando...' : 'Descartar esta despesa'}
            </button>
          </div>
        </div>
      )}

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
        <input
          id="categoria"
          type="text"
          list="sugestoes-categoria"
          placeholder="Ex: Farmácia, Estacionamento, Restaurante"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0f0f1a] px-3 py-3 text-white outline-none focus:border-[#6333ff]"
        />
        <datalist id="sugestoes-categoria">
          {SUGESTOES_CATEGORIA.map((sugestao) => (
            <option key={sugestao} value={sugestao} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="observacoes" className="text-sm text-white/80">
          Observações
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
