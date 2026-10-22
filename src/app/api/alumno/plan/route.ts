import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { alumnoDeArea, nombrePrograma } from '@/lib/area/acceso'

// ─── GET /api/alumno/plan — materias del programa del área, por mes ──────────
// Secundaria y licenciaturas (port de la plantilla PV). Solo para alumnos con
// `alumnos.area` secundaria / licenciatura; cualquier otro recibe 404.
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const alumno = await alumnoDeArea(supabase, user.id)
    if (!alumno) return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 })

    let query = supabase
      .from('materias')
      .select('id, codigo, nombre, descripcion, color_hex, numero_mes, orden, semanas(id)')
      .eq('area', alumno.area)
    if (alumno.area === 'licenciatura') query = query.eq('carrera', alumno.carrera as string)
    const { data: materiasRaw, error } = await query
      .order('numero_mes', { ascending: true })
      .order('orden', { ascending: true })
    if (error) return NextResponse.json({ error: 'No se pudieron cargar las materias' }, { status: 500 })

    const materias = (materiasRaw ?? []) as unknown as {
      id: string; codigo: string; nombre: string; descripcion: string; color_hex: string
      numero_mes: number | null; orden: number | null; semanas: { id: string }[]
    }[]

    const semanaIds = materias.flatMap(m => (m.semanas ?? []).map(s => s.id))
    const [{ data: progreso }, { data: calificaciones }] = await Promise.all([
      semanaIds.length > 0
        ? supabase.from('progreso_semanas').select('semana_id').eq('alumno_id', alumno.id).in('semana_id', semanaIds)
        : Promise.resolve({ data: [] as { semana_id: string }[] }),
      supabase.from('calificaciones').select('materia_id, calificacion_final, aprobada').eq('alumno_id', alumno.id),
    ])
    const hechas = new Set((progreso ?? []).map(p => (p as { semana_id: string }).semana_id))
    const califPor = new Map(
      ((calificaciones ?? []) as { materia_id: string; calificacion_final: number; aprobada: boolean }[])
        .map(c => [c.materia_id, c])
    )

    const meses = new Map<number, unknown[]>()
    for (const m of materias) {
      const numero = m.numero_mes ?? 1
      const sem = m.semanas ?? []
      const c = califPor.get(m.id)
      const lista = meses.get(numero) ?? []
      lista.push({
        id: m.id,
        codigo: m.codigo,
        nombre: m.nombre,
        descripcion: m.descripcion,
        color_hex: m.color_hex,
        total_semanas: sem.length,
        semanas_completadas: sem.filter(s => hechas.has(s.id)).length,
        calificacion: c ? Number(c.calificacion_final) : null,
        aprobada: c?.aprobada ?? false,
      })
      meses.set(numero, lista)
    }

    return NextResponse.json({
      area: alumno.area,
      programa: nombrePrograma(alumno),
      total_materias: materias.length,
      meses: [...meses.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([numero, lista]) => ({ numero, materias: lista })),
    })
  } catch (err) {
    console.error('[GET /api/alumno/plan]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
