import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'

type CorpoManual = {
  merchant_name?: string
  cnpj_emitente?: string | null
  amount?: number
  expense_date?: string
  category?: string | null
  precisa_reembolso?: boolean
  observacoes?: string | null
}

// Aceita "YYYY-MM-DD" (o que o <input type="date"> devolve). Confere também se
// é uma data de calendário real — new Date normalizaria "2026-02-31" para
// março, então comparamos as partes de volta para rejeitar isso.
function ehDataValida(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [ano, mes, dia] = valor.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  )
}

// POST /api/despesas/manual: cria uma despesa digitada à mão, sem foto nem
// extração por IA. Mesmo padrão de isolamento de /api/extract — o cliente
// ativo vem sempre do cookie no servidor, nunca do corpo da requisição.
export async function POST(request: NextRequest) {
  try {
    const corpo = (await request.json()) as CorpoManual

    // ---- Validação dos campos obrigatórios ----
    const merchantName = (corpo.merchant_name ?? '').trim()
    if (!merchantName) {
      return NextResponse.json({ error: 'Informe o estabelecimento' }, { status: 400 })
    }

    // Number.isFinite barra NaN e Infinity, que passariam por um typeof number
    if (typeof corpo.amount !== 'number' || !Number.isFinite(corpo.amount) || corpo.amount <= 0) {
      return NextResponse.json({ error: 'Informe um valor maior que zero' }, { status: 400 })
    }

    if (!corpo.expense_date || !ehDataValida(corpo.expense_date)) {
      return NextResponse.json({ error: 'Informe uma data válida' }, { status: 400 })
    }

    // Campos opcionais: string vazia vira null para não poluir a base com ''
    const cnpj = (corpo.cnpj_emitente ?? '').trim() || null
    const category = (corpo.category ?? '').trim() || null
    const observacoes = (corpo.observacoes ?? '').trim() || null
    // Padrão true ("Sim, eu paguei"), igual ao formulário de revisão
    const precisaReembolso =
      typeof corpo.precisa_reembolso === 'boolean' ? corpo.precisa_reembolso : true

    // ---- Isolamento por cliente (mesmo padrão de /api/extract) ----
    let clienteAtivo
    try {
      clienteAtivo = await obterClienteAtivoApi()
    } catch (error) {
      if (error instanceof ClienteAtivoInvalidoError) {
        return NextResponse.json(
          { error: 'Nenhum cliente ativo selecionado. Selecione um cliente e tente novamente.' },
          { status: 400 }
        )
      }
      throw error
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: despesaCriada, error: erroInsercao } = await supabase
      .from('expenses')
      .insert({
        user_id: user.id,
        cliente_id: clienteAtivo.id,
        merchant_name: merchantName,
        cnpj_emitente: cnpj,
        amount: corpo.amount,
        expense_date: corpo.expense_date,
        category,
        observacoes,
        precisa_reembolso: precisaReembolso,
        // Nasce confirmada: os dados foram digitados direto, não há etapa de
        // revisão de extração a fazer.
        status: 'confirmado',
        // Sem foto. A coluna é NOT NULL, então usamos string vazia — todas as
        // telas tratam image_path vazio como "sem comprovante" (ver
        // despesas/[id]/page.tsx e a geração de PDF).
        image_path: '',
        // Não é nota fiscal nem comprovante PIX: entrada manual é "outro".
        tipo_comprovante: 'outro',
      })
      .select('id')
      .single()

    if (erroInsercao || !despesaCriada) {
      console.error('[/api/despesas/manual] Erro ao inserir despesa manual:', erroInsercao)
      return NextResponse.json({ error: 'Não foi possível salvar a despesa' }, { status: 500 })
    }

    // A nova despesa já entra confirmada no histórico
    revalidatePath('/despesas')

    return NextResponse.json({ id: despesaCriada.id })
  } catch (error) {
    console.error('[/api/despesas/manual] Erro inesperado', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível salvar a despesa' }, { status: 500 })
  }
}
