// A Anthropic só aceita esses 4 media types para imagem; são também os únicos
// formatos que faz sentido reconhecer ao ler algo do bucket 'receipts'.
export const MEDIA_TYPES_VALIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type MediaTypeValido = (typeof MEDIA_TYPES_VALIDOS)[number]

const EXTENSAO_PARA_MIME: Record<string, MediaTypeValido> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  // HEIC/HEIF não é suportado — cai no fallback jpeg abaixo
}

// O Storage às vezes devolve um content-type genérico (ex.: application/octet-stream
// ou o default text/plain;charset=UTF-8 do supabase-js quando o navegador não define
// um tipo no upload). Por isso a extensão do arquivo tem prioridade sobre o blobType:
// só confiamos no blobType se ele já for um dos 4 tipos reconhecidos.
export function inferirMimeType(imagePath: string, blobType: string): MediaTypeValido {
  const extensao = imagePath.split('.').pop()?.toLowerCase() ?? ''
  const porExtensao = EXTENSAO_PARA_MIME[extensao]
  if (porExtensao) return porExtensao

  if (MEDIA_TYPES_VALIDOS.includes(blobType as MediaTypeValido)) {
    return blobType as MediaTypeValido
  }

  return 'image/jpeg'
}
