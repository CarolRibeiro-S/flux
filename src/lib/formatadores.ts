export function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Evita usar `new Date(string)` com datas YYYY-MM-DD: isso é interpretado como
// UTC e pode exibir o dia errado dependendo do fuso horário do servidor.
export function formatarDataBR(dataISO: string) {
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}
