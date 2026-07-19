// Tipos de comprovante que a extração (/api/extract) sabe reconhecer. Os
// valores batem EXATAMENTE com o CHECK da coluna expenses.tipo_comprovante —
// qualquer divergência faria o insert da despesa falhar, por isso a lista
// mora aqui e é usada tanto para validar a resposta da IA quanto para
// rotular na tela.
export const TIPOS_COMPROVANTE = ['nota_fiscal', 'comprovante_pix', 'outro'] as const

export type TipoComprovante = (typeof TIPOS_COMPROVANTE)[number]

const ROTULOS_TIPO_COMPROVANTE: Record<
  TipoComprovante,
  { rotulo: string; icone: string; cor: string }
> = {
  nota_fiscal: { rotulo: 'Nota Fiscal', icone: '🧾', cor: '#6333ff' },
  comprovante_pix: { rotulo: 'Comprovante PIX', icone: '💸', cor: '#00c8c8' },
  outro: { rotulo: 'Outro comprovante', icone: '📄', cor: '#a0a0b0' },
}

// Devolve null quando não há tipo definido — despesas cadastradas antes da
// coluna existir, ou um valor inesperado vindo do banco. Nesse caso a tela
// simplesmente não mostra etiqueta nenhuma, em vez de inventar um rótulo.
export function obterTipoComprovante(valor: string | null | undefined) {
  if (!valor) return null
  return ROTULOS_TIPO_COMPROVANTE[valor as TipoComprovante] ?? null
}

// Usado na rota de extração: a IA pode devolver qualquer string, e gravar um
// valor fora da lista quebraria o CHECK da coluna.
export function ehTipoComprovanteValido(valor: unknown): valor is TipoComprovante {
  return typeof valor === 'string' && (TIPOS_COMPROVANTE as readonly string[]).includes(valor)
}
