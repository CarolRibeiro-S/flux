import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FormularioRevisao } from './FormularioRevisao'

export default async function RevisarDespesaPage({
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

        <FormularioRevisao despesa={despesa} />
      </div>
    </div>
  )
}
