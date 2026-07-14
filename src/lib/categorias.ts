// Categoria agora é texto livre (sugerido pela IA ou digitado pelo usuário), sem lista
// fixa. Aqui mapeamos palavras-chave comuns para um ícone/cor consistentes; qualquer
// categoria que não bata com nenhuma palavra-chave cai no visual genérico/neutro.
const REGRAS_CATEGORIA: { palavras: string[]; cor: string; icone: string }[] = [
  {
    palavras: ['aliment', 'restaurant', 'lanch', 'comida', 'padaria', 'café', 'cafe', 'bar'],
    cor: '#00c8c8',
    icone: '🍽️',
  },
  {
    palavras: ['transport', 'combust', 'uber', 'taxi', 'táxi', 'gasolina', 'estacionamento', 'pedagio', 'pedágio'],
    cor: '#6333ff',
    icone: '🚗',
  },
  {
    palavras: ['hospedagem', 'hotel', 'pousada', 'airbnb'],
    cor: '#ff9f43',
    icone: '🏨',
  },
  {
    palavras: ['material', 'papelaria', 'escritorio', 'escritório'],
    cor: '#54a0ff',
    icone: '📦',
  },
  {
    palavras: ['farmac', 'farmác', 'saude', 'saúde', 'medic', 'médic'],
    cor: '#ff6b81',
    icone: '💊',
  },
]

// Visual padrão para categorias que não batem com nenhuma palavra-chave conhecida
const CATEGORIA_PADRAO = { cor: '#a0a0b0', icone: '📋' }

export function obterCategoria(valor: string | null) {
  const rotulo = valor?.trim() || 'Outros'
  const normalizado = rotulo.toLowerCase()
  const regra = REGRAS_CATEGORIA.find((r) => r.palavras.some((palavra) => normalizado.includes(palavra)))

  return {
    valor: rotulo,
    rotulo,
    cor: regra?.cor ?? CATEGORIA_PADRAO.cor,
    icone: regra?.icone ?? CATEGORIA_PADRAO.icone,
  }
}
