import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda } from '@/lib/formatadores'

export type TotalCategoria = {
  categoria: string
  total: number
}

type Props = {
  totais: TotalCategoria[]
  // Descreve de que período são os números (ex: "julho de 2026" ou "período filtrado"),
  // pra nunca ficar ambíguo se o resumo respeita ou não o filtro aplicado
  rotuloPeriodo: string
}

// Lista simples ordenada do maior gasto para o menor. A barra é proporcional
// ao maior valor do conjunto (não a um orçamento) — serve só para comparar as
// categorias entre si de relance.
export function ResumoCategoria({ totais, rotuloPeriodo }: Props) {
  if (totais.length === 0) return null

  const maiorTotal = totais[0]?.total ?? 0
  const totalGeral = totais.reduce((soma, item) => soma + item.total, 0)

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Por categoria
        </h2>
        <span className="text-xs text-white/40">{rotuloPeriodo}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {totais.map(({ categoria, total }) => {
          const visual = obterCategoria(categoria)
          // Evita divisão por zero quando todas as despesas somam 0
          const proporcao = maiorTotal > 0 ? (total / maiorTotal) * 100 : 0

          return (
            <div key={categoria} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span aria-hidden="true">{visual.icone}</span>
                  <span className="truncate text-white/90">{visual.rotulo}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold">{formatarMoeda(total)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${proporcao}%`, backgroundColor: visual.cor }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-sm">
        <span className="text-white/60">Total</span>
        <span className="font-semibold text-[#00c8c8]">{formatarMoeda(totalGeral)}</span>
      </div>
    </section>
  )
}
