import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { inferirMimeType } from '@/lib/imagemMime'
import { obterClienteAtivo } from '@/lib/clienteAtivo'

const anthropic = new Anthropic()

// Remove blocos de markdown (```json ... ```) caso o Claude ignore a instrução de responder só com JSON
function limparRespostaJson(texto: string) {
  return texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
}

type DadosExtraidos = {
  merchant_name: string | null
  cnpj_emitente: string | null
  amount: number | null
  expense_date: string | null
  category: string | null
}

function validarDadosExtraidos(json: unknown): DadosExtraidos {
  const dados = json as Record<string, unknown>

  const amount = typeof dados.amount === 'number' ? dados.amount : null
  // Categoria é texto livre sugerido pela IA (sem lista fixa) — qualquer string não vazia é aceita
  const category =
    typeof dados.category === 'string' && dados.category.trim() ? dados.category.trim() : null

  return {
    merchant_name: typeof dados.merchant_name === 'string' ? dados.merchant_name : null,
    cnpj_emitente: typeof dados.cnpj_emitente === 'string' ? dados.cnpj_emitente : null,
    amount,
    expense_date: typeof dados.expense_date === 'string' ? dados.expense_date : null,
    category,
  }
}

export async function POST(request: NextRequest) {
  // Lê apenas imagePath do corpo da requisição: cliente_id NUNCA é aceito
  // vindo do front-end (evitaria que alguém manipulasse a chamada e gravasse
  // a despesa em outro cliente). Quem determina o cliente é sempre o servidor.
  const { imagePath } = (await request.json()) as { imagePath?: string }

  if (!imagePath) {
    return NextResponse.json({ error: 'imagePath é obrigatório' }, { status: 400 })
  }

  // Resolve o cliente ativo a partir do cookie, validado no banco. Redireciona
  // para /selecionar-cliente (via obterClienteAtivo) se não houver um válido.
  const clienteAtivo = await obterClienteAtivo()

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: imagemBaixada, error: erroDownload } = await supabase.storage
    .from('receipts')
    .download(imagePath)

  if (erroDownload || !imagemBaixada) {
    return NextResponse.json({ error: 'Não foi possível baixar a imagem' }, { status: 404 })
  }

  const imageBase64 = Buffer.from(await imagemBaixada.arrayBuffer()).toString('base64')
  const mediaType = inferirMimeType(imagePath, imagemBaixada.type)

  try {
    const resposta = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Analise esta imagem de nota fiscal ou recibo e extraia os seguintes dados:

- nome do estabelecimento (merchant_name)
- CNPJ do emitente, apenas os números ou no formato original encontrado (cnpj_emitente)
- valor total da despesa, como número decimal, sem símbolo de moeda (amount)
- data da despesa, no formato YYYY-MM-DD (expense_date)
- uma categoria curta e descritiva em português para o tipo de despesa/serviço, com no máximo 2-3 palavras, capturando o tipo real do estabelecimento (ex: "Farmácia", "Estacionamento", "Manutenção veicular", "Papelaria", "Restaurante") — não se prenda a uma lista fixa, identifique livremente (category)

Responda APENAS com um JSON válido, sem nenhum texto adicional, sem markdown e sem crases. Se algum campo não puder ser identificado com confiança, use null para esse campo. Formato exato da resposta:

{"merchant_name": string | null, "cnpj_emitente": string | null, "amount": number | null, "expense_date": string | null, "category": string | null}`,
            },
          ],
        },
      ],
    })

    const blocoTexto = resposta.content.find((bloco) => bloco.type === 'text')
    const textoResposta = blocoTexto && blocoTexto.type === 'text' ? blocoTexto.text : ''

    let dadosExtraidos: DadosExtraidos = {
      merchant_name: null,
      cnpj_emitente: null,
      amount: null,
      expense_date: null,
      category: null,
    }
    let rawOcrText: string | null = null

    try {
      const json = JSON.parse(limparRespostaJson(textoResposta))
      dadosExtraidos = validarDadosExtraidos(json)
    } catch {
      rawOcrText = textoResposta
    }

    const { data: despesaCriada, error: erroInsercao } = await supabase
      .from('expenses')
      .insert({
        user_id: user.id,
        cliente_id: clienteAtivo.id,
        image_path: imagePath,
        status: 'pendente_revisao',
        raw_ocr_text: rawOcrText,
        ...dadosExtraidos,
      })
      .select('id')
      .single()

    if (erroInsercao || !despesaCriada) {
      console.error('[/api/extract] Erro ao inserir despesa no banco:', erroInsercao)
      return NextResponse.json({ error: 'Não foi possível salvar a despesa' }, { status: 500 })
    }

    return NextResponse.json({ id: despesaCriada.id })
  } catch (error) {
    const erroAnthropic = error instanceof Anthropic.APIError ? error : null

    console.error('[/api/extract] Falha ao chamar a API da Anthropic', {
      imagePath,
      mediaType,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      status: erroAnthropic?.status,
      tipo: erroAnthropic?.type,
      requestId: erroAnthropic?.requestID,
      corpoResposta: erroAnthropic?.error,
    })

    return NextResponse.json(
      { error: 'Não foi possível processar a nota fiscal' },
      { status: 500 }
    )
  }
}
