import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'
import { obterTipoComprovante } from '@/lib/tiposComprovante'
import { obterStatusReembolso } from '@/lib/statusReembolso'
import { buscarLotesDaDespesa } from '@/lib/reembolsoDespesas'
import { ExcluirDespesaButton } from './ExcluirDespesaButton'

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

  const clienteAtivo = await obterClienteAtivo()

  // Filtro triplo: id + user_id + cliente_id do cliente ativo. Uma despesa
  // de outro cliente nunca deve ser encontrada aqui — cai direto no notFound.
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

  // A mesma despesa pode estar em VÁRIOS reembolsos ao mesmo tempo, então
  // buscamos todos (via reembolso_despesas, já filtrado por cliente_id).
  // Um único lote pago basta para bloquear a exclusão.
  const lotesRelacionados = await buscarLotesDaDespesa(
    supabase,
    despesa.id,
    clienteAtivo.id,
    user.id
  )

  const emReembolso = lotesRelacionados.length > 0
  const reembolsoPago = lotesRelacionados.some((lote) => lote.status === 'pago')

  const categoria = obterCategoria(despesa.category)
  // Etiqueta discreta, só informativa: nota fiscal ou comprovante PIX
  const tipoComprovante = obterTipoComprovante(despesa.tipo_comprovante)

  return (
    <div className="min-h-screen bg-[#080810] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Link href="/despesas" className="text-sm text-white/60 hover:text-white">
          ← Histórico
        </Link>

        {urlAssinada?.signedUrl && (
          <div className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urlAssinada.signedUrl}
                alt="Foto do comprovante da despesa"
                className="w-full object-cover"
              />
            </div>

            {tipoComprovante && (
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: `${tipoComprovante.cor}33`, color: tipoComprovante.cor }}
              >
                {tipoComprovante.icone} {tipoComprovante.rotulo}
              </span>
            )}
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

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Precisa de reembolso</span>
            {despesa.precisa_reembolso ? (
              <span className="rounded-full bg-[#6333ff]/15 px-2.5 py-1 text-xs font-semibold text-[#6333ff]">
                Sim
              </span>
            ) : (
              <span className="text-sm font-medium text-white/60">Não</span>
            )}
          </div>
        </div>

        {/* Uma despesa pode estar em mais de um reembolso — lista todos */}
        {lotesRelacionados.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-5">
            <span className="text-sm text-white/50">
              {lotesRelacionados.length === 1
                ? 'Incluída em 1 reembolso'
                : `Incluída em ${lotesRelacionados.length} reembolsos`}
            </span>

            <div className="flex flex-col gap-2">
              {lotesRelacionados.map((lote) => {
                const status = obterStatusReembolso(lote.status)
                return (
                  <Link
                    key={lote.id}
                    href={`/despesas/reembolso/${lote.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2.5 transition-colors hover:bg-white/5"
                  >
                    <span className="truncate text-sm">
                      {lote.period_start ? formatarDataBR(lote.period_start) : '—'} –{' '}
                      {lote.period_end ? formatarDataBR(lote.period_end) : '—'}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: `${status.cor}33`, color: status.cor }}
                    >
                      {status.rotulo}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

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

        <ExcluirDespesaButton
          despesaId={despesa.id}
          emReembolso={emReembolso}
          reembolsoPago={reembolsoPago}
        />
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
