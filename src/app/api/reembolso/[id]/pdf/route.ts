import { NextResponse, type NextRequest } from 'next/server'
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { obterCategoria } from '@/lib/categorias'
import { formatarMoeda, formatarDataBR } from '@/lib/formatadores'

// Tamanho A4 em pontos
const LARGURA_PAGINA = 595.28
const ALTURA_PAGINA = 841.89
const MARGEM = 40

// Trunca o texto com "…" se ele não couber na largura disponível da coluna
function truncarTexto(texto: string, larguraMaxima: number, fonte: PDFFont, tamanho: number) {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= larguraMaxima) return texto

  let truncado = texto
  while (truncado.length > 1 && fonte.widthOfTextAtSize(`${truncado}…`, tamanho) > larguraMaxima) {
    truncado = truncado.slice(0, -1)
  }
  return `${truncado}…`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

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
    let y = ALTURA_PAGINA - MARGEM

    pagina.drawText('Relatório de Reembolso', {
      x: MARGEM,
      y,
      size: 22,
      font: fonteNegrito,
      color: rgb(0.05, 0.05, 0.1),
    })
    y -= 34

    const periodoTexto = `Período: ${
      lote.period_start ? formatarDataBR(lote.period_start) : '—'
    } a ${lote.period_end ? formatarDataBR(lote.period_end) : '—'}`
    pagina.drawText(periodoTexto, { x: MARGEM, y, size: 12, font: fonteNormal })
    y -= 20

    pagina.drawText(`Total: ${formatarMoeda(lote.total_amount ?? 0)}`, {
      x: MARGEM,
      y,
      size: 14,
      font: fonteNegrito,
      color: rgb(0, 0.6, 0.6),
    })
    y -= 34

    const colunas = [
      { titulo: 'Estabelecimento', x: MARGEM, largura: 190 },
      { titulo: 'Categoria', x: MARGEM + 190, largura: 90 },
      { titulo: 'Data', x: MARGEM + 290, largura: 70 },
      { titulo: 'Valor', x: MARGEM + 370, largura: 100 },
    ]

    function desenharCabecalhoTabela() {
      for (const coluna of colunas) {
        pagina.drawText(coluna.titulo, { x: coluna.x, y, size: 10, font: fonteNegrito })
      }
      y -= 16
      pagina.drawLine({
        start: { x: MARGEM, y: y + 6 },
        end: { x: LARGURA_PAGINA - MARGEM, y: y + 6 },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      })
    }

    desenharCabecalhoTabela()

    for (const despesa of listaDespesas) {
      // Quebra pra nova página antes de desenhar, repetindo o cabeçalho
      if (y - 16 < MARGEM) {
        pagina = pdfDoc.addPage([LARGURA_PAGINA, ALTURA_PAGINA])
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
        pagina.drawText(truncarTexto(texto, colunas[indice].largura, fonteNormal, 10), {
          x: colunas[indice].x,
          y,
          size: 10,
          font: fonteNormal,
        })
      })
      y -= 16
    }

    // ---------- Uma página por despesa, com dados e foto ----------
    for (const despesa of listaDespesas) {
      const paginaDespesa = pdfDoc.addPage([LARGURA_PAGINA, ALTURA_PAGINA])
      let yDetalhe = ALTURA_PAGINA - MARGEM

      paginaDespesa.drawText(despesa.merchant_name ?? 'Despesa', {
        x: MARGEM,
        y: yDetalhe,
        size: 18,
        font: fonteNegrito,
      })
      yDetalhe -= 30

      const categoria = obterCategoria(despesa.category)
      const campos: [string, string][] = [
        ['CNPJ', despesa.cnpj_emitente ?? '—'],
        ['Categoria', categoria.rotulo],
        ['Valor', formatarMoeda(despesa.amount ?? 0)],
        ['Data', despesa.expense_date ? formatarDataBR(despesa.expense_date) : '—'],
      ]

      for (const [rotulo, valor] of campos) {
        paginaDespesa.drawText(`${rotulo}: ${valor}`, {
          x: MARGEM,
          y: yDetalhe,
          size: 12,
          font: fonteNormal,
        })
        yDetalhe -= 18
      }

      yDetalhe -= 20

      // Se a imagem estiver ausente, corrompida ou em formato não suportado,
      // registra um aviso na página e segue para a próxima despesa sem
      // quebrar a geração do PDF inteiro.
      try {
        if (!despesa.image_path) {
          throw new Error('Despesa sem imagem associada')
        }

        const { data: imagemBaixada, error: erroImagem } = await supabase.storage
          .from('receipts')
          .download(despesa.image_path)

        if (erroImagem || !imagemBaixada) {
          throw new Error('Não foi possível baixar a imagem do Storage')
        }

        const bytes = new Uint8Array(await imagemBaixada.arrayBuffer())
        const extensao = despesa.image_path.split('.').pop()?.toLowerCase() ?? ''

        let imagemEmbutida
        if (extensao === 'png' || imagemBaixada.type === 'image/png') {
          imagemEmbutida = await pdfDoc.embedPng(bytes)
        } else if (
          extensao === 'jpg' ||
          extensao === 'jpeg' ||
          imagemBaixada.type === 'image/jpeg'
        ) {
          imagemEmbutida = await pdfDoc.embedJpg(bytes)
        } else {
          throw new Error(
            `Formato de imagem não suportado pelo pdf-lib (${extensao || imagemBaixada.type})`
          )
        }

        const larguraDisponivel = LARGURA_PAGINA - MARGEM * 2
        const alturaDisponivel = yDetalhe - MARGEM
        const dimensoes = imagemEmbutida.scaleToFit(larguraDisponivel, alturaDisponivel)

        paginaDespesa.drawImage(imagemEmbutida, {
          x: MARGEM,
          y: MARGEM,
          width: dimensoes.width,
          height: dimensoes.height,
        })
      } catch (erroFoto) {
        console.error(
          `[/api/reembolso/${id}/pdf] Falha ao embutir foto da despesa ${despesa.id}:`,
          erroFoto
        )
        paginaDespesa.drawText('[Foto da nota fiscal indisponível]', {
          x: MARGEM,
          y: yDetalhe,
          size: 12,
          font: fonteNormal,
          color: rgb(0.7, 0.2, 0.2),
        })
      }
    }

    const pdfBytes = await pdfDoc.save()
    const caminhoPdf = `${user.id}/reembolso-${lote.id}.pdf`

    const { error: erroUpload } = await supabase.storage
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
