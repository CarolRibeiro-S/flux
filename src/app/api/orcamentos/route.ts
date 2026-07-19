import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'
import {
  ehPrefixoMesValido,
  paraMesReferencia,
  prefixoMesCorrente,
} from '@/lib/meses'

// GET /api/orcamentos?mes=YYYY-MM
// Lista os orçamentos do cliente ativo para o mês informado (padrão: mês corrente).
export async function GET(request: NextRequest) {
  try {
    let clienteAtivo
    try {
      clienteAtivo = await obterClienteAtivoApi()
    } catch (error) {
      if (error instanceof ClienteAtivoInvalidoError) {
        return NextResponse.json({ error: 'Nenhum cliente ativo selecionado.' }, { status: 400 })
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

    const { searchParams } = new URL(request.url)
    const mesParam = searchParams.get('mes') ?? ''
    const prefixoMes = ehPrefixoMesValido(mesParam) ? mesParam : prefixoMesCorrente()

    // Filtro triplo: user_id + cliente_id + mês, como em toda query do projeto
    const { data: orcamentos, error } = await supabase
      .from('orcamentos')
      .select('id, categoria, valor_limite, mes_referencia')
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .eq('mes_referencia', paraMesReferencia(prefixoMes))
      .order('categoria', { ascending: true })

    if (error) {
      console.error('[/api/orcamentos GET] Erro ao buscar orçamentos:', error)
      return NextResponse.json({ error: 'Não foi possível carregar os orçamentos' }, { status: 500 })
    }

    return NextResponse.json({ orcamentos: orcamentos ?? [] })
  } catch (error) {
    console.error('[/api/orcamentos GET] Erro inesperado', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível carregar os orçamentos' }, { status: 500 })
  }
}

// POST /api/orcamentos: cria um limite mensal para uma categoria.
export async function POST(request: NextRequest) {
  try {
    const { categoria, valor_limite, mes } = (await request.json()) as {
      categoria?: string
      valor_limite?: number
      mes?: string
    }

    const categoriaLimpa = (categoria ?? '').trim()
    if (!categoriaLimpa) {
      return NextResponse.json({ error: 'Informe a categoria' }, { status: 400 })
    }

    // Number.isFinite barra NaN e Infinity, que passariam por um typeof number
    if (typeof valor_limite !== 'number' || !Number.isFinite(valor_limite) || valor_limite <= 0) {
      return NextResponse.json({ error: 'Informe um valor limite maior que zero' }, { status: 400 })
    }

    if (!mes || !ehPrefixoMesValido(mes)) {
      return NextResponse.json({ error: 'Informe um mês válido' }, { status: 400 })
    }

    let clienteAtivo
    try {
      clienteAtivo = await obterClienteAtivoApi()
    } catch (error) {
      if (error instanceof ClienteAtivoInvalidoError) {
        return NextResponse.json({ error: 'Nenhum cliente ativo selecionado.' }, { status: 400 })
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

    const mesReferencia = paraMesReferencia(mes)

    // Um orçamento por categoria por mês: em vez de criar uma segunda linha
    // (que deixaria dois limites concorrentes para a mesma categoria), avisa
    // para editar o existente.
    const { data: existente } = await supabase
      .from('orcamentos')
      .select('id')
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .eq('mes_referencia', mesReferencia)
      .eq('categoria', categoriaLimpa)
      .maybeSingle()

    if (existente) {
      return NextResponse.json(
        { error: `Já existe um orçamento de "${categoriaLimpa}" nesse mês. Edite o valor dele.` },
        { status: 409 }
      )
    }

    const { data: orcamento, error } = await supabase
      .from('orcamentos')
      .insert({
        user_id: user.id,
        cliente_id: clienteAtivo.id,
        categoria: categoriaLimpa,
        valor_limite,
        mes_referencia: mesReferencia,
      })
      .select('id, categoria, valor_limite, mes_referencia')
      .single()

    if (error || !orcamento) {
      console.error('[/api/orcamentos POST] Erro ao criar orçamento:', error)
      return NextResponse.json({ error: 'Não foi possível salvar o orçamento' }, { status: 500 })
    }

    revalidatePath('/orcamento')

    return NextResponse.json({ orcamento })
  } catch (error) {
    console.error('[/api/orcamentos POST] Erro inesperado', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível salvar o orçamento' }, { status: 500 })
  }
}
