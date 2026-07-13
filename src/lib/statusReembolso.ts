export const ROTULOS_STATUS_REEMBOLSO: Record<string, { rotulo: string; cor: string }> = {
  aberto: { rotulo: 'Aberto', cor: '#6333ff' },
  enviado: { rotulo: 'Enviado', cor: '#ff9f43' },
  pago: { rotulo: 'Pago', cor: '#00c8c8' },
}

export function obterStatusReembolso(status: string) {
  return ROTULOS_STATUS_REEMBOLSO[status] ?? { rotulo: status, cor: '#a0a0b0' }
}
