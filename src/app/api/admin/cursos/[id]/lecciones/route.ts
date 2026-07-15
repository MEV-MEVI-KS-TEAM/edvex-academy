import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'

// ─── POST /api/admin/cursos/[id]/lecciones — crear lección en un módulo ──────
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

    const body = await request.json()
    const moduloId = body.modulo_id as string | undefined
    const titulo = (body.titulo as string | undefined)?.trim()
    const tituloEn = (body.titulo_en as string | undefined)?.trim() || ''
    const videoUrl = (body.video_url as string | undefined)?.trim() || null
    const contenidoTexto = (body.contenido_texto as string | undefined)?.trim() || null
    const contenidoTextoEn = (body.contenido_texto_en as string | undefined)?.trim() || ''

    if (!moduloId) return NextResponse.json({ error: 'modulo_id es requerido' }, { status: 400 })
    if (!titulo) return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })

    const admin = createAdminClient()

    // El módulo debe pertenecer al curso de la URL
    const { data: modulo } = await admin
      .from('curso_modulos')
      .select('id')
      .eq('id', moduloId)
      .eq('curso_id', params.id)
      .single()
    if (!modulo) return NextResponse.json({ error: 'Módulo no encontrado en este curso' }, { status: 404 })

    const { data: last } = await admin
      .from('curso_lecciones')
      .select('orden')
      .eq('modulo_id', moduloId)
      .order('orden', { ascending: false })
      .limit(1)
    const orden = ((last?.[0]?.orden as number | undefined) ?? -1) + 1

    const { data: leccion, error } = await admin
      .from('curso_lecciones')
      .insert({
        modulo_id: moduloId,
        titulo,
        titulo_en: tituloEn,
        video_url: videoUrl,
        contenido_texto: contenidoTexto,
        contenido_texto_en: contenidoTextoEn,
        orden,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(leccion, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/cursos/[id]/lecciones]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
