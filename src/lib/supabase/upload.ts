import { createClient } from '@/lib/supabase/client'

// Remove caracteres que o Storage não lida bem (espaços, acentos, etc.)
const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g')

function sanitizeFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
}

export async function uploadReceiptImage(file: File, userId: string) {
  const supabase = createClient()

  const fileName = `${Date.now()}-${sanitizeFileName(file.name)}`
  const path = `${userId}/${fileName}`

  const { data, error } = await supabase.storage.from('receipts').upload(path, file)

  if (error) {
    throw error
  }

  return data.path
}
