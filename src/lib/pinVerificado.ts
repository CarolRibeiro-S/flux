import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export const COOKIE_PIN_VERIFICADO = 'pin_verificado'

// 5 minutos: curto o suficiente pra não deixar a lista de clientes exposta
// por muito tempo se o aparelho for deixado de lado, mas longo o suficiente
// pra cobrir o fluxo real de "ver a lista, trocar de cliente, dar uma
// olhada em /clientes" sem pedir o mesmo PIN de novo a cada passo.
export const DURACAO_PIN_VERIFICADO_SEGUNDOS = 5 * 60

export type StatusPin =
  | { situacao: 'sem_pin_configurado' }
  | { situacao: 'pin_nao_verificado' }
  | { situacao: 'pin_verificado' }

// Verifica, sem nenhum efeito colateral de navegação, se o usuário logado já
// configurou um PIN e, se sim, se o cookie de verificação está presente e
// dentro da validade. Não decide sozinha o que fazer com o resultado —
// cada chamador (página ou rota de API) decide como reagir, mas SEMPRE
// antes de buscar ou responder qualquer nome de cliente.
export async function obterStatusPin(userId: string): Promise<StatusPin> {
  const supabase = await createClient()

  const { data: config } = await supabase
    .from('configuracoes_usuario')
    .select('pin_hash')
    .eq('user_id', userId)
    .single()

  if (!config?.pin_hash) {
    return { situacao: 'sem_pin_configurado' }
  }

  const cookieStore = await cookies()
  const verificado = cookieStore.get(COOKIE_PIN_VERIFICADO)?.value === '1'

  return { situacao: verificado ? 'pin_verificado' : 'pin_nao_verificado' }
}
