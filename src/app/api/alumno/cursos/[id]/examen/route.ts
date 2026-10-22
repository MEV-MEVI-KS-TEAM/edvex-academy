import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  CALIFICACION_MINIMA_DEFAULT,
  INTENTOS_PERMITIDOS_DEFAULT,
  alumnoIdDe,
  leerPreguntas,
  puedeExamenFinal,
  puedeVerCurso,
  sanitizar,
} from '@/lib/cursos/examen'

// ─── GET /api/alumno/cursos/[id]/examen ──────────────────────────────────────
// Port plantilla PV. Devuelve el examen del curso SANITIZADO: sin
// respuesta_correcta y sin explicacion. La tabla tiene RLS solo-admin, así que
// se lee con el cliente admin DESPUÉS de validar sesión, acceso al curso (RLS) e
// inscripción. 404 limpio si el curso no tiene examen.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (!(await puedeVerCurso(supabase, params.id))) {
      return NextResponse.json({ error: 'Curso no disponible' }, { status: 404 })
    }

    const admin = createAdminClient()
    const alumnoId = await alumnoIdDe(supabase, user.id)

    // Gate en código: esta ruta lee con service_role, que bypasea la RLS.
    if (!(await puedeExamenFinal(admin, params.id, alumnoId))) {
      return NextResponse.json({ error: 'Curso no disponible' }, { status: 404 })
    }

    const preguntas = await leerPreguntas(admin, params.id)
    if (preguntas.length === 0) {
      return NextResponse.json({ error: 'Este curso no tiene examen final' }, { status: 404 })
    }

    // Mejor puntaje previo, para que la UI pueda mostrar "volver a intentar".
    const { data: previos } = await admin
      .from('curso_examen_resultados')
      .select('porcentaje')
      .eq('curso_id', params.id)
      .eq('alumno_id', alumnoId)
      .order('porcentaje', { ascending: false })
      .limit(1)

    // Aprobar CIERRA el examen: si ya aprobó, no se sirve el banco
    // (/examen/enviar lo rechazaría con 409 de todos modos).
    const mejor = previos?.[0]?.porcentaje ?? null
    const aprobado = mejor !== null && Number(mejor) >= CALIFICACION_MINIMA_DEFAULT

    return NextResponse.json({
      total: preguntas.length,
      mejor_porcentaje: mejor,
      intentos_permitidos: INTENTOS_PERMITIDOS_DEFAULT,
      aprobado,
      preguntas: aprobado ? [] : preguntas.map(sanitizar),
    })
  } catch (err) {
    console.error('[GET /api/alumno/cursos/[id]/examen]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
