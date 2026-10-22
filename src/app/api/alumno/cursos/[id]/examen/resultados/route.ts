import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { alumnoIdDe, puedeExamenFinal, puedeVerCurso } from '@/lib/cursos/examen'
import type { ResultadoHistorial } from '@/types/cursos-examen'

// ─── GET /api/alumno/cursos/[id]/examen/resultados ───────────────────────────
// Port plantilla PV. Historial propio del alumno en este curso y su mejor
// puntaje. Cada envío es un renglón.
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

    // Se filtra por el alumnos.id del usuario en sesión: aunque se use el
    // cliente admin, un alumno nunca puede pedir el historial de otro.
    const admin = createAdminClient()
    const alumnoId = await alumnoIdDe(supabase, user.id)

    if (!(await puedeExamenFinal(admin, params.id, alumnoId))) {
      return NextResponse.json({ total_intentos: 0, mejor_porcentaje: null, historial: [] })
    }

    const { data } = await admin
      .from('curso_examen_resultados')
      .select('id, aciertos, total, porcentaje, created_at')
      .eq('curso_id', params.id)
      .eq('alumno_id', alumnoId)
      .order('created_at', { ascending: false })

    const historial = (data ?? []) as ResultadoHistorial[]
    const mejor = historial.reduce<number | null>(
      (max, r) => (max === null || Number(r.porcentaje) > max ? Number(r.porcentaje) : max),
      null
    )

    return NextResponse.json({
      total_intentos: historial.length,
      mejor_porcentaje: mejor,
      historial,
    })
  } catch (err) {
    console.error('[GET /api/alumno/cursos/[id]/examen/resultados]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
