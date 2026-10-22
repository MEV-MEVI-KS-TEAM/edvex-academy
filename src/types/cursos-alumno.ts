/** Tipos del visor del alumno (respuestas de las API /api/alumno/cursos).
 *  Los campos `_en` viajan al cliente para resolverse con loc() según el idioma activo. */
import type { CursoTipo } from './cursos'
import type { ActividadesUnidad } from '@/components/actividades/tipos'

export interface CursoCatalogoItem {
  id: string
  nombre: string
  nombre_en: string
  descripcion: string | null
  descripcion_en: string
  tipo: CursoTipo
  portadaUrl: string | null
  totalLecciones: number
  completadas: number
  porcentaje: number
}

export interface LeccionAlumno {
  id: string
  titulo: string
  titulo_en: string
  video_url: string | null
  contenido_texto: string | null
  contenido_texto_en: string
  materialUrl: string | null
  tieneMaterial: boolean
  orden: number
  completada: boolean
  /** Actividades interactivas «actividades/1» ya validadas; null = no hay. */
  actividades?: ActividadesUnidad | null
  /** PDF de las actividades de la lección (https); null = no hay. */
  actividades_pdf_url?: string | null
}

export interface ModuloAlumno {
  id: string
  nombre: string
  nombre_en: string
  orden: number
  lecciones: LeccionAlumno[]
}

export interface CursoDetalleAlumno {
  curso: {
    id: string
    nombre: string
    nombre_en: string
    descripcion: string | null
    descripcion_en: string
    tipo: CursoTipo
    estado: string
    portadaUrl: string | null
    /** Cuaderno de actividades de todo el curso (https); null = no hay. */
    cuaderno_pdf_url?: string | null
  }
  modoPreview: boolean
  modulos: ModuloAlumno[]
  totalLecciones: number
  completadas: number
  porcentaje: number
  completado: boolean
  primeraLeccionPendienteId: string | null
}
