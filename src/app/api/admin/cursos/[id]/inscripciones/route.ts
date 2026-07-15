import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'

// ─── POST /api/admin/cursos/[id]/inscripciones ────────────────────────────────
// body { alumno_id }            → asignar un alumno (alumno_id = alumnos.id)
// body { todos_activos: true }  → asignar a todos los alumnos activos
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const admin = createAdminClient()
    const { data: curso } = await admin
      .from('cursos')
      .select('id')
      .eq('id', params.id)
      .single()
    if (!curso) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 })

    const body = await request.json()

    // ── Asignación masiva a alumnos activos ──────────────────────────────────
    // En EDVEX el flag `activo` vive en usuarios, no en alumnos: se filtra por el
    // join alumnos.usuario_id → usuarios (activo = true).
    if (body.todos_activos === true) {
      const { data: activos, error: actError } = await admin
        .from('alumnos')
        .select('id, usuarios!inner(activo)')
        .eq('usuarios.activo', true)
      if (actError) return NextResponse.json({ error: actError.message }, { status: 500 })

      const ids = ((activos ?? []) as { id: string }[]).map(a => a.id)
      if (ids.length === 0) {
        return NextResponse.json({ agregados: 0, totalActivos: 0 })
      }

      const { data: existentes } = await admin
        .from('curso_inscripciones')
        .select('alumno_id')
        .eq('curso_id', params.id)
        .in('alumno_id', ids)
      const yaInscritos = new Set((existentes ?? []).map(e => e.alumno_id))
      const nuevos = ids.filter(id => !yaInscritos.has(id))

      if (nuevos.length > 0) {
        const { error: insError } = await admin
          .from('curso_inscripciones')
          .insert(nuevos.map(alumno_id => ({ curso_id: params.id, alumno_id })))
        if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
      }

      return NextResponse.json({ agregados: nuevos.length, totalActivos: ids.length })
    }

    // ── Asignación individual ─────────────────────────────────────────────────
    const alumnoId = body.alumno_id as string | undefined
    if (!alumnoId) return NextResponse.json({ error: 'alumno_id es requerido' }, { status: 400 })

    const { data: alumno } = await admin
      .from('alumnos')
      .select('id')
      .eq('id', alumnoId)
      .single()
    if (!alumno) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const { data: inscripcion, error } = await admin
      .from('curso_inscripciones')
      .insert({ curso_id: params.id, alumno_id: alumnoId })
      .select()
      .single()

    if (error) {
      // 23505 = unique_violation en UNIQUE(curso_id, alumno_id)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Este alumno ya está asignado al curso' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(inscripcion, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/cursos/[id]/inscripciones]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
