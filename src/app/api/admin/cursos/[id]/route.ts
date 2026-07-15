import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { removeFolder, signedUrl } from '@/lib/cursos/storage'
import type { Curso, CursoDetalle, CursoInscrito, CursoLeccion, CursoModulo } from '@/types/cursos'

type LeccionRow = Omit<CursoLeccion, 'materialUrl'>
type ModuloRow = { id: string; curso_id: string; nombre: string; nombre_en: string; orden: number }

async function authAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { denied: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const denied = await verifyAdmin(supabase, user.id)
  if (denied) return { denied }
  return { denied: null }
}

// ─── GET /api/admin/cursos/[id] — detalle completo para el editor ────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { denied } = await authAdmin()
    if (denied) return denied

    const admin = createAdminClient()

    const { data: curso, error } = await admin
      .from('cursos')
      .select('*')
      .eq('id', params.id)
      .single()
    if (error || !curso) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 })

    // Módulos ordenados
    const { data: modulosRaw } = await admin
      .from('curso_modulos')
      .select('id, curso_id, nombre, nombre_en, orden')
      .eq('curso_id', params.id)
      .order('orden', { ascending: true })
      .order('id', { ascending: true })

    const moduloIds = ((modulosRaw ?? []) as ModuloRow[]).map(m => m.id)

    // Lecciones de todos los módulos, con URL firmada del material
    let leccionesRaw: LeccionRow[] = []
    if (moduloIds.length > 0) {
      const { data } = await admin
        .from('curso_lecciones')
        .select('id, modulo_id, titulo, titulo_en, video_url, contenido_texto, contenido_texto_en, material_path, orden')
        .in('modulo_id', moduloIds)
        .order('orden', { ascending: true })
        .order('id', { ascending: true })
      leccionesRaw = (data ?? []) as LeccionRow[]
    }

    const lecciones: CursoLeccion[] = await Promise.all(
      leccionesRaw.map(async l => ({
        ...l,
        materialUrl: await signedUrl(admin, l.material_path),
      }))
    )

    const modulos: CursoModulo[] = ((modulosRaw ?? []) as ModuloRow[]).map(m => ({
      ...m,
      lecciones: lecciones.filter(l => l.modulo_id === m.id),
    }))

    // Inscritos con datos del usuario. En EDVEX alumnos.id es un UUID aleatorio
    // (== curso_inscripciones.alumno_id); el nombre/email/activo viven en
    // usuarios y se resuelven vía alumnos.usuario_id; la matrícula vive en alumnos.
    const { data: inscripciones } = await admin
      .from('curso_inscripciones')
      .select('alumno_id, created_at')
      .eq('curso_id', params.id)
      .order('created_at', { ascending: false })

    const alumnoIds = (inscripciones ?? []).map(i => i.alumno_id)
    let inscritos: CursoInscrito[] = []
    if (alumnoIds.length > 0) {
      const { data: alumnos } = await admin
        .from('alumnos')
        .select('id, matricula, usuario_id')
        .in('id', alumnoIds)
      const aMap = new Map(
        ((alumnos ?? []) as { id: string; matricula: string | null; usuario_id: string }[]).map(a => [a.id, a])
      )

      const usuarioIds = ((alumnos ?? []) as { usuario_id: string }[]).map(a => a.usuario_id)
      let uMap = new Map<string, { nombre_completo?: string; email?: string; activo?: boolean }>()
      if (usuarioIds.length > 0) {
        const { data: usuarios } = await admin
          .from('usuarios')
          .select('id, nombre_completo, email, activo')
          .in('id', usuarioIds)
        uMap = new Map(
          ((usuarios ?? []) as { id: string; nombre_completo?: string; email?: string; activo?: boolean }[]).map(u => [u.id, u])
        )
      }

      inscritos = (inscripciones ?? []).map(i => {
        const a = aMap.get(i.alumno_id)
        const u = a ? uMap.get(a.usuario_id) : undefined
        return {
          alumno_id: i.alumno_id,
          created_at: i.created_at,
          nombre: u?.nombre_completo?.trim() || '—',
          email: u?.email ?? '—',
          matricula: a?.matricula ?? null,
          activo: u?.activo ?? false,
        }
      })
    }

    const detalle: CursoDetalle = {
      curso: { ...(curso as Curso), portadaUrl: await signedUrl(admin, (curso as Curso).portada_path) },
      modulos,
      inscritos,
    }
    return NextResponse.json(detalle)
  } catch (err) {
    console.error('[GET /api/admin/cursos/[id]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// ─── PATCH /api/admin/cursos/[id] — actualizar datos / estado ────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { denied } = await authAdmin()
    if (denied) return denied

    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (body.nombre !== undefined) {
      const nombre = (body.nombre as string).trim()
      if (!nombre) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })
      updates.nombre = nombre
    }
    if (body.nombre_en !== undefined) {
      updates.nombre_en = (body.nombre_en as string | null)?.toString().trim() || ''
    }
    if (body.descripcion !== undefined) {
      updates.descripcion = (body.descripcion as string | null)?.toString().trim() || null
    }
    if (body.descripcion_en !== undefined) {
      updates.descripcion_en = (body.descripcion_en as string | null)?.toString().trim() || ''
    }
    if (body.tipo !== undefined) {
      if (body.tipo !== 'curso' && body.tipo !== 'diplomado') {
        return NextResponse.json({ error: "tipo debe ser 'curso' o 'diplomado'" }, { status: 400 })
      }
      updates.tipo = body.tipo
    }
    if (body.estado !== undefined) {
      if (body.estado !== 'borrador' && body.estado !== 'publicado') {
        return NextResponse.json({ error: "estado debe ser 'borrador' o 'publicado'" }, { status: 400 })
      }
      updates.estado = body.estado
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }
    updates.updated_at = new Date().toISOString()

    const admin = createAdminClient()
    const { data: curso, error } = await admin
      .from('cursos')
      .update(updates)
      .eq('id', params.id)
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '22P02') return NextResponse.json({ error: 'Id de curso inválido' }, { status: 400 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!curso) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 })
    return NextResponse.json(curso)
  } catch (err) {
    console.error('[PATCH /api/admin/cursos/[id]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// ─── DELETE /api/admin/cursos/[id] — borrar curso + objetos del bucket ───────
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
      .single()
    if (!curso) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 })

    // El cascade de la DB borra módulos, lecciones, inscripciones y progreso
    const { error } = await admin.from('cursos').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Limpieza de storage: materiales ({cursoId}/...) y portadas (portadas/{cursoId}/...)
    await removeFolder(admin, params.id)
    await removeFolder(admin, `portadas/${params.id}`)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/cursos/[id]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
