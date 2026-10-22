import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esAlumnoProtegido } from '@/lib/alumno-protegido'

/**
 * Verifica que el alumno tenga acceso al mes al que pertenece la semana.
 * Cadena: semana → materia → meses_contenido.numero <= alumno.meses_desbloqueados
 */
async function verificarAccesoSemana(
  supabase: Awaited<ReturnType<typeof createClient>>,
  semanaId: string,
  alumnoId: string,
  mesesDesbloqueados: number
): Promise<{ ok: boolean; error?: string }> {
  const { data: semana } = await supabase
    .from('semanas')
    .select('materia_id')
    .eq('id', semanaId)
    .single()

  if (!semana) return { ok: false, error: 'Semana no encontrada' }

  const { data: materia } = await supabase
    .from('materias')
    .select('codigo, mes_contenido_id')
    .eq('id', (semana as { materia_id: string }).materia_id)
    .single()

  if (!materia) return { ok: false, error: 'Materia no encontrada' }

  const mat = materia as { codigo: string; mes_contenido_id: string }

  // TUT* (Tutoría) siempre accesible para cualquier alumno activo
  if (mat.codigo.startsWith('TUT')) return { ok: true }

  const { data: mes } = await supabase
    .from('meses_contenido')
    .select('numero')
    .eq('id', mat.mes_contenido_id)
    .single()

  if (!mes) return { ok: false, error: 'Mes no encontrado' }

  if ((mes as { numero: number }).numero > mesesDesbloqueados) {
    return { ok: false, error: 'No tienes acceso a este contenido' }
  }

  return { ok: true }
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

    // Obtener alumno con meses_desbloqueados
    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('id, meses_desbloqueados')
      .eq('usuario_id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const { id: alumnoId, meses_desbloqueados } = alumnoData as { id: string; meses_desbloqueados: number }

    // Verificar acceso al mes de la semana
    const acceso = await verificarAccesoSemana(supabase, semanaId, alumnoId, meses_desbloqueados)
    if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: 403 })

    // Obtener preguntas del quiz para esta semana
    const { data: preguntas } = await supabase
      .from('quiz_semana')
      .select('id, pregunta, opciones, respuesta_correcta, explicacion, orden')
      .eq('semana_id', semanaId)
      .order('orden')

    // Verificar si el alumno ya completó este quiz
    const { data: respuestaPrevia } = await supabase
      .from('quiz_respuestas')
      .select('respuestas, completado_en')
      .eq('alumno_id', alumnoId)
      .eq('semana_id', semanaId)
      .single()

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

    // Obtener alumno con meses_desbloqueados
    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('id, meses_desbloqueados')
      .eq('usuario_id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const { id: alumnoId, meses_desbloqueados } = alumnoData as { id: string; meses_desbloqueados: number }

    // Verificar acceso al mes de la semana
    const acceso = await verificarAccesoSemana(supabase, semanaId, alumnoId, meses_desbloqueados)
    if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: 403 })

    // Cuenta compartida (lib/alumno-protegido): el quiz se califica y se muestra en
    // pantalla, pero no se guarda (igual que en /api/alumno/plan/quiz).
    if (esAlumnoProtegido(user.id)) return NextResponse.json({ ok: true })

    // Guardar respuestas (upsert — permite re-intentar si no se guardó antes)
    const { error } = await supabase
      .from('quiz_respuestas')
      .upsert(
        {
          alumno_id: alumnoId,
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
