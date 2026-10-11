import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { canonizarVideoUrl, esBunnyUrl } from '@/lib/video/bunny-url'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { semanaId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const { videos } = await req.json()
    if (!Array.isArray(videos)) {
      return NextResponse.json({ error: 'videos debe ser un array' }, { status: 400 })
    }

    // Validar estructura de cada video. Se aceptan YouTube y Bunny Stream (videos
    // propios); Bunny se guarda SIEMPRE canónica, sin token (canonizarVideoUrl):
    // una URL firmada pegada desde el navegador vencería en unas horas.
    // titulo_en y url_en son opcionales (versión en inglés).
    const ytPattern = /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]+/
    const urlValida = (u: string) => ytPattern.test(u) || esBunnyUrl(u)
    for (const v of videos) {
      if (typeof v.titulo !== 'string' || typeof v.url !== 'string' || typeof v.duracion !== 'string') {
        return NextResponse.json({ error: 'Cada video debe tener titulo, url y duracion (strings)' }, { status: 400 })
      }
      if (v.titulo_en !== undefined && v.titulo_en !== null && typeof v.titulo_en !== 'string') {
        return NextResponse.json({ error: 'titulo_en debe ser texto' }, { status: 400 })
      }
      if (v.url_en !== undefined && v.url_en !== null && typeof v.url_en !== 'string') {
        return NextResponse.json({ error: 'url_en debe ser texto' }, { status: 400 })
      }
      for (const u of [v.url, v.url_en]) {
        if (u && !urlValida(u)) {
          return NextResponse.json(
            { error: `URL de video inválida: "${u}". Debe ser una URL de YouTube (youtube.com/watch?v= o youtu.be/) o de un video propio` },
            { status: 400 }
          )
        }
      }
      v.url = canonizarVideoUrl(v.url)
      if (typeof v.url_en === 'string') v.url_en = canonizarVideoUrl(v.url_en)
    }

    const admin = createAdminClient()

    const { error } = await admin
      .from('semanas')
      .update({ videos })
      .eq('id', params.semanaId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
