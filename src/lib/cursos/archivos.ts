/**
 * Reglas de archivos del módulo Cursos — compartidas entre cliente (validación
 * previa a subir) y servidor (validación autoritativa en las API routes).
 * Bucket privado 'cursos' (límite duro del bucket: 10MB).
 */

export const BUCKET_CURSOS = 'cursos'

export const PORTADA_MAX_BYTES = 5 * 1024 * 1024 // 5MB
export const PORTADA_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PORTADA_EXTS = ['jpg', 'jpeg', 'png', 'webp'] as const

export const MATERIAL_MAX_BYTES = 10 * 1024 * 1024 // 10MB (== límite del bucket)
export const MATERIAL_MIMES = ['application/pdf'] as const
export const MATERIAL_EXTS = ['pdf'] as const

/** Nombre seguro para storage: sin acentos, espacios → guiones, solo [a-z0-9._-] */
export function sanitizeFilename(nombre: string): string {
  const raw = (nombre || 'archivo').trim()
  const dot = raw.lastIndexOf('.')
  const base = dot > 0 ? raw.slice(0, dot) : raw
  const ext = dot > 0 ? raw.slice(dot + 1) : ''
  const clean = (s: string) =>
    s
      .normalize('NFD')
      // quitar diacríticos combinantes (acentos) tras NFD (U+0300–U+036F)
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'archivo'
  return ext ? `${clean(base)}.${clean(ext)}` : clean(base)
}

export function extensionDe(nombre: string): string {
  const dot = nombre.lastIndexOf('.')
  return dot > 0 ? nombre.slice(dot + 1).toLowerCase() : ''
}

export type ValidacionArchivo = { ok: true } | { ok: false; error: string }

export function validarPortada(file: { name: string; size: number; type: string }): ValidacionArchivo {
  if (!PORTADA_MIMES.includes(file.type as (typeof PORTADA_MIMES)[number]) ||
      !PORTADA_EXTS.includes(extensionDe(file.name) as (typeof PORTADA_EXTS)[number])) {
    return { ok: false, error: 'La portada debe ser una imagen JPG, PNG o WebP.' }
  }
  if (file.size > PORTADA_MAX_BYTES) {
    return { ok: false, error: 'La portada no puede pesar más de 5MB.' }
  }
  return { ok: true }
}

export function validarMaterial(file: { name: string; size: number; type: string }): ValidacionArchivo {
  if (!MATERIAL_MIMES.includes(file.type as (typeof MATERIAL_MIMES)[number]) ||
      !MATERIAL_EXTS.includes(extensionDe(file.name) as (typeof MATERIAL_EXTS)[number])) {
    return { ok: false, error: 'El material debe ser un archivo PDF.' }
  }
  if (file.size > MATERIAL_MAX_BYTES) {
    return { ok: false, error: 'El PDF no puede pesar más de 10MB.' }
  }
  return { ok: true }
}

/** Ruta de portada dentro del bucket: portadas/{cursoId}/{filename} */
export function portadaPath(cursoId: string, filename: string): string {
  return `portadas/${cursoId}/${sanitizeFilename(filename)}`
}

/** Ruta de material dentro del bucket: {cursoId}/{leccionId}/{filename} */
export function materialPath(cursoId: string, leccionId: string, filename: string): string {
  return `${cursoId}/${leccionId}/${sanitizeFilename(filename)}`
}
