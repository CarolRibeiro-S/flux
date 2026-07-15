// Utilitários de hash do PIN numérico, usando a Web Crypto API (disponível
// tanto no browser quanto no runtime Node/Edge do Next.js) — o PIN em si
// nunca é armazenado em nenhum lugar, só o hash SHA-256 dele.

const PIN_REGEX = /^\d{4,6}$/

export function pinValido(pin: string): boolean {
  return PIN_REGEX.test(pin)
}

async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashPin(pin: string): Promise<string> {
  return sha256Hex(pin)
}

export async function verificarPin(pin: string, hash: string): Promise<boolean> {
  const hashCalculado = await hashPin(pin)
  return hashCalculado === hash
}
