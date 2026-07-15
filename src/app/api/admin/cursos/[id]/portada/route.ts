import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { removeFolder, signedUrl } from '@/lib/cursos/storage'
import { BUCKET_CURSOS, PORTADA_MAX_BYTES, PORTADA_MIMES, sanitizeFilename, validarPortada } from '@/lib/cursos/archivos'

async function authAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { denied: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const denied = await verifyAdmin(supabase, user.id)
  if (denied) return { denied }
  return { denied: null }
}

// ─── POST /api/admin/cursos/[id]/portada ─────────────────────────────────────
// La subida NO pasa por este handler (Vercel corta bodies > 4.5MB): se emite
// una signed upload URL y el navegador sube directo a Storage.
//   {action:'upload-url', filename, size, type} → {path, token}
//   {action:'confirm', path}                    → verifica, actualiza DB, limpia viejos
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { denied } = await authAdmin()
    if (denied) return denied

    const admin = createAdminClient()
    const { data: curso } = await admin
      .from('cursos')
      .select('id, portada_path')
      .eq('id', params.id)
      .maybeSingle()
    if (!curso) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 })

    const body = await request.json()
    const carpeta = `portadas/${params.id}`

    // ── Paso 1: emitir signed upload URL ─────────────────────────────────────
    if (body.action === 'upload-url') {
      const filename = String(body.filename ?? '')
      const size = Number(body.size ?? 0)
      const type = String(body.type ?? '')

      const valid = validarPortada({ name: filename, size, type })
      if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

      // Nombre único: permite subir ANTES de borrar la portada anterior
      const path = `${carpeta}/${Date.now()}-${sanitizeFilename(filename)}`
      const { data, error } = await admin.storage
        .from(BUCKET_CURSOS)
        .createSignedUploadUrl(path)
      if (error || !data) return NextResponse.json({ error: error?.message ?? 'No se pudo crear la URL de subida' }, { status: 500 })

      return NextResponse.json({ path: data.path, token: data.token })
    }

    // ── Paso 2: confirmar subida ──────────────────────────────────────────────
    if (body.action === 'confirm') {
      const path = String(body.path ?? '')
      // El path lo manda el cliente: aceptar SOLO un archivo directo de la
      // carpeta de portadas de ESTE curso (sin '..', sin subcarpetas).
      const nombre = path.startsWith(`${carpeta}/`) ? path.slice(carpeta.length + 1) : ''
      if (!nombre || nombre.includes('/') || nombre.includes('..')) {
        return NextResponse.json({ error: 'Ruta de portada inválida' }, { status: 400 })
      }

      // Verificar que el objeto existe y su metadata es aceptable
      const { data: entries } = await admin.storage
        .from(BUCKET_CURSOS)
        .list(carpeta, { limit: 1000 })
      const objeto = (entries ?? []).find(e => e.name === nombre && e.id)
      if (!objeto) return NextResponse.json({ error: 'El archivo no se subió correctamente, reintenta' }, { status: 400 })

      const meta = objeto.metadata as { size?: number; mimetype?: string } | null
      const mimeOk = !meta?.mimetype || (PORTADA_MIMES as readonly string[]).includes(meta.mimetype)
      const sizeOk = !meta?.size || meta.size <= PORTADA_MAX_BYTES
      if (!mimeOk || !sizeOk) {
        await admin.storage.from(BUCKET_CURSOS).remove([path])
        return NextResponse.json({ error: 'El archivo subido no es una imagen válida (JPG/PNG/WebP ≤5MB)' }, { status: 400 })
      }

      // Actualizar DB y, solo después, borrar las portadas anteriores
      const { error: dbError } = await admin
        .from('cursos')
        .update({ portada_path: path, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

      const viejos = (entries ?? [])
        .filter(e => e.id && e.name !== nombre)
        .map(e => `${carpeta}/${e.name}`)
      if (viejos.length > 0) {
        await admin.storage.from(BUCKET_CURSOS).remove(viejos)
      }

      return NextResponse.json({ portada_path: path, portadaUrl: await signedUrl(admin, path) })
    }

    return NextResponse.json({ error: 'action inválida' }, { status: 400 })
  } catch (err) {
    console.error('[POST /api/admin/cursos/[id]/portada]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// ─── DELETE /api/admin/cursos/[id]/portada — quitar portada ──────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { denied } = await authAdmin()
    if (denied) return denied

    const admin = createAdminClient()
    const { data: curso } = await admin
      .from('cursos')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (!curso) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 })

    // Primero desligar en DB, después limpiar storage
    const { error } = await admin
      .from('cursos')
      .update({ portada_path: null, updated_at: new Date().toISOString() })
      .eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await removeFolder(admin, `portadas/${params.id}`)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/cursos/[id]/portada]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
