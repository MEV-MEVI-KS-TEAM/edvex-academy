import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { firmarVideoUrl } from '@/lib/video/bunny-firma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Obtener alumno para verificar acceso
    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('id, meses_desbloqueados, inscripcion_pagada')
      .eq('usuario_id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumno = alumnoData as { id: string; meses_desbloqueados: number; inscripcion_pagada: boolean }

    // Verificar que la materia pertenece a un mes desbloqueado
    const { data: mesData } = await supabase
      .from('materias')
      .select('codigo, mes_contenido_id, meses_contenido(numero)')
      .eq('id', params.id)
      .single()

    if (!mesData) return NextResponse.json({ error: 'Materia no encontrada' }, { status: 404 })

    const materiaInfo = mesData as unknown as {
      codigo: string
      mes_contenido_id: string
      meses_contenido: { numero: number } | null
    }

    // Materias de un programa por área (Secundaria / licenciatura) no tienen mes:
    // se sirven solo por /api/alumno/plan/materia, con su propio control de acceso.
    if (!materiaInfo.mes_contenido_id) {
      return NextResponse.json({ error: 'No tienes acceso a esta materia' }, { status: 403 })
    }

    const numeroMes = materiaInfo.meses_contenido?.numero ?? 0
    const esTutoria = materiaInfo.codigo.startsWith('TUT')

    // TUT* (Tutoría) siempre accesible para cualquier alumno activo.
    // Demás materias: solo si el mes está desbloqueado.
    if (!esTutoria && numeroMes > alumno.meses_desbloqueados) {
      return NextResponse.json({ error: 'No tienes acceso a esta materia' }, { status: 403 })
    }

    // Obtener materia completa con semanas y evaluaciones
    const { data: materia, error } = await supabase
      .from('materias')
      .select('*, semanas(*), evaluaciones(id, titulo, titulo_en, tipo, intentos_max, activa)')
      .eq('id', params.id)
      .single()

    if (error || !materia) return NextResponse.json({ error: 'Materia no encontrada' }, { status: 404 })

    const m = materia as unknown as {
      id: string
      codigo: string
      nombre: string
      nombre_en: string
      color_hex: string
      descripcion: string
      descripcion_en: string
      objetivo: string
      temario: string[]
      bibliografia: Record<string, string>[]
      bibliografia_en?: Record<string, string>[]
      semanas: { id: string; numero: number; titulo: string; titulo_en?: string; contenido: string; contenido_en: string; url_en: string; videos: { titulo: string; titulo_en?: string; url: string; url_en?: string; duracion: string }[] }[]
      evaluaciones: { id: string; titulo: string; titulo_en: string; tipo: string; intentos_max: number; activa: boolean }[]
    }

    // Ordenar semanas por número. Bunny Stream se firma AQUÍ, después del control
    // de acceso de arriba: la URL firmada es la llave del video por 6 horas.
    // YouTube y cualquier otra URL salen tal cual (firmarVideoUrl no las toca).
    const semanas = (m.semanas ?? [])
      .sort((a, b) => a.numero - b.numero)
      .map(s => ({
        ...s,
        videos: (s.videos ?? []).map(v => ({
          ...v,
          url: firmarVideoUrl(v.url, 'api/alumno/materia'),
          url_en: v.url_en ? firmarVideoUrl(v.url_en, 'api/alumno/materia') : v.url_en,
        })),
      }))

    // Una sola query para todos los intentos de todas las evaluaciones activas
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
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
