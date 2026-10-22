import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { alumnoDeArea, puedeVerMateria } from '@/lib/area/acceso'
import { esAlumnoProtegido } from '@/lib/alumno-protegido'

// ─── POST /api/alumno/plan/evaluacion/[id]/enviar ────────────────────────────
// Mismo contrato y calificación que /api/alumno/evaluacion/[id]/enviar
// (Preparatoria), con el acceso del área. Califica en el servidor, guarda el
// intento y recalcula la calificación de la materia (recalcular_calificacion).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Cuenta compartida (lib/alumno-protegido), igual que en el examen de
    // Preparatoria: califica y ve el resultado, pero no consume intentos, no
    // guarda el intento ni recalcula la calificación de la materia.
    const protegido = esAlumnoProtegido(user.id)

    const alumno = await alumnoDeArea(supabase, user.id)
    if (!alumno) return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })

    const { data: evaluacion, error: evalError } = await supabase
      .from('evaluaciones')
      .select('id, titulo, intentos_max, activa, materia_id')
      .eq('id', params.id)
      .single()

    if (evalError || !evaluacion) {
      return NextResponse.json({ error: 'Evaluación no encontrada' }, { status: 404 })
    }

    const ev = evaluacion as {
      id: string; titulo: string; intentos_max: number; activa: boolean; materia_id: string
    }

    if (!ev.activa) {
      return NextResponse.json({ error: 'Esta evaluación no está disponible' }, { status: 403 })
    }

    if (!(await puedeVerMateria(supabase, ev.materia_id, alumno))) {
      return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })
    }

    let usados = 0
    if (!protegido) {
      const { count: intentosUsados } = await supabase
        .from('intentos_evaluacion')
        .select('id', { count: 'exact', head: true })
        .eq('alumno_id', alumno.id)
        .eq('evaluacion_id', params.id)

      usados = intentosUsados ?? 0
      if (usados >= ev.intentos_max) {
        return NextResponse.json({ error: 'No tienes más intentos disponibles' }, { status: 400 })
      }
    }

    const body = await request.json()
    const respuestasAlumno: Record<string, number> = body.respuestas ?? {}

    // Preguntas CON respuesta_correcta y retroalimentacion (solo en servidor)
    const { data: preguntas, error: pregError } = await supabase
      .from('preguntas')
      .select('id, numero, texto, texto_en, tipo, opciones, opciones_en, respuesta_correcta, retroalimentacion, puntos')
      .eq('evaluacion_id', params.id)
      .order('numero')

    if (pregError || !preguntas) {
      return NextResponse.json({ error: 'Error al obtener preguntas' }, { status: 500 })
    }

    type Pregunta = {
      id: string; numero: number; texto: string; texto_en: string; tipo: string
      opciones: string[]; opciones_en: string[]; respuesta_correcta: number; retroalimentacion: string; puntos: number
    }

    const pregs = preguntas as Pregunta[]

    let puntosObtenidos = 0
    let puntosTotal = 0
    let correctas = 0

    const detalle = pregs.map(p => {
      const respuestaAlumno = respuestasAlumno[p.id] ?? -1
      const esCorrecta = respuestaAlumno === p.respuesta_correcta

      puntosTotal += p.puntos
      if (esCorrecta) {
        puntosObtenidos += p.puntos
        correctas++
      }

      return {
        pregunta_id: p.id,
        numero: p.numero,
        texto: p.texto,
        texto_en: p.texto_en,
        tipo: p.tipo,
        opciones: p.opciones,
        opciones_en: p.opciones_en,
        respuesta_alumno: respuestaAlumno,
        respuesta_correcta: p.respuesta_correcta,
        es_correcta: esCorrecta,
        retroalimentacion: p.retroalimentacion,
      }
    })

    const calificacion = puntosTotal > 0
      ? Math.round((puntosObtenidos / puntosTotal) * 10 * 10) / 10
      : 0
    const aprobado = calificacion >= 6.0
    const intentoNumero = usados + 1

    if (!protegido) {
      const { error: intentoError } = await supabase
        .from('intentos_evaluacion')
        .insert({
          alumno_id: alumno.id,
          evaluacion_id: params.id,
          respuestas: respuestasAlumno,
          calificacion,
          aprobado,
          intento_numero: intentoNumero,
          tiempo_segundos: 0,
        })

      if (intentoError) {
        return NextResponse.json({ error: intentoError.message }, { status: 500 })
      }

      // Calificación propia de la materia (mejor intento) en `calificaciones`.
      await supabase.rpc('recalcular_calificacion', {
        p_alumno_id: alumno.id,
        p_materia_id: ev.materia_id,
      })
    }

    return NextResponse.json({
      calificacion,
      aprobado,
      total_preguntas: pregs.length,
      correctas,
      intento_numero: intentoNumero,
      detalle,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
