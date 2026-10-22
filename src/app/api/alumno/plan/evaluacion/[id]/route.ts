import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { alumnoDeArea, puedeVerMateria } from '@/lib/area/acceso'

// ─── GET /api/alumno/plan/evaluacion/[id] — examen de una materia del área ───
// Mismo contrato que /api/alumno/evaluacion/[id] (Preparatoria), con el acceso
// del área: la evaluación debe ser de una materia del programa del alumno.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const alumno = await alumnoDeArea(supabase, user.id)
    if (!alumno) return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })

    const { data: evaluacion, error: evalError } = await supabase
      .from('evaluaciones')
      .select('id, titulo, titulo_en, tipo, intentos_max, activa, materia_id')
      .eq('id', params.id)
      .single()

    if (evalError || !evaluacion) {
      return NextResponse.json({ error: 'Evaluación no encontrada' }, { status: 404 })
    }

    const ev = evaluacion as {
      id: string; titulo: string; titulo_en: string; tipo: string; intentos_max: number; activa: boolean; materia_id: string
    }

    if (!ev.activa) {
      return NextResponse.json({ error: 'Esta evaluación no está disponible' }, { status: 403 })
    }

    if (!(await puedeVerMateria(supabase, ev.materia_id, alumno))) {
      return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })
    }

    const { count: intentosUsados } = await supabase
      .from('intentos_evaluacion')
      .select('id', { count: 'exact', head: true })
      .eq('alumno_id', alumno.id)
      .eq('evaluacion_id', params.id)

    // Preguntas SIN respuesta_correcta ni retroalimentacion
    const { data: preguntas, error: pregError } = await supabase
      .from('preguntas')
      .select('id, numero, texto, texto_en, tipo, opciones, opciones_en, puntos')
      .eq('evaluacion_id', params.id)
      .order('numero')

    if (pregError) return NextResponse.json({ error: pregError.message }, { status: 500 })

    return NextResponse.json({
      evaluacion: {
        id: ev.id,
        titulo: ev.titulo,
        titulo_en: ev.titulo_en,
        tipo: ev.tipo,
        intentos_max: ev.intentos_max,
        materia_id: ev.materia_id,
      },
      intentos_usados: intentosUsados ?? 0,
      preguntas: preguntas ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
