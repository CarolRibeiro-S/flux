import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { inferirMimeType } from '@/lib/imagemMime'
import { obterClienteAtivoApi, ClienteAtivoInvalidoError } from '@/lib/clienteAtivo'
import { ehTipoComprovanteValido, type TipoComprovante } from '@/lib/tiposComprovante'

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
  tipo_comprovante: TipoComprovante
}

function validarDadosExtraidos(json: unknown): DadosExtraidos {
  const dados = json as Record<string, unknown>

  const amount = typeof dados.amount === 'number' ? dados.amount : null
  // Categoria é texto livre sugerido pela IA (sem lista fixa) — qualquer string não vazia é aceita
  const category =
    typeof dados.category === 'string' && dados.category.trim() ? dados.category.trim() : null

  // Diferente dos demais campos, tipo_comprovante NÃO pode cair para null nem
  // aceitar texto livre: a coluna tem CHECK com os três valores possíveis, e
  // qualquer outra coisa faria o insert da despesa inteira falhar. Se a IA
  // devolver algo fora da lista, classifica como "outro".
  const tipo_comprovante = ehTipoComprovanteValido(dados.tipo_comprovante)
    ? dados.tipo_comprovante
    : 'outro'

  return {
    merchant_name: typeof dados.merchant_name === 'string' ? dados.merchant_name : null,
    cnpj_emitente: typeof dados.cnpj_emitente === 'string' ? dados.cnpj_emitente : null,
    amount,
    expense_date: typeof dados.expense_date === 'string' ? dados.expense_date : null,
    category,
    tipo_comprovante,
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

  // Resolve o cliente ativo a partir do cookie, validado no banco. Diferente
  // de obterClienteAtivo() (usado em páginas), esta variante NUNCA
  // redireciona — responde com JSON de erro, que é o que o front-end
  // consegue interpretar de uma chamada fetch().
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
              text: `Analise esta imagem de comprovante de despesa e extraia os dados abaixo.

A imagem pode ser de DOIS tipos diferentes. Primeiro identifique qual é:

TIPO 1 — NOTA FISCAL / CUPOM FISCAL: documento fiscal, normalmente uma foto de papel impresso. Sinais: as expressões "NOTA FISCAL", "CUPOM FISCAL", "DANFE", "NFC-e", "NF-e", "SAT" ou "CF-e"; CNPJ e Inscrição Estadual do emitente; lista de itens com quantidade e valor unitário; linhas de tributos (ex: "Lei 12.741"); "chave de acesso" com 44 dígitos.

TIPO 2 — COMPROVANTE DE TRANSFERÊNCIA PIX: print de tela de aplicativo de banco. Sinais: "Comprovante", "Pix", "Transferência realizada", "Pix enviado", "Você transferiu"; dois blocos identificando as partes, rotulados como "Para"/"Destino"/"Favorecido"/"Quem recebeu" e "De"/"Origem"/"Pagador"/"Quem pagou"; "Chave Pix"; "Instituição" ou "Banco"; "ID da transação", "Código de autenticação" ou "E2E"; data acompanhada de horário. NÃO tem lista de itens nem tributos.

Extraia SEMPRE os mesmos campos, seja qual for o tipo:

- tipo_comprovante: "nota_fiscal" para o TIPO 1, "comprovante_pix" para o TIPO 2, ou "outro" se for outro tipo de recibo/documento que não se encaixe em nenhum dos dois.

- merchant_name:
  - Nota fiscal: nome do estabelecimento emitente.
  - Comprovante PIX: nome de QUEM RECEBEU o dinheiro (favorecido/destinatário). ATENÇÃO: o comprovante mostra duas partes — quem pagou e quem recebeu. Extraia sempre QUEM RECEBEU, nunca quem pagou.

- cnpj_emitente:
  - Nota fiscal: CNPJ do emitente, apenas números ou no formato original encontrado.
  - Comprovante PIX: CPF ou CNPJ de QUEM RECEBEU, se aparecer. Costuma vir mascarado (ex: "***.456.789-**") — nesse caso copie exatamente como está na imagem. Se o comprovante não mostrar documento do recebedor, use null.
  - Nunca use o CPF/CNPJ de quem pagou.

- amount: valor total como número decimal, sem símbolo de moeda e sem separador de milhar ("R$ 1.234,56" vira 1234.56).
  - Nota fiscal: o valor TOTAL da nota, não o de um item isolado.
  - Comprovante PIX: o valor transferido.

- expense_date: data da transação no formato YYYY-MM-DD. Se houver data e hora juntas (ex: "05/03/2026 às 14:32"), use apenas a data.

- category: categoria curta e descritiva em português, com no máximo 2-3 palavras, capturando o tipo real da despesa (ex: "Farmácia", "Estacionamento", "Manutenção veicular", "Papelaria", "Restaurante"). Não se prenda a uma lista fixa, identifique livremente.
  - Comprovante PIX: deduza pelo nome de quem recebeu (ex: "Auto Posto Silva" sugere "Combustível"). Se for pessoa física e não houver nenhum indício da natureza da despesa, use "Transferência".

Responda APENAS com um JSON válido, sem nenhum texto adicional, sem markdown e sem crases. Se algum campo não puder ser identificado com confiança, use null para esse campo — exceto tipo_comprovante, que deve sempre receber um dos três valores. Formato exato da resposta:

{"merchant_name": string | null, "cnpj_emitente": string | null, "amount": number | null, "expense_date": string | null, "category": string | null, "tipo_comprovante": "nota_fiscal" | "comprovante_pix" | "outro"}`,
            },
          ],
        },
      ],
    })

    const blocoTexto = resposta.content.find((bloco) => bloco.type === 'text')
    const textoResposta = blocoTexto && blocoTexto.type === 'text' ? blocoTexto.text : ''

    // Se a resposta não vier em JSON, a despesa é criada em branco (com o texto
    // cru em raw_ocr_text) para a usuária preencher na revisão — sem tipo
    // identificado, o comprovante entra como "outro".
    let dadosExtraidos: DadosExtraidos = {
      merchant_name: null,
      cnpj_emitente: null,
      amount: null,
      expense_date: null,
      category: null,
      tipo_comprovante: 'outro',
    }
    let rawOcrText: string | null = null

    try {
      const json = JSON.parse(limparRespostaJson(textoResposta))
      dadosExtraidos = validarDadosExtraidos(json)
    } catch {
      rawOcrText = textoResposta
    }

    // Detecção de possível comprovante duplicado: mesmo cliente, mesmo
    // CNPJ/CPF, mesmo valor e mesma data batendo exatamente. Só verifica
    // quando os três campos foram extraídos com confiança (nenhum null) —
    // comparar nulls contra nulls daria falso positivo entre despesas
    // totalmente diferentes. Na prática isso cobre nota fiscal sempre, e
    // comprovante PIX apenas quando o documento do recebedor aparece no
    // print (muitos bancos omitem). Não bloqueia a criação: só sinaliza na
    // resposta pro front-end avisar.
    let duplicataId: string | null = null
    if (
      dadosExtraidos.cnpj_emitente &&
      dadosExtraidos.amount != null &&
      dadosExtraidos.expense_date
    ) {
      const { data: duplicataExistente } = await supabase
        .from('expenses')
        .select('id')
        .eq('cliente_id', clienteAtivo.id)
        .eq('cnpj_emitente', dadosExtraidos.cnpj_emitente)
        .eq('amount', dadosExtraidos.amount)
        .eq('expense_date', dadosExtraidos.expense_date)
        .limit(1)
        .maybeSingle()

      duplicataId = duplicataExistente?.id ?? null
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

    return NextResponse.json({
      id: despesaCriada.id,
      possivel_duplicata: Boolean(duplicataId),
      duplicata_id: duplicataId,
    })
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
