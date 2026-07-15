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

/** La lección debe pertenecer (vía su módulo) al curso de la URL. */
async function getLeccionDelCurso(
  admin: ReturnType<typeof createAdminClient>,
  cursoId: string,
  leccionId: string
) {
  const { data: leccion } = await admin
    .from('curso_lecciones')
    .select('id, modulo_id, titulo, titulo_en, video_url, contenido_texto, contenido_texto_en, material_path, orden')
    .eq('id', leccionId)
    .single()
  if (!leccion) return null
  const { data: modulo } = await admin
    .from('curso_modulos')
    .select('id')
    .eq('id', leccion.modulo_id)
    .eq('curso_id', cursoId)
    .single()
  return modulo ? leccion : null
}

// ─── PATCH — editar campos o mover (↑↓ dentro de su módulo) ──────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; leccionId: string } }
) {
  try {
    const { denied } = await authAdmin()
    if (denied) return denied

    const admin = createAdminClient()
    const leccion = await getLeccionDelCurso(admin, params.id, params.leccionId)
    if (!leccion) return NextResponse.json({ error: 'Lección no encontrada' }, { status: 404 })

    const body = await request.json()

    if (body.move === 'up' || body.move === 'down') {
      const result = await moveItem(admin, 'curso_lecciones', 'modulo_id', leccion.modulo_id, params.leccionId, body.move as Direccion)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
      return NextResponse.json({ ok: true })
    }

    const updates: Record<string, unknown> = {}
    if (body.titulo !== undefined) {
      const titulo = (body.titulo as string).trim()
      if (!titulo) return NextResponse.json({ error: 'El título no puede estar vacío' }, { status: 400 })
      updates.titulo = titulo
    }
    if (body.titulo_en !== undefined) {
      updates.titulo_en = (body.titulo_en as string | null)?.toString().trim() || ''
    }
    if (body.video_url !== undefined) {
      updates.video_url = (body.video_url as string | null)?.toString().trim() || null
    }
    if (body.contenido_texto !== undefined) {
      updates.contenido_texto = (body.contenido_texto as string | null)?.toString().trim() || null
    }
    if (body.contenido_texto_en !== undefined) {
      updates.contenido_texto_en = (body.contenido_texto_en as string | null)?.toString().trim() || ''
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('curso_lecciones')
      .update(updates)
      .eq('id', params.leccionId)
      .select()
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Lección no encontrada' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/admin/cursos/[id]/lecciones/[leccionId]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// ─── DELETE — borrar lección + su material en storage ────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; leccionId: string } }
) {
  try {
    const { denied } = await authAdmin()
    if (denied) return denied

    const admin = createAdminClient()
    const leccion = await getLeccionDelCurso(admin, params.id, params.leccionId)
    if (!leccion) return NextResponse.json({ error: 'Lección no encontrada' }, { status: 404 })

    const { error } = await admin.from('curso_lecciones').delete().eq('id', params.leccionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Material huérfano: {cursoId}/{leccionId}/
    await removeFolder(admin, `${params.id}/${params.leccionId}`)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/cursos/[id]/lecciones/[leccionId]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
