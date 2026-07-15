'use client'

// Teclado numérico grande, pensado pra ser usado com o polegar — mesmo
// padrão visual de tela de bloqueio (bolinhas indicando dígitos digitados +
// grade de botões grandes), reutilizado nas telas de configurar e verificar PIN.

type Props = {
  valor: string
  onChange: (novoValor: string) => void
  maxLength?: number
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'apagar']

export function TecladoNumerico({ valor, onChange, maxLength = 6 }: Props) {
  function handleTecla(tecla: string) {
    if (tecla === 'apagar') {
      onChange(valor.slice(0, -1))
      return
    }
    if (tecla === '' || valor.length >= maxLength) return
    onChange(valor + tecla)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-3" aria-hidden="true">
        {Array.from({ length: maxLength }).map((_, indice) => (
          <span
            key={indice}
            className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
              indice < valor.length ? 'border-[#6333ff] bg-[#6333ff]' : 'border-white/20 bg-transparent'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {TECLAS.map((tecla, indice) => {
          if (tecla === '') return <div key={`vazio-${indice}`} />

          if (tecla === 'apagar') {
            return (
              <button
                key={tecla}
                type="button"
                onClick={() => handleTecla(tecla)}
                aria-label="Apagar"
                className="flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white/70 transition-colors active:bg-white/10"
              >
                ⌫
              </button>
            )
          }

          return (
            <button
              key={tecla}
              type="button"
              onClick={() => handleTecla(tecla)}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-2xl font-semibold text-white transition-colors active:bg-[#6333ff]/30"
            >
              {tecla}
            </button>
          )
        })}
      </div>
    </div>
  )
}
