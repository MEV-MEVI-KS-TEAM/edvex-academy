/**
 * Programas por ÁREA con plan de materias (Secundaria y licenciaturas), como en
 * la plataforma que recibe un cliente nuevo (plantilla PV): materias con
 * semanas, quiz semanal y examen, organizadas por mes.
 *
 * Viven en las MISMAS tablas que Preparatoria (materias, semanas, quiz_semana,
 * evaluaciones, preguntas) pero marcadas con `materias.area` y SIN
 * `mes_contenido_id`: así ninguna consulta de Preparatoria (que recorre
 * meses_contenido → materias) las ve, y Preparatoria no cambia.
 *
 * ⚠️ IDENTITY BRIDGE (EDVEX): `alumnos.id` es un UUID aleatorio distinto de
 * `auth.uid()`; se resuelve por `alumnos.usuario_id`.
 *
 * Regla de acceso: la materia debe ser del área del alumno y, en licenciatura,
 * de su carrera (`alumnos.carrera`). El programa del área está abierto completo
 * para el alumno inscrito (no hay ventana de pago por mes en estas áreas).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type AreaPlan = 'secundaria' | 'licenciatura'

export interface AlumnoArea {
  id: string
  area: AreaPlan
  carrera: string | null
}

/** Nombre del programa que ve el alumno (encabezado de «Mis materias»). */
export const PROGRAMAS: Record<string, string> = {
  secundaria: 'Secundaria',
  administracion: 'Licenciatura Ejecutiva en Administración',
  derecho: 'Licenciatura en Derecho',
  psicologia: 'Licenciatura en Psicología',
}

export function nombrePrograma(alumno: AlumnoArea): string {
  if (alumno.area === 'secundaria') return PROGRAMAS.secundaria
  return (alumno.carrera && PROGRAMAS[alumno.carrera]) || 'Licenciatura'
}

/** Alumno en sesión SI es de un área con plan de materias; null en cualquier otro caso. */
export async function alumnoDeArea(
  supabase: SupabaseClient,
  userId: string
): Promise<AlumnoArea | null> {
  const { data } = await supabase
    .from('alumnos')
    .select('id, area, carrera')
    .eq('usuario_id', userId)
    .maybeSingle()
  const a = data as { id: string; area: string | null; carrera: string | null } | null
  if (!a || (a.area !== 'secundaria' && a.area !== 'licenciatura')) return null
  // Licenciatura sin carrera asignada: no hay programa que mostrar (falla cerrado).
  if (a.area === 'licenciatura' && !a.carrera) return null
  return { id: a.id, area: a.area, carrera: a.carrera }
}

/** ¿Esta materia (area, carrera) pertenece al programa del alumno? */
export function esMateriaDelAlumno(
  materia: { area: string | null; carrera: string | null } | null | undefined,
  alumno: AlumnoArea
): boolean {
  if (!materia || materia.area !== alumno.area) return false
  if (alumno.area === 'licenciatura') return materia.carrera === alumno.carrera
  return true
}

/** ¿La materia `materiaId` es del programa del alumno? (lee area/carrera con su sesión). */
export async function puedeVerMateria(
  supabase: SupabaseClient,
  materiaId: string,
  alumno: AlumnoArea
): Promise<boolean> {
  const { data } = await supabase
    .from('materias')
    .select('area, carrera')
    .eq('id', materiaId)
    .maybeSingle()
  return esMateriaDelAlumno(data as { area: string | null; carrera: string | null } | null, alumno)
}
