'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { uploadReceiptImage } from '@/lib/supabase/upload'

type Status = 'idle' | 'uploading' | 'extracting'

export default function Home() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleEnviar() {
    if (!file || !userId) return

    setErrorMsg(null)

    try {
      setStatus('uploading')
      const imagePath = await uploadReceiptImage(file, userId)

      setStatus('extracting')
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath }),
      })

      if (!response.ok) {
        throw new Error('Não foi possível processar a nota fiscal.')
      }

      const { id } = await response.json()
      router.push(`/despesas/revisar/${id}`)
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

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {!previewUrl ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full max-w-xs flex-col items-center justify-center gap-4 rounded-3xl bg-[#6333ff] px-8 py-14 text-white shadow-xl shadow-[#6333ff]/30 transition-transform active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-14 w-14"
              aria-hidden="true"
            >
              <path
                d="M4 8a2 2 0 0 1 2-2h1.5l.9-1.5A1.5 1.5 0 0 1 9.7 3.7h4.6a1.5 1.5 0 0 1 1.3.8L16.5 6H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <span className="text-lg font-semibold">Adicionar despesa</span>
          </button>
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
