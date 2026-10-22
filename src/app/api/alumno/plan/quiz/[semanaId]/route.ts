import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { alumnoDeArea, puedeVerMateria, type AlumnoArea } from '@/lib/area/acceso'

/**
 * Quiz semanal de un programa por área. Mismo contrato que
 * /api/alumno/quiz/[semanaId] (Preparatoria), con el acceso del área:
 * semana → materia → materia del área (y carrera) del alumno.
 */
async function verificarAccesoSemana(
  supabase: Awaited<ReturnType<typeof createClient>>,
  semanaId: string,
  alumno: AlumnoArea
): Promise<{ ok: boolean; error?: string }> {
  const { data: semana } = await supabase
    .from('semanas')
    .select('materia_id')
    .eq('id', semanaId)
    .single()

  if (!semana) return { ok: false, error: 'Semana no encontrada' }

  const ok = await puedeVerMateria(supabase, (semana as { materia_id: string }).materia_id, alumno)
  return ok ? { ok: true } : { ok: false, error: 'No tienes acceso a este contenido' }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { semanaId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { semanaId } = params

    const alumno = await alumnoDeArea(supabase, user.id)
    if (!alumno) return NextResponse.json({ error: 'No tienes acceso a este contenido' }, { status: 403 })

    const acceso = await verificarAccesoSemana(supabase, semanaId, alumno)
    if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: 403 })

    // Mismas columnas que el quiz de Preparatoria (SemanaQuiz las espera así).
    const { data: preguntas } = await supabase
      .from('quiz_semana')
      .select('id, pregunta, opciones, respuesta_correcta, explicacion, orden')
      .eq('semana_id', semanaId)
      .order('orden')

    const { data: respuestaPrevia } = await supabase
      .from('quiz_respuestas')
      .select('respuestas, completado_en')
      .eq('alumno_id', alumno.id)
      .eq('semana_id', semanaId)
      .maybeSingle()

    return NextResponse.json({
      preguntas: preguntas ?? [],
      respuesta_previa: respuestaPrevia ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { semanaId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { semanaId } = params
    const body = await request.json()
    const { respuestas } = body as { respuestas: Record<string, number> }

    if (!respuestas || typeof respuestas !== 'object') {
      return NextResponse.json({ error: 'respuestas requeridas' }, { status: 400 })
    }

    const alumno = await alumnoDeArea(supabase, user.id)
    if (!alumno) return NextResponse.json({ error: 'No tienes acceso a este contenido' }, { status: 403 })

    const acceso = await verificarAccesoSemana(supabase, semanaId, alumno)
    if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: 403 })

    // Guardar respuestas (upsert — permite re-intentar si no se guardó antes)
    const { error } = await supabase
      .from('quiz_respuestas')
      .upsert(
        {
          alumno_id: alumno.id,
          semana_id: semanaId,
          respuestas,
          completado_en: new Date().toISOString(),
        },
        { onConflict: 'alumno_id,semana_id', ignoreDuplicates: false }
      )

    if (error) return NextResponse.json({ error: 'Error al guardar respuestas' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
