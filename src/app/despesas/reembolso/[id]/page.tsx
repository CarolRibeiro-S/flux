import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'
import { obterStatusReembolso } from '@/lib/statusReembolso'
import { GerenciarLote } from './GerenciarLote'
import { GerarPdfButton } from './GerarPdfButton'

type Despesa = {
  id: string
  merchant_name: string | null
  category: string | null
  amount: number | null
  expense_date: string | null
}

export default async function DetalheReembolsoPage({
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

  const clienteAtivo = await obterClienteAtivo()

  // Filtro triplo do lote: id + user_id + cliente_id do cliente ativo. Um
  // lote de outro cliente nunca deve ser encontrado aqui.
  const { data: lote, error } = await supabase
    .from('reimbursement_batches')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('cliente_id', clienteAtivo.id)
    .single()

  if (error || !lote) {
    notFound()
  }

  // Reforço redundante: mesmo já sabendo que o lote é do cliente ativo,
  // filtra as despesas também por cliente_id
  const { data: despesas } = await supabase
    .from('expenses')
    .select('id, merchant_name, category, amount, expense_date')
    .eq('batch_id', lote.id)
    .eq('cliente_id', clienteAtivo.id)
    .order('expense_date', { ascending: true })

  const listaDespesas = (despesas ?? []) as Despesa[]
  const status = obterStatusReembolso(lote.status)

  let urlPdf: string | null = null
  if (lote.pdf_path) {
    const { data: assinatura } = await supabase.storage
      .from('reimbursements')
      .createSignedUrl(lote.pdf_path, 300)
    urlPdf = assinatura?.signedUrl ?? null
  }

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link href="/despesas/reembolso" className="text-sm text-white/60 hover:text-white">
          ← Reembolsos
        </Link>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">
                {lote.period_start ? formatarDataBR(lote.period_start) : '—'} –{' '}
                {lote.period_end ? formatarDataBR(lote.period_end) : '—'}
              </p>
              <p className="text-3xl font-bold text-[#00c8c8]">
                {formatarMoeda(lote.total_amount ?? 0)}
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: `${status.cor}33`, color: status.cor }}
            >
              {status.rotulo}
            </span>
          </div>

          {urlPdf ? (
            <a
              href={urlPdf}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-xl bg-[#00c8c8] py-3 text-center font-semibold text-[#080810]"
            >
              Baixar PDF
            </a>
          ) : (
            <GerarPdfButton loteId={lote.id} />
          )}
        </div>

        <GerenciarLote loteId={lote.id} status={lote.status} despesas={listaDespesas} />
      </div>
    </div>
  )
}
