import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { parseBunnyUrl } from '@/lib/video/bunny-url'
import { firmarVideoUrl } from '@/lib/video/bunny-firma'

// ─── POST /api/admin/video-firmado — vista previa de Bunny Stream en el admin ─
// Los editores de semanas y de lecciones corren en el navegador y no pueden
// firmar (la llave vive solo en el servidor). Esta ruta firma UNA URL de Bunny
// para la vista previa. Solo ADMIN: es quien ya puede poner cualquier video en
// una semana y verlo como alumno, así que no abre nada nuevo.
// Cualquier URL que no sea de Bunny se rechaza: no es un firmador genérico.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const body = await request.json().catch(() => null) as { url?: unknown } | null
    const url = typeof body?.url === 'string' ? body.url : ''
    if (!parseBunnyUrl(url)) {
      return NextResponse.json({ error: 'No es una URL de video propio' }, { status: 400 })
    }

    const firmada = firmarVideoUrl(url, 'api/admin/video-firmado')
    const ok = parseBunnyUrl(firmada)?.token
    return NextResponse.json(
      ok ? { url: firmada } : { error: 'Video no disponible por el momento' },
      { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[POST /api/admin/video-firmado]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
