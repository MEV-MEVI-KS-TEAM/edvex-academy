// Solo servidor: bunny-firma-core importa node:crypto, así que importarlo desde un
// componente del navegador rompe el build (EDVEX no trae el paquete `server-only`).
import { configBunnyDe, firmarUrlVideo } from './bunny-firma-core'

/**
 * Firma en el SERVIDOR las URLs de Bunny Stream con las variables
 * BUNNY_LIBRARY_ID y BUNNY_TOKEN_KEY (nunca NEXT_PUBLIC_: la llave no viaja al
 * navegador). Llamar SOLO después de validar que el usuario puede ver ese
 * contenido: la URL firmada es la llave del video durante 6 horas.
 *
 * Si falta la config, el alumno ve "Video no disponible por el momento" y aquí
 * queda un error claro en los logs del servidor (sin la llave).
 */
// Una materia trae hasta 24 URLs: sin esto, una sola visita escribiría 24 veces
// el mismo error. Se registra como mucho una vez por minuto por (lugar, error).
const ultimoAviso = new Map<string, number>()

export function firmarVideoUrl(url: string, donde: string): string
export function firmarVideoUrl(url: string | null, donde: string): string | null
export function firmarVideoUrl(url: string | null, donde: string): string | null {
  if (!url) return url
  const r = firmarUrlVideo(url, configBunnyDe(process.env))
  if (!r.error) return r.url
  const clave = `${donde}|${r.error}`
  const ahora = Date.now()
  if (ahora - (ultimoAviso.get(clave) ?? 0) < 60_000) return r.url
  ultimoAviso.set(clave, ahora)
  if (r.error === 'sin_config') {
    console.error(
      `[bunny] ${donde}: falta BUNNY_LIBRARY_ID o BUNNY_TOKEN_KEY (o no son válidas) en las variables del servidor; ` +
        'el alumno ve "Video no disponible por el momento". Configúralas en Vercel (Production y Preview) y redespliega.'
    )
  } else {
    console.error(
      `[bunny] ${donde}: el video ${r.url} es de otra biblioteca que BUNNY_LIBRARY_ID; no se firma ` +
        '(el alumno ve "Video no disponible por el momento").'
    )
  }
  return r.url
}
