import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'

// ─── POST /api/admin/cursos/[id]/modulos — crear módulo ──────────────────────
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
    const nombre = (body.nombre as string | undefined)?.trim()
    const nombreEn = (body.nombre_en as string | undefined)?.trim() || ''
    if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })

    const admin = createAdminClient()
    const { data: curso } = await admin
      .from('cursos')
      .select('id')
      .eq('id', params.id)
      .single()
    if (!curso) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 })

    // orden = siguiente al máximo actual
    const { data: last } = await admin
      .from('curso_modulos')
      .select('orden')
      .eq('curso_id', params.id)
      .order('orden', { ascending: false })
      .limit(1)
    const orden = ((last?.[0]?.orden as number | undefined) ?? -1) + 1

    const { data: modulo, error } = await admin
      .from('curso_modulos')
      .insert({ curso_id: params.id, nombre, nombre_en: nombreEn, orden })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(modulo, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/cursos/[id]/modulos]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
