import { NextResponse, type NextRequest } from 'next/server'
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'
import { inferirMimeType } from '@/lib/imagemMime'

// Tamanho A4 em pontos
const LARGURA_PAGINA = 595.28
const ALTURA_PAGINA = 841.89

// Margem interna única usada por todo o conteúdo (título, linhas, tabela,
// cartões). Todo alinhamento à direita deve partir de MARGEM_DIREITA, nunca
// de um valor calculado à parte, pra nunca estourar a borda da página.
const MARGEM = 44
const MARGEM_DIREITA = LARGURA_PAGINA - MARGEM
const LARGURA_CONTEUDO = MARGEM_DIREITA - MARGEM

// Pequeno respiro entre o texto alinhado à direita (números, principalmente)
// e a margem direita real, pra nunca ficar com o texto encostado na borda
const RESPIRO_TEXTO_DIREITA = 4

// Borda decorativa da página, um pouco para dentro da margem de conteúdo
const BORDA_INSET = 18

// Paleta discreta: cinza-escuro para texto, roxo da marca só em pontos de destaque
const COR_TEXTO = rgb(0.13, 0.13, 0.17)
const COR_TEXTO_SECUNDARIO = rgb(0.45, 0.45, 0.52)
const COR_BORDA = rgb(0.82, 0.82, 0.86)
const COR_BORDA_FORTE = rgb(0.62, 0.62, 0.68)
const COR_FUNDO_SUTIL = rgb(0.96, 0.96, 0.97)
const COR_DESTAQUE = rgb(0x63 / 255, 0x33 / 255, 0xff / 255)
const COR_ALERTA = rgb(0.62, 0.24, 0.24)

// Trunca o texto com "…" se ele não couber na largura disponível da coluna
function truncarTexto(texto: string, larguraMaxima: number, fonte: PDFFont, tamanho: number) {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= larguraMaxima) return texto

  let truncado = texto
  while (truncado.length > 1 && fonte.widthOfTextAtSize(`${truncado}…`, tamanho) > larguraMaxima) {
    truncado = truncado.slice(0, -1)
  }
  return `${truncado}…`
}

function desenharBordaPagina(page: PDFPage) {
  page.drawRectangle({
    x: BORDA_INSET,
    y: BORDA_INSET,
    width: LARGURA_PAGINA - BORDA_INSET * 2,
    height: ALTURA_PAGINA - BORDA_INSET * 2,
    borderColor: COR_BORDA,
    borderWidth: 0.75,
  })
}

