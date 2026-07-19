import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'
import { aplicarFiltrosDespesas, lerFiltros } from '@/lib/filtrosDespesas'

type DespesaExportada = {
  expense_date: string | null
  merchant_name: string | null
  cnpj_emitente: string | null
  category: string | null
  amount: number | null
  precisa_reembolso: boolean | null
  observacoes: string | null
}

const CABECALHO = [
  'Data',
  'Estabelecimento',
  'CNPJ',
  'Categoria',
  'Valor',
  'Precisa Reembolso',
  'Observações',
]

// Separador ";" e decimal com vírgula: é o que o Excel em português abre
// corretamente com duplo clique. Com "," o Excel pt-BR joga a linha inteira
// numa única coluna.
const SEPARADOR = ';'

// Escapa um campo para CSV: envolve em aspas e duplica as aspas internas.
// Sempre entre aspas (mesmo quando não seria estritamente necessário) para
// não ter que raciocinar caso a caso sobre ; quebra de linha e acentos.
function escaparCampo(valor: string) {
  return `"${valor.replace(/"/g, '""')}"`
}

function formatarDataCsv(dataISO: string | null) {
  if (!dataISO) return ''
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

// Número no padrão brasileiro, sem símbolo de moeda — assim a célula continua
// sendo um número para o Excel, permitindo somar/ordenar.
function formatarValorCsv(valor: number | null) {
  if (valor == null) return ''
  return valor.toFixed(2).replace('.', ',')
}

// GET /api/despesas/exportar: gera um CSV com as despesas do cliente ativo,
// respeitando os mesmos filtros da tela de histórico (q, de, ate, categoria).
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
    const filtros = lerFiltros({
      q: searchParams.get('q') ?? undefined,
      de: searchParams.get('de') ?? undefined,
      ate: searchParams.get('ate') ?? undefined,
      categoria: searchParams.get('categoria') ?? undefined,
    })

    // Mesmo isolamento da tela: user_id + cliente_id + status, aplicados
    // ANTES dos filtros de tela.
    const consultaBase = supabase
      .from('expenses')
      .select(
        'expense_date, merchant_name, cnpj_emitente, category, amount, precisa_reembolso, observacoes'
      )
      .eq('user_id', user.id)
      .eq('cliente_id', clienteAtivo.id)
      .eq('status', 'confirmado')

    const { data: despesas, error: erroBusca } = await aplicarFiltrosDespesas(
      consultaBase,
      filtros
    ).order('expense_date', { ascending: false })

    if (erroBusca) {
      console.error('[/api/despesas/exportar GET] Erro ao buscar despesas:', erroBusca)
      return NextResponse.json({ error: 'Não foi possível gerar o CSV' }, { status: 500 })
    }

    const lista = (despesas ?? []) as DespesaExportada[]

    const linhas = lista.map((despesa) =>
      [
        formatarDataCsv(despesa.expense_date),
        despesa.merchant_name ?? '',
        despesa.cnpj_emitente ?? '',
        despesa.category ?? '',
        formatarValorCsv(despesa.amount),
        despesa.precisa_reembolso ? 'Sim' : 'Não',
        despesa.observacoes ?? '',
      ]
        .map(escaparCampo)
        .join(SEPARADOR)
    )

    const corpo = [CABECALHO.map(escaparCampo).join(SEPARADOR), ...linhas].join('\r\n')

    // BOM UTF-8: sem ele o Excel no Windows abre os acentos corrompidos
    // ("Observações" vira "ObservaÃ§Ãµes").
    const csv = `﻿${corpo}`

    // Nome do arquivo com o cliente e a data, para não sobrescrever
    // exportações anteriores na pasta de downloads. Caracteres problemáticos
    // no nome do cliente viram "-".
    const nomeCliente = clienteAtivo.nome.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
    const hoje = new Date().toISOString().slice(0, 10)
    const nomeArquivo = `despesas-${nomeCliente || 'cliente'}-${hoje}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        // Exportação sempre reflete o estado atual do banco
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[/api/despesas/exportar GET] Erro inesperado', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível gerar o CSV' }, { status: 500 })
  }
}
