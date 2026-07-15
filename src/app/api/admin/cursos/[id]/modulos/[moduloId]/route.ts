import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { removeFolder } from '@/lib/cursos/storage'
import { moveItem, type Direccion } from '@/lib/cursos/reorder'

async function authAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { denied: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const denied = await verifyAdmin(supabase, user.id)
  if (denied) return { denied }
  return { denied: null }
}

/** El módulo debe pertenecer al curso de la URL. */
async function getModuloDelCurso(admin: ReturnType<typeof createAdminClient>, cursoId: string, moduloId: string) {
  const { data } = await admin
    .from('curso_modulos')
    .select('id, curso_id, nombre, nombre_en, orden')
    .eq('id', moduloId)
    .eq('curso_id', cursoId)
    .single()
  return data
}

// ─── PATCH — renombrar (nombre / nombre_en) o mover (↑↓) ─────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; moduloId: string } }
) {
  try {
    const { denied } = await authAdmin()
    if (denied) return denied

    const admin = createAdminClient()
    const modulo = await getModuloDelCurso(admin, params.id, params.moduloId)
    if (!modulo) return NextResponse.json({ error: 'Módulo no encontrado' }, { status: 404 })

    const body = await request.json()

    if (body.move === 'up' || body.move === 'down') {
      const result = await moveItem(admin, 'curso_modulos', 'curso_id', params.id, params.moduloId, body.move as Direccion)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true })
    }

    const updates: Record<string, unknown> = {}
    if (body.nombre !== undefined) {
      const nombre = (body.nombre as string).trim()
      if (!nombre) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })
      updates.nombre = nombre
    }
    if (body.nombre_en !== undefined) {
      updates.nombre_en = (body.nombre_en as string | null)?.toString().trim() || ''
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('curso_modulos')
      .update(updates)
      .eq('id', params.moduloId)
      .select()
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Módulo no encontrado' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/admin/cursos/[id]/modulos/[moduloId]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// ─── DELETE — borrar módulo + materiales de sus lecciones en storage ─────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; moduloId: string } }
) {
  try {
    const { denied } = await authAdmin()
    if (denied) return denied

    const admin = createAdminClient()
    const modulo = await getModuloDelCurso(admin, params.id, params.moduloId)
    if (!modulo) return NextResponse.json({ error: 'Módulo no encontrado' }, { status: 404 })

    // Ids de lecciones ANTES de borrar (el cascade elimina las filas)
    const { data: lecciones } = await admin
      .from('curso_lecciones')
      .select('id')
      .eq('modulo_id', params.moduloId)

    const { error } = await admin.from('curso_modulos').delete().eq('id', params.moduloId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Limpieza de materiales huérfanos: {cursoId}/{leccionId}/
    for (const l of lecciones ?? []) {
      await removeFolder(admin, `${params.id}/${l.id}`)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/cursos/[id]/modulos/[moduloId]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
