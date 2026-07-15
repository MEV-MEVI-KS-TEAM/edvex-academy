/** Tipos del módulo Cursos y Diplomados (tablas nuevas de la migración).
 *  Bilingüe EDVEX: cada campo de texto visible al alumno tiene su gemelo `_en`
 *  (patrón nombre/nombre_en, resuelto en el visor con loc()). */

export type CursoTipo = 'curso' | 'diplomado'
export type CursoEstado = 'borrador' | 'publicado'

export interface Curso {
  id: string
  nombre: string
  nombre_en: string
  descripcion: string | null
  descripcion_en: string
  tipo: CursoTipo
  portada_path: string | null
  estado: CursoEstado
  orden: number
  created_at: string
  updated_at: string
}

export interface CursoListItem extends Curso {
  portadaUrl: string | null
  numModulos: number
  numLecciones: number
  numAlumnos: number
}

export interface CursoLeccion {
  id: string
  modulo_id: string
  titulo: string
  titulo_en: string
  video_url: string | null
  contenido_texto: string | null
  contenido_texto_en: string
  material_path: string | null
  materialUrl: string | null
  orden: number
}

export interface CursoModulo {
  id: string
  curso_id: string
  nombre: string
  nombre_en: string
  orden: number
  lecciones: CursoLeccion[]
}

export interface CursoInscrito {
  alumno_id: string
  created_at: string
  nombre: string
  email: string
  matricula: string | null
  activo: boolean
}

export interface CursoDetalle {
  curso: Curso & { portadaUrl: string | null }
  modulos: CursoModulo[]
  inscritos: CursoInscrito[]
}

/** Fila del endpoint existente GET /api/admin/alumnos que consume la pestaña Alumnos.
 *  `id` es alumnos.id (el mismo valor que se guarda en curso_inscripciones.alumno_id). */
export interface AlumnoAdminRow {
  id: string
  matricula: string
  nombre_completo: string
  email: string
  activo: boolean
}
