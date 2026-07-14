import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'
import { obterStatusReembolso } from '@/lib/statusReembolso'

type Lote = {
  id: string
  period_start: string | null
  period_end: string | null
  total_amount: number | null
  status: string
  pdf_path: string | null
}

export default async function ReembolsoPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: lotes } = await supabase
    .from('reimbursement_batches')
    .select('id, period_start, period_end, total_amount, status, pdf_path')
    .eq('user_id', user.id)
    .order('period_end', { ascending: false })

  const listaLotes = (lotes ?? []) as Lote[]

  // Gera as signed URLs dos PDFs já gerados em paralelo
  const urlsPdf = await Promise.all(
    listaLotes.map(async (lote) => {
      if (!lote.pdf_path) return null
      const { data } = await supabase.storage
        .from('reimbursements')
        .createSignedUrl(lote.pdf_path, 300)
      return data?.signedUrl ?? null
    })
  )

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        {/* Link "← Despesas" removido: já coberto pelo item "Histórico" do menu inferior */}
        <header className="flex items-center justify-end">
          <Link
            href="/despesas/reembolso/novo"
            className="rounded-lg bg-[#6333ff] px-4 py-2 text-sm font-semibold text-white"
          >
            + Novo reembolso
          </Link>
        </header>

        <h1 className="text-2xl font-semibold">Reembolsos</h1>

        {listaLotes.length === 0 && (
          <p className="text-sm text-white/50">Nenhum lote de reembolso criado ainda.</p>
        )}

        <div className="flex flex-col gap-3">
          {listaLotes.map((lote, indice) => {
            const status = obterStatusReembolso(lote.status)
            const urlPdf = urlsPdf[indice]

            return (
              <div
                key={lote.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">
                      {lote.period_start ? formatarDataBR(lote.period_start) : '—'} –{' '}
                      {lote.period_end ? formatarDataBR(lote.period_end) : '—'}
                    </p>
                    <p className="text-xl font-bold text-[#00c8c8]">
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

                {urlPdf && (
                  <a
                    href={urlPdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#6333ff] hover:underline"
                  >
                    Baixar PDF
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
