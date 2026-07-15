import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'

// ─── DELETE /api/admin/cursos/[id]/inscripciones/[alumnoId] — quitar alumno ──
//     alumnoId = alumnos.id (== curso_inscripciones.alumno_id)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; alumnoId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const admin = createAdminClient()
    const { error, count } = await admin
      .from('curso_inscripciones')
      .delete({ count: 'exact' })
      .eq('curso_id', params.id)
      .eq('alumno_id', params.alumnoId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!count) return NextResponse.json({ error: 'Inscripción no encontrada' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/cursos/[id]/inscripciones/[alumnoId]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
