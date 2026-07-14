import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'

const ROTULOS_STATUS: Record<string, string> = {
  pendente_revisao: 'Pendente de revisão',
  confirmado: 'Confirmado',
}

export default async function DetalheDespesaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Filtra também por user_id como reforço de segurança além do RLS
  const { data: despesa, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !despesa) {
    notFound()
  }

  const { data: urlAssinada } = await supabase.storage
    .from('receipts')
    .createSignedUrl(despesa.image_path, 300)

  const categoria = obterCategoria(despesa.category)

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link href="/despesas" className="text-sm text-white/60 hover:text-white">
          ← Histórico
        </Link>

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

        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: `${categoria.cor}33`, color: categoria.cor }}
            >
              {categoria.icone} {categoria.rotulo}
            </span>
            <span className="text-xs text-white/50">
              {ROTULOS_STATUS[despesa.status] ?? despesa.status}
            </span>
          </div>

          <Campo rotulo="Estabelecimento" valor={despesa.merchant_name ?? '—'} />
          <Campo rotulo="CNPJ" valor={despesa.cnpj_emitente ?? '—'} />
          <Campo
            rotulo="Valor"
            valor={despesa.amount != null ? formatarMoeda(despesa.amount) : '—'}
          />
          <Campo
            rotulo="Data"
            valor={despesa.expense_date ? formatarDataBR(despesa.expense_date) : '—'}
          />
        </div>

        {despesa.observacoes && (
          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-5">
            <span className="text-sm text-white/50">Observações</span>
            <p className="whitespace-pre-wrap text-white/90">{despesa.observacoes}</p>
          </div>
        )}

        <Link
          href={`/despesas/revisar/${despesa.id}`}
          className="w-full rounded-xl bg-[#6333ff] py-4 text-center text-lg font-semibold text-white"
        >
          Editar
        </Link>
      </div>
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-white/50">{rotulo}</span>
      <span className="font-medium">{valor}</span>
    </div>
  )
}
