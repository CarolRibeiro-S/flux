import { obterClienteAtivo } from '@/lib/clienteAtivo'
import { CapturaDespesa } from './CapturaDespesa'

export default async function Home() {
  // Garante que exista um cliente ativo válido antes de mostrar a tela de
  // captura; redireciona para /selecionar-cliente caso contrário.
  const clienteAtivo = await obterClienteAtivo()

  return <CapturaDespesa clienteNome={clienteAtivo.nome} />
}
