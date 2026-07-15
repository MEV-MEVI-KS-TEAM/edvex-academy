/**
 * Helpers de Storage para el módulo Cursos — SOLO para uso en API routes
 * (reciben el admin client con service role). El bucket 'cursos' es PRIVADO:
 * todo se muestra con createSignedUrl (nunca getPublicUrl).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET_CURSOS } from './archivos'

export const SIGNED_URL_TTL = 3600 // 1 hora

export async function signedUrl(
  admin: SupabaseClient,
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null
  const { data } = await admin.storage.from(BUCKET_CURSOS).createSignedUrl(path, SIGNED_URL_TTL)
  return data?.signedUrl ?? null
}

/**
 * Borra recursivamente todos los objetos bajo un prefijo del bucket 'cursos'.
 * storage.list() no es recursivo: las "carpetas" se detectan porque no tienen id.
 */
export async function removeFolder(admin: SupabaseClient, prefix: string): Promise<void> {
  const cleanPrefix = prefix.replace(/\/+$/, '')
  if (!cleanPrefix) return // jamás vaciar el bucket completo por un prefijo vacío

  // list() pagina de a 1000 y aquí vamos BORRANDO lo listado, así que se
  // repite sin offset hasta vaciar; si una pasada no avanza, se corta.
  for (let pasada = 0; pasada < 20; pasada++) {
    const { data: entries, error } = await admin.storage
      .from(BUCKET_CURSOS)
      .list(cleanPrefix, { limit: 1000 })
    if (error || !entries || entries.length === 0) return

    const files: string[] = []
    const subfolders: string[] = []
    for (const entry of entries) {
      // Los archivos reales traen id; las carpetas virtuales traen id null
      if (entry.id) files.push(`${cleanPrefix}/${entry.name}`)
      else subfolders.push(`${cleanPrefix}/${entry.name}`)
    }

    let avance = false
    if (files.length > 0) {
      const { error: rmError } = await admin.storage.from(BUCKET_CURSOS).remove(files)
      if (rmError) console.error(`[cursos storage] error borrando bajo ${cleanPrefix}:`, rmError.message)
      else avance = true
    }
    for (const sub of subfolders) {
      await removeFolder(admin, sub)
      avance = true
    }
    if (!avance) return
    if (entries.length < 1000 && subfolders.length === 0) return
  }
}
