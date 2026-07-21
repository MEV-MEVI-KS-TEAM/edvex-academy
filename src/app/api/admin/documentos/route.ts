import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import {
  mapDocumentoAlumnoRow,
  documentoStoragePath,
  EXTENSIONES_FALLBACK,
} from '@/lib/admin/documentos-admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/documentos
 *
 * Bandeja GLOBAL de documentos de todos los alumnos, para revisarlos en lote.
 * Complementa —no sustituye— a `/api/admin/documentos/[alumnoId]`, que sirve la
 * pestaña de documentos dentro de la ficha de un alumno. Ambas comparten la
 * convención de path vía `documentoStoragePath`.
 *
 * El bucket `documentos` es privado, así que cada fila se acompaña de una URL
 * firmada generada con service role.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const admin = createAdminClient()

    // Ordenado por subido_en: es la única columna de fecha de alta que existe en
    // EDVEX (plantilla reintenta con `fecha_subida` por su esquema legacy; aquí
    // ese fallback sería código muerto).
    const { data, error } = await admin
      .from('documentos_alumno')
      .select('*')
      .order('subido_en', { ascending: false })
      .limit(500)

    if (error) {
      console.error('[GET /api/admin/documentos]', error.code, error.message)
      return NextResponse.json({ error: 'No se pudieron cargar los documentos' }, { status: 500 })
    }

    const docs = (data ?? []).map(r => mapDocumentoAlumnoRow(r as Record<string, unknown>))

    // Nombre del alumno. EDVEX guarda nombre_completo en una sola columna
    // (plantilla usa nombre + apellidos, que aquí NO existen). El puente es
    // alumnos.usuario_id → usuarios.id: documentos_alumno.alumno_id referencia
    // alumnos.id, que NO es auth.uid() ni el id de usuarios.
    const alumnoIds = [...new Set(docs.map(d => d.alumno_id).filter(Boolean))]
    const nombrePorAlumno = new Map<string, string>()
    const matriculaPorAlumno = new Map<string, string>()

    if (alumnoIds.length > 0) {
      const { data: alumnos } = await admin
        .from('alumnos')
        .select('id, matricula, usuarios(nombre_completo)')
        .in('id', alumnoIds)

      type AlumnoR = { id: string; matricula: string | null; usuarios: { nombre_completo: string } | null }
      for (const a of ((alumnos ?? []) as unknown as AlumnoR[])) {
        if (a.usuarios?.nombre_completo) nombrePorAlumno.set(a.id, a.usuarios.nombre_completo)
        if (a.matricula) matriculaPorAlumno.set(a.id, a.matricula)
      }
    }

    // Firmado en paralelo. 1 h de validez: suficiente para revisar y lo bastante
    // corto para que un enlace reenviado caduque pronto.
    const result = await Promise.all(
      docs.map(async doc => {
        const firmar = async (p: string): Promise<string | null> => {
          const { data: s } = await admin.storage.from('documentos').createSignedUrl(p, 3600)
          return s?.signedUrl ?? null
        }

        let signed = await firmar(documentoStoragePath(doc.alumno_id, doc.tipo, doc.nombre_archivo))
        if (!signed) {
          // `nombre_archivo` no siempre refleja la extensión real en Storage
          // (subidas viejas, renombrados). Se prueban las habituales antes de
          // rendirse: mejor un intento extra que un botón "Ver" que no abre.
          for (const ext of EXTENSIONES_FALLBACK) {
            signed = await firmar(`${doc.alumno_id}/${doc.tipo}.${ext}`)
            if (signed) break
          }
        }

        return {
          ...doc,
          // Sin fallback a doc.url: el bucket es PRIVADO, asi que la URL
          // publica que guarda la columna devuelve un JSON de error al abrirla.
          // Servirla haria inalcanzable el estado "sin archivo" de la UI y el
          // admin veria un boton "Ver" que abre un error de Supabase.
          signed_url: signed,
          alumno_nombre: nombrePorAlumno.get(doc.alumno_id) ?? '—',
          alumno_matricula: matriculaPorAlumno.get(doc.alumno_id) ?? null,
        }
      })
    )

    // El payload lleva nombre, matrícula y enlaces firmados a documentos de
    // identidad: no debe quedar en ninguna caché intermedia.
    return NextResponse.json(
      { documentos: result },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[GET /api/admin/documentos]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
