// Helpers de mês compartilhados entre o histórico e o orçamento.
//
// Convenção do projeto: um "prefixo de mês" é a string "YYYY-MM" (o formato
// que <input type="month"> devolve), e a coluna orcamentos.mes_referencia
// guarda sempre o PRIMEIRO DIA do mês como date ("YYYY-MM-01").
//
// Toda a manipulação aqui é feita em cima de string, nunca com
// `new Date('YYYY-MM-DD')` — essa forma é interpretada como UTC e pode cair
// no mês errado dependendo do fuso do servidor (mesma precaução de
// formatarDataBR em @/lib/formatadores).

export const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// "YYYY-MM" do mês corrente, no fuso local do servidor
export function prefixoMesCorrente() {
  const agora = new Date()
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
}

export function ehPrefixoMesValido(valor: string) {
  if (!/^\d{4}-\d{2}$/.test(valor)) return false
  const mes = Number(valor.slice(5, 7))
  return mes >= 1 && mes <= 12
}

export function rotuloMes(prefixo: string) {
  const [ano, mes] = prefixo.split('-')
  return `${NOMES_MESES[Number(mes) - 1]} ${ano}`
}

// "2026-07" → "2026-07-01" (valor gravado em orcamentos.mes_referencia)
export function paraMesReferencia(prefixo: string) {
  return `${prefixo}-01`
}

// "2026-07-01" → "2026-07"
export function paraPrefixoMes(mesReferencia: string) {
  return mesReferencia.slice(0, 7)
}

// Início exclusivo do intervalo do mês: usado com .lt() para pegar as
// despesas do mês sem depender de saber quantos dias ele tem.
export function primeiroDiaDoMesSeguinte(prefixo: string) {
  const [ano, mes] = prefixo.split('-').map(Number)
  const proximoMes = mes === 12 ? 1 : mes + 1
  const proximoAno = mes === 12 ? ano + 1 : ano
  return `${proximoAno}-${String(proximoMes).padStart(2, '0')}-01`
}

// Desloca um prefixo de mês em N meses (N negativo volta no tempo)
export function deslocarMes(prefixo: string, deslocamento: number) {
  const [ano, mes] = prefixo.split('-').map(Number)
  // -1 para trabalhar com meses 0..11 e deixar a divisão inteira resolver a
  // virada de ano em qualquer direção
  const total = ano * 12 + (mes - 1) + deslocamento
  const novoAno = Math.floor(total / 12)
  const novoMes = total - novoAno * 12 + 1
  return `${novoAno}-${String(novoMes).padStart(2, '0')}`
}
