export const CATEGORIAS = [
  { valor: 'alimentacao', rotulo: 'Alimentação', cor: '#00c8c8', icone: '🍽️' },
  { valor: 'transporte', rotulo: 'Transporte', cor: '#6333ff', icone: '🚗' },
  { valor: 'hospedagem', rotulo: 'Hospedagem', cor: '#ff9f43', icone: '🏨' },
  { valor: 'material', rotulo: 'Material', cor: '#54a0ff', icone: '📦' },
  { valor: 'outros', rotulo: 'Outros', cor: '#a0a0b0', icone: '📋' },
] as const

export function obterCategoria(valor: string | null) {
  return CATEGORIAS.find((categoria) => categoria.valor === valor) ?? CATEGORIAS[CATEGORIAS.length - 1]
}
