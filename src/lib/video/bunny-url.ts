/**
 * Bunny Stream — reconocer y reconstruir URLs de embed. Módulo PURO: no lee
 * variables de entorno ni firma nada, así que lo pueden importar el servidor,
 * los componentes del navegador y las pruebas unitarias.
 *
 * La firma (token + expires) vive en `bunny-firma-core.ts` / `bunny-firma.ts`,
 * que solo corren en el servidor: la llave de firma NUNCA llega al navegador.
 *
 * Reglas:
 * - En la BD se guarda SIEMPRE la URL canónica, sin token:
 *     https://player.mediadelivery.net/embed/{library_id}/{video_id}
 *   (`canonizarVideoUrl` la normaliza al guardar).
 * - El servidor la firma solo después de validar el acceso del alumno.
 * - El navegador monta el iframe solo si la URL trae `token` y `expires`
 *   válidos; una URL de Bunny sin firma es un video que no se puede ver
 *   (la biblioteca tiene token authentication y respondería 403), así que se
 *   pinta un aviso neutro en vez de un iframe roto.
 *
 * Igual que parseVideoUrl: whitelist de hosts, IDs validados por regex y la
 * URL del iframe se RECONSTRUYE — nunca se pasa la URL cruda de la BD.
 */

const HOSTS = new Set(['player.mediadelivery.net', 'iframe.mediadelivery.net'])
/** /embed/{library_id numérico}/{video_id GUID}, con o sin «/» final. */
const RUTA = /^\/embed\/(\d{1,12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
const TOKEN = /^[0-9a-f]{64}$/i
const EXPIRES = /^\d{9,11}$/

export interface BunnyVideo {
  libraryId: string
  videoId: string
  /** Presentes y bien formados solo si la URL ya viene firmada. */
  token: string | null
  expires: number | null
}

export function parseBunnyUrl(url: string | null | undefined): BunnyVideo | null {
  if (!url || typeof url !== 'string') return null
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  // http se acepta y se RECONSTRUYE en https (nunca se usa la URL cruda): si se
  // rechazara, VideoEmbed la mandaría al extractor de YouTube (`embed/…`).
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password || u.port) return null
  if (!HOSTS.has(u.hostname.toLowerCase())) return null
  const m = u.pathname.match(RUTA)
  if (!m) return null
  const t = u.searchParams.get('token')
  const e = u.searchParams.get('expires')
  const firmada = t !== null && e !== null && TOKEN.test(t) && EXPIRES.test(e)
  return {
    libraryId: m[1],
    videoId: m[2].toLowerCase(),
    token: firmada ? t!.toLowerCase() : null,
    expires: firmada ? Number(e) : null,
  }
}

export function esBunnyUrl(url: string | null | undefined): boolean {
  return parseBunnyUrl(url) !== null
}

/**
 * ¿La URL apunta a un host de Bunny Stream (aunque no sea un embed válido)?
 * Sirve para que una URL de mediadelivery.net mal formada (p. ej. /play/… o
 * un GUID roto) no caiga en el extractor de YouTube ni en un link externo:
 * se pinta el aviso neutro.
 */
export function esHostBunny(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const h = new URL(url.trim()).hostname.toLowerCase()
    return h === 'mediadelivery.net' || h.endsWith('.mediadelivery.net')
  } catch {
    return false
  }
}

/** Vigencia con la que firma el servidor (bunny-firma-core: 6 h). */
const VIGENCIA_S = 6 * 60 * 60

/**
 * ¿Ya venció la firma? La página pide la materia una vez; si el alumno abre la
 * semana horas después, montar el iframe daría 403 dentro del reproductor.
 * Margen de 60 s para no montar un enlace a punto de vencer.
 *
 * Dos condiciones, para que un reloj del alumno adelantado no deje TODOS los
 * videos en «caducó» (la hora de `expires` es la del servidor):
 *   - la página lleva abierta al menos la vigencia (`abiertaMs`, reloj
 *     monótono: performance.now() no depende de la hora del equipo); la URL se
 *     firmó DESPUÉS de cargar la página, así que antes de eso no puede vencer;
 *   - y además `expires` ya pasó según el reloj local.
 */
export function bunnyCaducada(
  v: BunnyVideo,
  ahoraS: number = Math.floor(Date.now() / 1000),
  abiertaMs: number = typeof performance !== 'undefined' ? performance.now() : 0,
): boolean {
  if (v.expires === null) return false
  return abiertaMs >= (VIGENCIA_S - 60) * 1000 && v.expires - 60 <= ahoraS
}

/** Texto cuando la firma ya venció (pestaña abierta más de 6 h). */
export const VIDEO_CADUCADO = 'El enlace de este video caducó. Recarga la página para verlo.'

export function bunnyCanonica(libraryId: string, videoId: string): string {
  return `https://player.mediadelivery.net/embed/${libraryId}/${videoId}`
}

/** URL para el iframe: SOLO si viene firmada; si no, null (no hay nada que montar). */
export function bunnyEmbedFirmado(v: BunnyVideo): string | null {
  if (!v.token || v.expires === null) return null
  return `${bunnyCanonica(v.libraryId, v.videoId)}?token=${v.token}&expires=${v.expires}`
}

/**
 * Normaliza una URL de video ANTES de guardarla: si es de Bunny, la deja
 * canónica (sin token, sin expires, sin otros parámetros); cualquier otra URL
 * se devuelve tal cual. Así un admin que pega una URL ya firmada no deja en la
 * BD un token que vence en unas horas.
 */
export function canonizarVideoUrl<T extends string | null>(url: T): T {
  if (url === null) return url
  const v = parseBunnyUrl(url)
  return (v ? bunnyCanonica(v.libraryId, v.videoId) : url) as T
}

/** Atributo `allow` del iframe de Bunny (el que recomienda su documentación). */
export const BUNNY_IFRAME_ALLOW = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture'

/** Texto que ve el alumno cuando el video de Bunny no se puede firmar. */
export const VIDEO_NO_DISPONIBLE = 'Video no disponible por el momento'
