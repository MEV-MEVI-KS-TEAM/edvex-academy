import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { alumnoPuedeAccederEvaluacion } from '@/lib/alumno-evaluacion-access'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Obtener alumno
    const { data: alumnoData } = await supabase
      .from('alumnos')
      .select('id, meses_desbloqueados')
      .eq('usuario_id', user.id)
      .single()

    if (!alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumno = alumnoData as { id: string; meses_desbloqueados: number }

    // Obtener evaluación
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

    // Verificar acceso: TUT* siempre; demás materias según mes vs meses_desbloqueados
    const { data: materiaRow } = await supabase
      .from('materias')
      .select('codigo, mes_contenido_id, meses_contenido(numero)')
      .eq('id', ev.materia_id)
      .single()

    const m = materiaRow as unknown as {
      codigo: string
      mes_contenido_id: string | null
      meses_contenido: { numero: number } | null
    } | null
    // Materias de un programa por área no tienen mes: su examen va por /api/alumno/plan/evaluacion.
    if (!m?.mes_contenido_id) {
      return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })
    }
    const codigo = m?.codigo ?? ''
    const numeroMes = m?.meses_contenido?.numero ?? 0
    if (!alumnoPuedeAccederEvaluacion(codigo, numeroMes, alumno.meses_desbloqueados)) {
      return NextResponse.json({ error: 'No tienes acceso a esta evaluación' }, { status: 403 })
    }

    // Contar intentos
    const { count: intentosUsados } = await supabase
      .from('intentos_evaluacion')
      .select('id', { count: 'exact', head: true })
      .eq('alumno_id', alumno.id)
      .eq('evaluacion_id', params.id)

    // Obtener preguntas SIN respuesta_correcta ni retroalimentacion
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
      },
      intentos_usados: intentosUsados ?? 0,
      preguntas: preguntas ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
