'use client'

import { useParams } from 'next/navigation'
import AulaCurso from '@/components/cursos/AulaCurso'

/**
 * Aula del curso DENTRO del portal del alumno, al lado de sus materias
 * (/alumno/materia/[id]): mismo sidebar, misma barra móvil, misma navegación.
 * La vista previa del admin sigue en /cursos/[id].
 */
export default function CursoAlumnoPage() {
  const { id } = useParams<{ id: string }>()
  return <AulaCurso cursoId={id} />
}
