import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { firmarVideoUrl } from '@/lib/video/bunny-firma'
import { alumnoDeArea, esMateriaDelAlumno } from '@/lib/area/acceso'
import { semanasLibres } from '@/lib/alumno-protegido'

// ─── GET /api/alumno/plan/materia/[id] — materia de un programa por área ─────
// Mismo contrato que /api/alumno/materia/[id] (Preparatoria) para que la vista
// sea la misma, con el control de acceso del área: la materia debe ser del área
// del alumno y, en licenciatura, de su carrera.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const alumno = await alumnoDeArea(supabase, user.id)
    if (!alumno) return NextResponse.json({ error: 'No tienes acceso a esta materia' }, { status: 403 })

    const { data: materia, error } = await supabase
      .from('materias')
      .select('*, semanas(*), evaluaciones(id, titulo, titulo_en, tipo, intentos_max, activa)')
      .eq('id', params.id)
      .single()

    if (error || !materia) return NextResponse.json({ error: 'Materia no encontrada' }, { status: 404 })

    const m = materia as unknown as {
      id: string
      area: string | null
      carrera: string | null
      numero_mes: number | null
      semanas: { id: string; numero: number; videos: { titulo: string; url: string; url_en?: string; duracion: string }[] }[]
      evaluaciones: { id: string; titulo: string; titulo_en: string; tipo: string; intentos_max: number; activa: boolean }[]
    } & Record<string, unknown>

    if (!esMateriaDelAlumno(m, alumno)) {
      return NextResponse.json({ error: 'No tienes acceso a esta materia' }, { status: 403 })
    }

    // Bunny Stream se firma AQUÍ, después del control de acceso de arriba.
    const semanas = (m.semanas ?? [])
      .sort((a, b) => a.numero - b.numero)
      .map(s => ({
        ...s,
        videos: (s.videos ?? []).map(v => ({
          ...v,
          url: firmarVideoUrl(v.url, 'api/alumno/plan/materia'),
          url_en: v.url_en ? firmarVideoUrl(v.url_en, 'api/alumno/plan/materia') : v.url_en,
        })),
      }))

    const evaluacionesActivas = (m.evaluaciones ?? []).filter(e => e.activa)
    const evalIds = evaluacionesActivas.map(e => e.id)
    const intentosPorEval = new Map<string, { count: number; aprobada: boolean; calificacion: number | null }>()

    if (evalIds.length > 0) {
      const { data: intentosResumen } = await supabase
        .from('intentos_evaluacion')
        .select('evaluacion_id, calificacion, aprobado')
        .eq('alumno_id', alumno.id)
        .in('evaluacion_id', evalIds)

      for (const intento of intentosResumen ?? []) {
        const ev = intento as { evaluacion_id: string; calificacion: number; aprobado: boolean }
        const curr = intentosPorEval.get(ev.evaluacion_id) ?? { count: 0, aprobada: false, calificacion: null }
        intentosPorEval.set(ev.evaluacion_id, {
          count: curr.count + 1,
          aprobada: curr.aprobada || ev.aprobado,
          calificacion: ev.aprobado ? (ev.calificacion ?? curr.calificacion) : curr.calificacion,
        })
      }
    }

    const evaluacionesConIntentos = evaluacionesActivas.map(ev => {
      const resumen = intentosPorEval.get(ev.id) ?? { count: 0, aprobada: false, calificacion: null }
      return {
        ...ev,
        intentos_usados: resumen.count,
        aprobada: resumen.aprobada,
        calificacion_aprobatoria: resumen.calificacion,
      }
    })

    return NextResponse.json({
      ...m,
      semanas,
      evaluaciones: evaluacionesConIntentos,
      // Cuentas protegidas: las semanas no se encadenan por avance.
      semanas_libres: semanasLibres(user.id),
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
