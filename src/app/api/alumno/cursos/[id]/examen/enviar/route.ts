import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  CALIFICACION_MINIMA_DEFAULT,
  INTENTOS_PERMITIDOS_DEFAULT,
  alumnoIdDe,
  calificar,
  leerPreguntas,
  puedeExamenFinal,
  puedeVerCurso,
} from '@/lib/cursos/examen'
import type { RespuestaEnviada } from '@/types/cursos-examen'
import { esAlumnoProtegido } from '@/lib/alumno-protegido'

// ─── POST /api/alumno/cursos/[id]/examen/enviar ──────────────────────────────
// Port plantilla PV. Califica 100% en el servidor, guarda el resultado e
// incluye la revisión del envío.
//
// body { respuestas: [{ pregunta_id, respuesta }] }
//
// Candados, todos server-side (la UI no es una defensa):
//   1. Envío vacío rechazado (no consume intento ni devuelve revisión).
//   2. Límite de intentos por alumno y curso.
//   3. Aprobar CIERRA el examen (409). Mientras quede reintento, la revisión es
//      diferida: sin ✓/✗ por pregunta ni claves.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (!(await puedeVerCurso(supabase, params.id))) {
      return NextResponse.json({ error: 'Curso no disponible' }, { status: 404 })
    }

    // Identity bridge: alumnos.id (FK de curso_examen_resultados.alumno_id).
    // Un usuario sin fila de alumno (admin en vista previa) recibe 404 legible.
    const alumnoId = await alumnoIdDe(supabase, user.id)
    if (!alumnoId) {
      return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const enviadas = Array.isArray(body?.respuestas) ? (body.respuestas as RespuestaEnviada[]) : []

    const admin = createAdminClient()

    if (!(await puedeExamenFinal(admin, params.id, alumnoId))) {
      return NextResponse.json({ error: 'Curso no disponible' }, { status: 404 })
    }

    const preguntas = await leerPreguntas(admin, params.id)
    if (preguntas.length === 0) {
      return NextResponse.json({ error: 'Este curso no tiene examen final' }, { status: 404 })
    }

    // ── Candado 2: intentos (se cuentan con admin, filtrando por alumno) ──
    const { data: previos, error: prevErr } = await admin
      .from('curso_examen_resultados')
      .select('porcentaje')
      .eq('curso_id', params.id)
      .eq('alumno_id', alumnoId)
    if (prevErr) {
      console.error('[POST /api/alumno/cursos/[id]/examen/enviar] previos', prevErr)
      return NextResponse.json({ error: 'No se pudieron leer tus intentos' }, { status: 500 })
    }

    const permitidos = INTENTOS_PERMITIDOS_DEFAULT
    const minima = CALIFICACION_MINIMA_DEFAULT

    // Cuenta compartida con prospectos (como en /api/alumno/evaluacion/[id]/enviar):
    // califica y ve su resultado, pero no guarda el intento ni lo cuenta.
    if (esAlumnoProtegido(user.id)) {
      const simulado = calificar(preguntas, enviadas, true)
      if (simulado.contestadas === 0) {
        return NextResponse.json({ error: 'Contesta al menos una pregunta antes de enviar el examen.' }, { status: 400 })
      }
      return NextResponse.json({
        id: null, created_at: new Date().toISOString(), aciertos: simulado.aciertos, total: simulado.total,
        porcentaje: simulado.porcentaje, desglose_temas: simulado.desglose, revision: simulado.revision,
        intentos_usados: 0, intentos_permitidos: permitidos, calificacion_minima: minima,
        aprobado: simulado.porcentaje >= minima, revision_completa: true,
      })
    }

    // ── Candado 3: aprobar CIERRA el examen ──
    const usados = (previos ?? []).length
    if ((previos ?? []).some(r => Number((r as { porcentaje: number }).porcentaje) >= minima)) {
      return NextResponse.json(
        { error: 'Ya aprobaste este examen: no se puede volver a presentar.', aprobado: true },
        { status: 409 }
      )
    }
    if (usados >= permitidos) {
      return NextResponse.json(
        {
          error: `Ya usaste tus ${permitidos} intentos para este examen.`,
          intentos_usados: usados,
          intentos_permitidos: permitidos,
        },
        { status: 409 }
      )
    }

    // Primera pasada sin claves, solo para conocer el porcentaje.
    const previo = calificar(preguntas, enviadas)
    // Se revela si el alumno ya no puede volver a presentar: aprobó o era su último intento.
    const revelarClaves = previo.porcentaje >= minima || usados + 1 >= permitidos

    const { aciertos, total, porcentaje, desglose, respuestas, revision, contestadas } =
      revelarClaves ? calificar(preguntas, enviadas, true) : previo

    // ── Candado 1: envío vacío (antes de insertar) ──
    if (contestadas === 0) {
      return NextResponse.json(
        { error: 'Contesta al menos una pregunta antes de enviar el examen.' },
        { status: 400 }
      )
    }

    // INSERT con admin: la RLS de resultados solo deja escribir a admin para que
    // el alumno no pueda fabricarse una calificación.
    const { data: guardado, error } = await admin
      .from('curso_examen_resultados')
      .insert({
        curso_id: params.id,
        alumno_id: alumnoId,
        aciertos,
        total,
        porcentaje,
        desglose_temas: desglose,
        respuestas,
      })
      .select('id, created_at')
      .single()

    if (error) {
      console.error('[POST /api/alumno/cursos/[id]/examen/enviar] insert', error)
      return NextResponse.json({ error: 'No se pudo guardar el resultado' }, { status: 500 })
    }

    return NextResponse.json({
      id: guardado.id,
      created_at: guardado.created_at,
      aciertos,
      total,
      porcentaje,
      desglose_temas: desglose,
      revision,
      intentos_usados: usados + 1,
      intentos_permitidos: permitidos,
      calificacion_minima: minima,
      aprobado: porcentaje >= minima,
      revision_completa: revelarClaves,
    })
  } catch (err) {
    console.error('[POST /api/alumno/cursos/[id]/examen/enviar]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
