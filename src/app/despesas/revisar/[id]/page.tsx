import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { FormularioRevisao } from './FormularioRevisao'

export default async function RevisarDespesaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ duplicata?: string }>
}) {
  const { id } = await params
  const { duplicata: duplicataId } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const clienteAtivo = await obterClienteAtivo()

  // Filtro triplo: id + user_id + cliente_id do cliente ativo
  const { data: despesa, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (error || !despesa) {
    notFound()
  }

  const { data: urlAssinada } = await supabase.storage
    .from('receipts')
    .createSignedUrl(despesa.image_path, 300)

  // Despesa parecida sinalizada por /api/extract (possivel_duplicata) — busca
  // só um resumo pra exibir no aviso, sempre re-filtrando por user_id e
  // cliente_id: o id chega via query string, nunca confia nele sozinho.
  let despesaDuplicada: {
    id: string
    merchant_name: string | null
    amount: number | null
    expense_date: string | null
  } | null = null

  if (duplicataId) {
    const { data } = await supabase
      .from('expenses')
      .select('id, merchant_name, amount, expense_date')
      .eq('id', duplicataId)
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .single()

    despesaDuplicada = data ?? null
  }

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <h1 className="text-2xl font-semibold">Revisar despesa</h1>

        {urlAssinada?.signedUrl && (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlAssinada.signedUrl}
              alt="Foto da nota fiscal"
              className="w-full object-cover"
            />
          </div>
        )}

        <FormularioRevisao despesa={despesa} despesaDuplicada={despesaDuplicada} />
      </div>
    </div>
  )
}