// Desenha um texto alinhado à direita dentro de uma coluna, devolvendo o x inicial usado
function desenharTextoAlinhado(
  page: PDFPage,
  texto: string,
  opts: { xFinal: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> }
) {
  const largura = opts.font.widthOfTextAtSize(texto, opts.size)
  page.drawText(texto, { x: opts.xFinal - largura, y: opts.y, size: opts.size, font: opts.font, color: opts.color })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    // Filtra também por user_id como reforço de segurança além do RLS
    const { data: lote, error: erroLote } = await supabase
      .from('reimbursement_batches')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (erroLote || !lote) {
      return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 })
    }

    const { data: despesas } = await supabase
      .from('expenses')
      .select('*')
      .eq('batch_id', lote.id)
      .order('expense_date', { ascending: true })

    const listaDespesas = despesas ?? []

    const pdfDoc = await PDFDocument.create()
    const fonteNormal = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fonteNegrito = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // ---------- Capa: título, período, total e tabela resumo ----------
    let pagina: PDFPage = pdfDoc.addPage([LARGURA_PAGINA, ALTURA_PAGINA])
    desenharBordaPagina(pagina)
    let y = ALTURA_PAGINA - MARGEM

    // Selo "FLUX" discreto no canto superior direito
    const marcaTexto = 'FLUX'
    const marcaLargura = fonteNegrito.widthOfTextAtSize(marcaTexto, 11)
    pagina.drawText(marcaTexto, {
      x: MARGEM_DIREITA - marcaLargura,
      y: y - 4,
      size: 11,
      font: fonteNegrito,
      color: COR_DESTAQUE,
    })

    pagina.drawText('Relatório de Reembolso', {
      x: MARGEM,
      y,
      size: 26,
      font: fonteNegrito,
      color: COR_TEXTO,
    })
    y -= 16
    // Barrinha de destaque sob o título
    pagina.drawRectangle({ x: MARGEM, y, width: 48, height: 3, color: COR_DESTAQUE })
    y -= 30

    const periodoTexto = `Período: ${
      lote.period_start ? formatarDataBR(lote.period_start) : '—'
    } a ${lote.period_end ? formatarDataBR(lote.period_end) : '—'}`
    pagina.drawText(periodoTexto, {
      x: MARGEM,
      y,
      size: 12,
      font: fonteNormal,
      color: COR_TEXTO_SECUNDARIO,
    })
    y -= 34

    // "Chip" de destaque com o valor total. A altura e o encaixe vertical do
    // texto usam as métricas reais da fonte (heightAtSize), não um palpite
    // fixo — senão o topo dos números/letras maiúsculas vaza pra fora da caixa.
    const totalTexto = `Total: ${formatarMoeda(lote.total_amount ?? 0)}`
    const totalTamanho = 16
    const totalLargura = fonteNegrito.widthOfTextAtSize(totalTexto, totalTamanho)
    const alturaTextoTotal = fonteNegrito.heightAtSize(totalTamanho)
    const alturaAscendenteTotal = fonteNegrito.heightAtSize(totalTamanho, { descender: false })
    const alturaDescendenteTotal = alturaTextoTotal - alturaAscendenteTotal
    const chipPaddingX = 16
    const chipPaddingY = 10
    const chipAltura = alturaTextoTotal + chipPaddingY * 2
    const chipBaseY = y - alturaDescendenteTotal - chipPaddingY
    pagina.drawRectangle({
      x: MARGEM,
      y: chipBaseY,
      width: totalLargura + chipPaddingX * 2,
      height: chipAltura,
      color: COR_DESTAQUE,
      opacity: 0.1,
      borderColor: COR_DESTAQUE,
      borderWidth: 0.75,
      borderOpacity: 0.4,
    })
    pagina.drawText(totalTexto, {
      x: MARGEM + chipPaddingX,
      y,
      size: totalTamanho,
      font: fonteNegrito,
      color: COR_DESTAQUE,
    })
    y = chipBaseY - 22

    // Linha separando o cabeçalho do conteúdo
    pagina.drawLine({
      start: { x: MARGEM, y },
      end: { x: MARGEM_DIREITA, y },
      thickness: 1,
      color: COR_BORDA_FORTE,
    })
    y -= 28

    pagina.drawText('DESPESAS INCLUÍDAS', {
      x: MARGEM,
      y,
      size: 10,
      font: fonteNegrito,
      color: COR_TEXTO_SECUNDARIO,
    })
    y -= 20

    const larguraEstabelecimento = 190
    const larguraCategoria = 95
    const larguraData = 70
    const larguraValor = LARGURA_CONTEUDO - larguraEstabelecimento - larguraCategoria - larguraData

    // Colunas com alinhamento à direita guardam xFinal já com o respiro
    // descontado da margem direita real — o texto nunca chega a encostar nela.
    const colunas = [
      { titulo: 'Estabelecimento', x: MARGEM, largura: larguraEstabelecimento, direita: false, xFinal: 0 },
      {
        titulo: 'Categoria',
        x: MARGEM + larguraEstabelecimento,
        largura: larguraCategoria,
        direita: false,
        xFinal: 0,
      },
      {
        titulo: 'Data',
        x: MARGEM + larguraEstabelecimento + larguraCategoria,
        largura: larguraData,
        direita: false,
        xFinal: 0,
      },
      {
        titulo: 'Valor',
        x: MARGEM + larguraEstabelecimento + larguraCategoria + larguraData,
        largura: larguraValor,
        direita: true,
        xFinal: MARGEM_DIREITA - RESPIRO_TEXTO_DIREITA,
      },
    ]

    function desenharCabecalhoTabela() {
      pagina.drawRectangle({
        x: MARGEM,
        y: y - 4,
        width: LARGURA_CONTEUDO,
        height: 18,
        color: COR_FUNDO_SUTIL,
      })
      for (const coluna of colunas) {
        if (coluna.direita) {
          desenharTextoAlinhado(pagina, coluna.titulo, {
            xFinal: coluna.xFinal,
            y,
            size: 9.5,
            font: fonteNegrito,
            color: COR_TEXTO,
          })
        } else {
          pagina.drawText(coluna.titulo, { x: coluna.x, y, size: 9.5, font: fonteNegrito, color: COR_TEXTO })
        }
      }
      y -= 20
      pagina.drawLine({
        start: { x: MARGEM, y: y + 6 },
        end: { x: MARGEM_DIREITA, y: y + 6 },
        thickness: 1,
        color: COR_BORDA_FORTE,
      })
    }

    desenharCabecalhoTabela()

    for (const despesa of listaDespesas) {
      // Quebra pra nova página antes de desenhar, repetindo borda e cabeçalho
      if (y - 20 < MARGEM) {
        pagina = pdfDoc.addPage([LARGURA_PAGINA, ALTURA_PAGINA])
        desenharBordaPagina(pagina)
        y = ALTURA_PAGINA - MARGEM
        desenharCabecalhoTabela()
      }

      const categoria = obterCategoria(despesa.category)
      const valores = [
        despesa.merchant_name ?? 'Sem nome',
        categoria.rotulo,
        despesa.expense_date ? formatarDataBR(despesa.expense_date) : '—',
        formatarMoeda(despesa.amount ?? 0),
      ]

      valores.forEach((texto, indice) => {
        const coluna = colunas[indice]
        const larguraDisponivel = coluna.direita ? coluna.largura - RESPIRO_TEXTO_DIREITA : coluna.largura
        const truncado = truncarTexto(texto, larguraDisponivel, fonteNormal, 10)
        if (coluna.direita) {
          desenharTextoAlinhado(pagina, truncado, {
            xFinal: coluna.xFinal,
            y,
            size: 10,
            font: fonteNormal,
            color: COR_TEXTO,
          })
        } else {
          pagina.drawText(truncado, { x: coluna.x, y, size: 10, font: fonteNormal, color: COR_TEXTO })
        }
      })
      y -= 8
      pagina.drawLine({
        start: { x: MARGEM, y: y + 2 },
        end: { x: MARGEM_DIREITA, y: y + 2 },
        thickness: 0.5,
        color: COR_BORDA,
      })
      y -= 12
    }

    // ---------- Uma página por despesa, com dados e foto ----------
    for (const despesa of listaDespesas) {
      const paginaDespesa = pdfDoc.addPage([LARGURA_PAGINA, ALTURA_PAGINA])
      desenharBordaPagina(paginaDespesa)
      let yDetalhe = ALTURA_PAGINA - MARGEM

      paginaDespesa.drawText('DESPESA', {
        x: MARGEM,
        y: yDetalhe,
        size: 9,
        font: fonteNegrito,
        color: COR_DESTAQUE,
      })
      yDetalhe -= 22

      const tituloDespesa = truncarTexto(despesa.merchant_name ?? 'Sem nome', LARGURA_CONTEUDO, fonteNegrito, 19)
      paginaDespesa.drawText(tituloDespesa, {
        x: MARGEM,
        y: yDetalhe,
        size: 19,
        font: fonteNegrito,
        color: COR_TEXTO,
      })
      yDetalhe -= 12
      paginaDespesa.drawRectangle({ x: MARGEM, y: yDetalhe, width: 40, height: 3, color: COR_DESTAQUE })
      yDetalhe -= 30

      // ---------- Cartão com os dados da despesa ----------
      const categoria = obterCategoria(despesa.category)
      const campos: [string, string][] = [
        ['Estabelecimento', despesa.merchant_name ?? '—'],
        ['CNPJ', despesa.cnpj_emitente ?? '—'],
        ['Categoria', categoria.rotulo],
        ['Valor', formatarMoeda(despesa.amount ?? 0)],
        ['Data', despesa.expense_date ? formatarDataBR(despesa.expense_date) : '—'],
      ]

      const cardPaddingX = 16
      const cardPaddingY = 14
      const alturaLinha = 24
      const alturaCard = cardPaddingY * 2 + alturaLinha * campos.length
      const cardTopoY = yDetalhe
      const cardBaseY = cardTopoY - alturaCard
      // xFinal do valor já parte da margem direita real da página, com o
      // mesmo respiro usado na tabela — nunca encosta na borda do cartão
      const cardXFinalValor = MARGEM_DIREITA - cardPaddingX - RESPIRO_TEXTO_DIREITA

      paginaDespesa.drawRectangle({
        x: MARGEM,
        y: cardBaseY,
        width: LARGURA_CONTEUDO,
        height: alturaCard,
        borderColor: COR_BORDA,
        borderWidth: 0.75,
      })

      // Reserva espaço suficiente pro rótulo mais largo pra que o valor
      // (à direita) nunca colida com ele, mesmo com nomes de estabelecimento longos
      const larguraMaxRotulo = Math.max(
        ...campos.map(([rotulo]) => fonteNormal.widthOfTextAtSize(rotulo, 9.5))
      )
      const larguraMaximaValor =
        cardXFinalValor - (MARGEM + cardPaddingX) - larguraMaxRotulo - 16

      campos.forEach(([rotulo, valor], indice) => {
        const linhaTopoY = cardTopoY - cardPaddingY - alturaLinha * indice
        const textoY = linhaTopoY - alturaLinha / 2 - 3
        const valorTruncado = truncarTexto(valor, larguraMaximaValor, fonteNegrito, 11)

        paginaDespesa.drawText(rotulo, {
          x: MARGEM + cardPaddingX,
          y: textoY,
          size: 9.5,
          font: fonteNormal,
          color: COR_TEXTO_SECUNDARIO,
        })

        desenharTextoAlinhado(paginaDespesa, valorTruncado, {
          xFinal: cardXFinalValor,
          y: textoY,
          size: 11,
          font: fonteNegrito,
          color: COR_TEXTO,
        })

        if (indice < campos.length - 1) {
          const linhaBaseY = linhaTopoY - alturaLinha
          paginaDespesa.drawLine({
            start: { x: MARGEM + cardPaddingX, y: linhaBaseY },
            end: { x: MARGEM_DIREITA - cardPaddingX, y: linhaBaseY },
            thickness: 0.5,
            color: COR_BORDA,
          })
        }
      })

      yDetalhe = cardBaseY - 34

      paginaDespesa.drawText('FOTO DA NOTA FISCAL', {
        x: MARGEM,
        y: yDetalhe,
        size: 9,
        font: fonteNegrito,
        color: COR_TEXTO_SECUNDARIO,
      })
      yDetalhe -= 16

      // Se a imagem estiver ausente, corrompida ou em formato não suportado,
      // registra um aviso detalhado na página e segue para a próxima despesa
      // sem quebrar a geração do PDF inteiro.
      let contentTypeStorage: string | undefined
      try {
        if (!despesa.image_path) {
          throw new Error('Despesa sem imagem associada (image_path vazio)')
        }

        // Usa o client admin (service role) para não depender da sessão do
        // usuário durante o download: a sessão pode expirar ou ter políticas
        // de Storage divergentes das políticas de tabela, e esse download
        // roda inteiramente no servidor, sem necessidade de RLS por usuário.
        const { data: imagemBaixada, error: erroImagem } = await supabaseAdmin.storage
          .from('receipts')
          .download(despesa.image_path)

        if (erroImagem || !imagemBaixada) {
          throw new Error(
            `Não foi possível baixar a imagem do Storage: ${erroImagem?.message ?? 'sem detalhes'}`
          )
        }

        contentTypeStorage = imagemBaixada.type
        const bytes = new Uint8Array(await imagemBaixada.arrayBuffer())
        const mediaType = inferirMimeType(despesa.image_path, imagemBaixada.type)

        let imagemEmbutida
        if (mediaType === 'image/png') {
          imagemEmbutida = await pdfDoc.embedPng(bytes)
        } else if (mediaType === 'image/jpeg') {
          imagemEmbutida = await pdfDoc.embedJpg(bytes)
        } else {
          throw new Error(
            `Formato de imagem não suportado pelo pdf-lib (mediaType detectado: ${mediaType}, content-type do Storage: ${imagemBaixada.type})`
          )
        }

        const larguraDisponivel = LARGURA_CONTEUDO
        const alturaDisponivel = yDetalhe - MARGEM
        const dimensoes = imagemEmbutida.scaleToFit(larguraDisponivel, alturaDisponivel)
        const fotoX = MARGEM + (larguraDisponivel - dimensoes.width) / 2
        const fotoY = MARGEM + (alturaDisponivel - dimensoes.height) / 2

        // Borda fina ao redor da foto
        paginaDespesa.drawRectangle({
          x: fotoX - 2,
          y: fotoY - 2,
          width: dimensoes.width + 4,
          height: dimensoes.height + 4,
          borderColor: COR_BORDA,
          borderWidth: 0.75,
        })

        paginaDespesa.drawImage(imagemEmbutida, {
          x: fotoX,
          y: fotoY,
          width: dimensoes.width,
          height: dimensoes.height,
        })
      } catch (erroFoto) {
        console.error(`[/api/reembolso/${id}/pdf] Falha ao embutir foto da despesa`, {
          despesaId: despesa.id,
          imagePath: despesa.image_path,
          contentTypeStorage,
          message: erroFoto instanceof Error ? erroFoto.message : String(erroFoto),
          stack: erroFoto instanceof Error ? erroFoto.stack : undefined,
          erroCompleto: erroFoto,
        })

        const alturaPlaceholder = 80
        const placeholderY = yDetalhe - alturaPlaceholder
        paginaDespesa.drawRectangle({
          x: MARGEM,
          y: placeholderY,
          width: LARGURA_CONTEUDO,
          height: alturaPlaceholder,
          borderColor: COR_BORDA,
          borderWidth: 0.75,
        })
        const mensagem = '[Foto da nota fiscal indisponível]'
        const larguraMensagem = fonteNormal.widthOfTextAtSize(mensagem, 11)
        paginaDespesa.drawText(mensagem, {
          x: MARGEM + (LARGURA_CONTEUDO - larguraMensagem) / 2,
          y: placeholderY + alturaPlaceholder / 2 - 4,
          size: 11,
          font: fonteNormal,
          color: COR_ALERTA,
        })
      }
    }

    const pdfBytes = await pdfDoc.save()
    const caminhoPdf = `${user.id}/reembolso-${lote.id}.pdf`

    const { error: erroUpload } = await supabaseAdmin.storage
      .from('reimbursements')
      .upload(caminhoPdf, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (erroUpload) {
      console.error(`[/api/reembolso/${id}/pdf] Erro ao subir o PDF:`, erroUpload)
      return NextResponse.json({ error: 'Não foi possível salvar o PDF' }, { status: 500 })
    }

    const { error: erroAtualizacao } = await supabase
      .from('reimbursement_batches')
      .update({ pdf_path: caminhoPdf })
      .eq('id', lote.id)

    if (erroAtualizacao) {
      console.error(`[/api/reembolso/${id}/pdf] Erro ao atualizar o lote:`, erroAtualizacao)
      return NextResponse.json({ error: 'Não foi possível salvar o PDF' }, { status: 500 })
    }

    // Redireciona (303: POST -> GET) de volta pra tela do lote, que já sabe
    // mostrar o botão "Baixar PDF" quando pdf_path estiver preenchido
    return NextResponse.redirect(new URL(`/despesas/reembolso/${lote.id}`, request.url), {
      status: 303,
    })
  } catch (error) {
    console.error(`[/api/reembolso/${id}/pdf] Erro inesperado`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json({ error: 'Não foi possível gerar o PDF' }, { status: 500 })
  }
}
