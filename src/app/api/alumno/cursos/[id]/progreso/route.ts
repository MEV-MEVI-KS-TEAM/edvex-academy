import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── POST /api/alumno/cursos/[id]/progreso ────────────────────────────────────
// Marca/desmarca una lección como completada. Sesión del alumno vía RLS
// (curso_progreso: insert/update propio) — SIN service role.
// body { leccion_id, completada }
//
// Identity bridge (EDVEX): el progreso se guarda contra alumnos.id (UUID
// aleatorio), NO auth.uid(). Se resuelve alumnos.id vía usuario_id y se escribe
// como alumno_id — que es exactamente lo que exige la policy de RLS.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // El admin en vista previa NO registra progreso (defensa en profundidad: la
    // RLS INSERT solo comprueba alumno_id, no el rol, así que el bloqueo debe
    // hacerse aquí — no basta con ocultar el botón en el cliente). Rol en
    // MAYÚSCULA, comparación sensible a mayúsculas (convención EDVEX).
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .maybeSingle()
    if (usuario?.rol === 'ADMIN') {
      return NextResponse.json({ error: 'La vista previa de administrador no registra progreso' }, { status: 403 })
    }

    // Identity bridge: resolver alumnos.id. Un no-admin sin fila en alumnos no
    // tiene acceso → no puede registrar progreso.
    const { data: alumno } = await supabase
      .from('alumnos')
      .select('id')
      .eq('usuario_id', user.id)
      .maybeSingle()
    if (!alumno) {
      return NextResponse.json({ error: 'No puedes registrar progreso en este curso' }, { status: 403 })
    }
    const alumnoId = alumno.id as string

    const body = await request.json().catch(() => ({}))
    const leccionId = body.leccion_id as string | undefined
    const completada = body.completada !== false // default true
    if (!leccionId) return NextResponse.json({ error: 'leccion_id requerido' }, { status: 400 })

    // La lección debe pertenecer al curso de la URL Y ser accesible por el
    // alumno (RLS en curso_lecciones/curso_modulos ya filtra por accesibilidad).
    const { data: leccion } = await supabase
      .from('curso_lecciones')
      .select('id, curso_modulos!inner(curso_id)')
      .eq('id', leccionId)
      .maybeSingle()
    const cursoDeLeccion = (leccion as unknown as { curso_modulos?: { curso_id?: string } } | null)?.curso_modulos?.curso_id
    if (!leccion || cursoDeLeccion !== params.id) {
      return NextResponse.json({ error: 'Lección no disponible en este curso' }, { status: 404 })
    }

    // Upsert idempotente respetando UNIQUE(leccion_id, alumno_id).
    // El re-marcado no duplica: on conflict actualiza completada/completada_at.
    // alumno_id = alumnos.id (identity bridge), NUNCA auth.uid().
    const { error } = await supabase
      .from('curso_progreso')
      .upsert(
        {
          leccion_id: leccionId,
          alumno_id: alumnoId,
          completada,
          completada_at: completada ? new Date().toISOString() : null,
        },
        { onConflict: 'leccion_id,alumno_id' }
      )

    if (error) {
      if (error.code === '42501') {
        return NextResponse.json({ error: 'No puedes registrar progreso en este curso' }, { status: 403 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, completada })
  } catch (err) {
    console.error('[POST /api/alumno/cursos/[id]/progreso]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
