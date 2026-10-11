/**
 * Firma de URLs de Bunny Stream (embed view token authentication) — parte PURA.
 *
 *   token = SHA256_HEX(token_key + video_id + expires)   ·   expires = UNIX en segundos
 *   https://player.mediadelivery.net/embed/{library_id}/{video_id}?token=…&expires=…
 *
 * No lee el entorno: recibe la config. Quien la usa en la app es
 * `bunny-firma.ts` (server-only), que la saca de BUNNY_LIBRARY_ID y
 * BUNNY_TOKEN_KEY. Vive aparte para poder probarla en tests/unit, igual que
 * site-config-core.ts y plan-semanal-core.ts.
 *
 * ⚠️ Usa node:crypto: NUNCA importar desde un componente del navegador.
 */
import { createHash } from 'node:crypto'
import { bunnyCanonica, parseBunnyUrl } from './bunny-url'

/** Vigencia de una URL firmada: 6 horas. */
export const BUNNY_VIGENCIA_S = 6 * 60 * 60

export interface BunnyConfig {
  libraryId: string
  tokenKey: string
}

export function tokenBunny(tokenKey: string, videoId: string, expires: number): string {
  return createHash('sha256').update(tokenKey + videoId + String(expires)).digest('hex')
}

export type ResultadoFirma =
  | { url: string; error: null }
  /** Es de Bunny pero no se pudo firmar: se devuelve la canónica (sin token). */
  | { url: string; error: 'sin_config' | 'otra_biblioteca' }

/**
 * Firma una URL de video si es de Bunny. Cualquier otra URL (YouTube, Vimeo,
 * Loom…) se devuelve tal cual. Si falta la config o la URL es de otra
 * biblioteca, se devuelve la canónica SIN firma: el navegador la reconoce como
 * Bunny no firmada y pinta "Video no disponible por el momento".
 */
export function firmarUrlVideo(
  url: string,
  cfg: BunnyConfig | null,
  ahoraS: number = Math.floor(Date.now() / 1000)
): ResultadoFirma {
  const v = parseBunnyUrl(url)
  if (!v) return { url, error: null }
  const canonica = bunnyCanonica(v.libraryId, v.videoId)
  if (!cfg) return { url: canonica, error: 'sin_config' }
  if (cfg.libraryId !== v.libraryId) return { url: canonica, error: 'otra_biblioteca' }
  const expires = ahoraS + BUNNY_VIGENCIA_S
  const token = tokenBunny(cfg.tokenKey, v.videoId, expires)
  return { url: `${canonica}?token=${token}&expires=${expires}`, error: null }
}

/** Lee la config de un objeto tipo process.env. null si falta o no es válida. */
export function configBunnyDe(env: Record<string, string | undefined>): BunnyConfig | null {
  const libraryId = env.BUNNY_LIBRARY_ID?.trim()
  const tokenKey = env.BUNNY_TOKEN_KEY?.trim()
  if (!libraryId || !tokenKey || !/^\d{1,12}$/.test(libraryId)) return null
  return { libraryId, tokenKey }
}
