/**
 * Devuelve la URL solo si es un enlace externo SEGURO (http/https). Para
 * cualquier otro esquema (javascript:, data:, vbscript:, etc.) devuelve null.
 * Úsalo antes de poner un video_url crudo en un href — React 18 no filtra
 * javascript: en producción, así que un href sin validar sería XSS almacenado.
 */
export function safeExternalUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}
