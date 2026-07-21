/**
 * Helpers compartidos por las rutas admin de `documentos_alumno`.
 *
 * DIVERGENCIA DELIBERADA RESPECTO A PLANTILLA: el helper de plantilla soporta
 * DOS esquemas a la vez (el "legacy" de IVS —`tipo_documento`, `verificado`,
 * `url_archivo`, `fecha_subida`, `notas`— y el nuevo). EDVEX tiene únicamente
 * el nuevo, verificado contra information_schema:
 *
 *   id · alumno_id · tipo · nombre_archivo · url · estado ·
 *   comentario_admin · subido_en · revisado_en
 *
 * Mantener las ramas legacy aquí sería código muerto que finge cubrir un caso
 * inexistente, y que además enmascararía un fallo real: si algún día una
 * columna se renombra, el fallback silencioso devolvería 'pendiente' para todo
 * en vez de romper. Se porta la forma simple y se documenta la diferencia.
 */

export type DocEstadoAdmin = 'pendiente' | 'aprobado' | 'rechazado'

export const DOC_ESTADOS: readonly DocEstadoAdmin[] = ['pendiente', 'aprobado', 'rechazado']

export function esDocEstado(v: unknown): v is DocEstadoAdmin {
  return typeof v === 'string' && (DOC_ESTADOS as readonly string[]).includes(v)
}

export type AdminDocumentoListItem = {
  id: string
  alumno_id: string
  tipo: string
  nombre_archivo: string
  estado: DocEstadoAdmin
  comentario_admin: string | null
  subido_en: string
  revisado_en: string | null
  url: string | null
}

/**
 * Normaliza una fila cruda a la forma que consume la UI.
 *
 * `estado` cae a 'pendiente' si llegara un valor fuera del dominio: el
 * componente indexa un mapa de configuración por estado, y un valor inesperado
 * daría `undefined` y pantalla en blanco. Es una degradación consciente en el
 * borde de presentación, no un fallback de esquema.
 */
export function mapDocumentoAlumnoRow(row: Record<string, unknown>): AdminDocumentoListItem {
  const url = typeof row.url === 'string' && row.url.trim() !== '' ? row.url : null
  const comentario = row.comentario_admin
  const revisado = row.revisado_en

  return {
    id: String(row.id ?? ''),
    alumno_id: String(row.alumno_id ?? ''),
    tipo: String(row.tipo ?? ''),
    nombre_archivo: String(row.nombre_archivo ?? 'archivo.pdf'),
    estado: esDocEstado(row.estado) ? row.estado : 'pendiente',
    comentario_admin: typeof comentario === 'string' && comentario.trim() !== '' ? comentario : null,
    subido_en: row.subido_en != null ? String(row.subido_en) : '',
    revisado_en: revisado != null ? String(revisado) : null,
    url,
  }
}

/**
 * Ruta canónica en el bucket privado `documentos`: `{alumnoId}/{tipo}.{ext}`.
 *
 * Es la MISMA convención que ya usa
 * `src/app/api/admin/documentos/[alumnoId]/route.ts:31`. Se extrae aquí para
 * que exista una sola definición: si las dos rutas divergieran, una firmaría
 * URLs válidas y la otra 404 sobre el mismo documento, y el síntoma —"el PDF no
 * abre desde esta pantalla pero sí desde la ficha"— no señala a la causa.
 */
export function documentoStoragePath(alumnoId: string, tipo: string, nombreArchivo: string): string {
  const raw = nombreArchivo?.trim() || 'file.pdf'
  const ext = raw.includes('.') ? (raw.split('.').pop() ?? 'pdf').toLowerCase() : 'pdf'
  return `${alumnoId}/${tipo}.${ext}`
}

/** Extensiones a probar cuando `nombre_archivo` no refleja la real en Storage. */
export const EXTENSIONES_FALLBACK = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const

/** Campos que se escriben al resolver un documento. */
export function buildDocEstadoUpdates(estado: DocEstadoAdmin, comentario: string | null) {
  return {
    estado,
    comentario_admin: comentario,
    revisado_en: new Date().toISOString(),
  }
}

/**
 * Etiquetas de los 6 tipos que admite el CHECK de `documentos_alumno.tipo`
 * (scripts/migration-documentos.sql:4-11). Cualquier otra clave seria codigo
 * muerto: la BD la rechaza en el INSERT.
 * Mismos textos que DOC_LABELS en admin/alumnos/[id]/page.tsx, para que el
 * mismo documento no se llame distinto en la ficha y en la bandeja.
 */
export const TIPO_LABEL: Record<string, string> = {
  acta_nacimiento:        'Acta de Nacimiento',
  curp:                   'CURP',
  certificado_primaria:   'Certificado de Primaria',
  certificado_secundaria: 'Certificado de Secundaria',
  identificacion_oficial: 'Identificación Oficial',
  foto_perfil_doc:        'Foto (fondo blanco)',
}

export const tipoLabel = (t: string) => TIPO_LABEL[t?.toLowerCase()] ?? t
