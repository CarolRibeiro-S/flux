'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Images } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadReceiptImage } from '@/lib/supabase/upload'
import { CabecalhoCliente } from '@/components/CabecalhoCliente'

type Status = 'idle' | 'uploading' | 'extracting'

export function CapturaDespesa({ clienteNome }: { clienteNome: string }) {
  const router = useRouter()
  const supabase = createClient()
  // Dois inputs separados: um força a câmera (capture="environment"), o
  // outro abre o seletor de arquivos/galeria normal do aparelho — sem o
  // atributo capture, que é justamente o que escondia a opção de galeria.
  const inputCameraRef = useRef<HTMLInputElement>(null)
  const inputGaleriaRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [supabase])

  // Libera a URL do preview anterior sempre que trocar de arquivo/desmontar
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    if (!selected) return

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
    setErrorMsg(null)
  }

  function handleEscolherOutra() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setErrorMsg(null)
    if (inputCameraRef.current) inputCameraRef.current.value = ''
    if (inputGaleriaRef.current) inputGaleriaRef.current.value = ''
  }

  async function handleEnviar() {
    if (!file || !userId) return

    setErrorMsg(null)

    try {
      setStatus('uploading')
      const imagePath = await uploadReceiptImage(file, userId)

      setStatus('extracting')
      // Não envia cliente_id aqui de propósito: o servidor determina o
      // cliente ativo a partir do cookie (obterClienteAtivo), nunca a partir
      // de um valor vindo do front-end.
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath }),
      })

      // Lê como texto primeiro e só então tenta interpretar como JSON: se a
      // resposta vier em outro formato (ex: uma página HTML, caso algo no
      // caminho — proxy, sessão, cookie — acabe devolvendo um redirect que o
      // fetch segue silenciosamente), evita que JSON.parse quebre com uma
      // mensagem técnica ilegível. Mostra sempre uma mensagem compreensível.
      const corpoTexto = await response.text()
      let corpo: { id?: string; error?: string } | null = null
      try {
        corpo = corpoTexto ? JSON.parse(corpoTexto) : null
      } catch {
        corpo = null
      }

      if (!response.ok) {
        throw new Error(
          corpo?.error ?? `Não foi possível processar a nota fiscal (erro ${response.status}).`
        )
      }

      if (!corpo?.id) {
        throw new Error('Resposta inesperada do servidor ao processar a nota fiscal.')
      }

      router.push(`/despesas/revisar/${corpo.id}`)
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Erro ao enviar a despesa.')
      setStatus('idle')
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#080810] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <span className="text-xl font-semibold">
          Flux<span className="text-[#6333ff]">.</span>
        </span>
        {/* "Ver histórico" foi removido: já coberto pelo item "Histórico" do menu inferior */}
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm text-white/60 transition-colors hover:text-white"
        >
          Sair
        </button>
      </header>

      <div className="px-5 pt-4">
        <CabecalhoCliente nome={clienteNome} />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        {/* Input com capture: força a abertura direta da câmera */}
        <input
          ref={inputCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Input sem capture: abre o seletor normal de arquivos/galeria do
            aparelho, permitindo escolher uma imagem já salva (ex: uma NF
            recebida por WhatsApp/e-mail) */}
        <input
          ref={inputGaleriaRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {!previewUrl ? (
          <div className="flex w-full max-w-xs flex-col gap-4">
            <button
              type="button"
              onClick={() => inputCameraRef.current?.click()}
              className="flex flex-col items-center justify-center gap-4 rounded-3xl bg-[#6333ff] px-8 py-14 text-white shadow-xl shadow-[#6333ff]/30 transition-transform active:scale-95"
            >
              <Camera className="h-14 w-14" strokeWidth={1.6} aria-hidden="true" />
              <span className="text-lg font-semibold">Tirar foto</span>
            </button>

            <button
              type="button"
              onClick={() => inputGaleriaRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-[#00c8c8]/40 bg-[#00c8c8]/10 px-8 py-8 text-[#00c8c8] transition-transform active:scale-95"
            >
              <Images className="h-9 w-9" strokeWidth={1.6} aria-hidden="true" />
              <span className="text-base font-semibold">Escolher da galeria</span>
            </button>
          </div>
        ) : (
          <div className="flex w-full max-w-xs flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Pré-visualização da nota fiscal"
              className="w-full rounded-2xl border border-white/10 object-cover"
            />

            {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

            <button
              type="button"
              onClick={handleEnviar}
              disabled={status !== 'idle'}
              className="w-full rounded-xl bg-[#00c8c8] py-4 text-lg font-semibold text-[#080810] transition-opacity disabled:opacity-50"
            >
              {status === 'uploading' && 'Enviando...'}
              {status === 'extracting' && 'Processando...'}
              {status === 'idle' && 'Enviar'}
            </button>

            <button
              type="button"
              onClick={handleEscolherOutra}
              disabled={status !== 'idle'}
              className="text-sm text-white/60 underline-offset-4 hover:underline disabled:opacity-50"
            >
              Escolher outra foto
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
