import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import {
  buildDocEstadoUpdates,
  esDocEstado,
  DOC_ESTADOS,
  documentoStoragePath,
} from '@/lib/admin/documentos-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: { alumnoId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const admin = createAdminClient()

    const { data: documentos, error } = await admin
      .from('documentos_alumno')
      .select('*')
      .eq('alumno_id', params.alumnoId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Generar URLs firmadas para cada documento (válidas 24 horas)
    const docs = await Promise.all(
      (documentos ?? []).map(async (doc) => {
        // Definición única compartida con la bandeja global: si las dos rutas
        // construyeran el path por su cuenta y divergieran, una firmaría URLs
        // válidas y la otra 404 sobre el MISMO documento.
        const storagePath = documentoStoragePath(params.alumnoId, doc.tipo, doc.nombre_archivo)
        const { data: signed } = await admin.storage
          .from('documentos')
          // 1 h, igual que la bandeja global. Una signed URL es una capability
          // de portador sobre un acta o una identificacion: 24 h sobrevivia al
          // cierre de sesion, al cambio de contrasena y a la baja de la cuenta.
          .createSignedUrl(storagePath, 3600)
        return { ...doc, signed_url: signed?.signedUrl ?? null }
      })
    )

    // Lleva URLs firmadas a documentos de identidad: fuera de toda cache.
    return NextResponse.json(docs, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { alumnoId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const { documentoId, estado, comentario } = await req.json()
    if (!documentoId || !estado) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    if (!esDocEstado(estado)) {
      return NextResponse.json(
        { error: `Estado inválido. Usa: ${DOC_ESTADOS.join(', ')}` },
        { status: 400 },
      )
    }

    // Un rechazo sin motivo deja al alumno sin saber qué corregir, y a quien
    // revise después sin saber por qué se rechazó.
    const comentarioLimpio =
      typeof comentario === 'string' && comentario.trim() !== '' ? comentario.trim() : null
    if (estado === 'rechazado' && !comentarioLimpio) {
      return NextResponse.json(
        { error: 'Indica el motivo del rechazo para que el alumno sepa qué corregir.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    // .select() para distinguir "no existe / no es de este alumno" de
    // "actualizado": sin él, un id que no casa devuelve éxito y la UI marca como
    // resuelto un documento que no cambió.
    const { data, error } = await admin
      .from('documentos_alumno')
      .update(buildDocEstadoUpdates(estado, comentarioLimpio))
      .eq('id', documentoId)
      .eq('alumno_id', params.alumnoId)
      .select('id')

    if (error) {
      console.error('[PATCH /api/admin/documentos/[alumnoId]]', error.code, error.message)
      return NextResponse.json({ error: 'No se pudo actualizar el documento' }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
