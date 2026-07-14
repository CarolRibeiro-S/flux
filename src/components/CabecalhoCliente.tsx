import Link from 'next/link'

// Mostra qual cliente está ativo no topo das telas principais e dá acesso
// direto pra trocar. Fica no cabeçalho (não no menu inferior) porque, dado
// o isolamento estrito por cliente, o usuário precisa ver "de quem são esses
// dados" antes mesmo de olhar pro conteúdo da tela — não é só mais um botão
// de navegação, é o contexto de tudo que aparece abaixo dele.
export function CabecalhoCliente({ nome }: { nome: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wide text-white/40">Cliente</span>
        <span className="text-sm font-semibold text-[#00c8c8]">{nome}</span>
      </div>
      <Link
        href="/selecionar-cliente"
        className="rounded-lg border border-[#6333ff] px-3 py-1.5 text-xs font-semibold text-[#6333ff] transition-colors hover:bg-[#6333ff]/10"
      >
        Trocar cliente
      </Link>
    </div>
  )
}
