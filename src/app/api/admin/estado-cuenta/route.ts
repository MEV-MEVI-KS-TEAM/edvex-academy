import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { rpcReporte, ES_SHOWROOM } from '@/lib/reportes/rpc'

// Lee cookies de sesion: nunca puede prerenderizarse.
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/estado-cuenta
 *
 * Situacion de pagos de los alumnos activos, agregada en SQL
 * (`estado_cuenta_alumnos`). Guard: verifyAdmin — EDVEX no tiene rol
 * SECRETARIO todavia; cuando exista, esta ruta es candidata a verifyStaff.
 *
 * NOTA DE REDACCION (heredada de plantilla y deliberada): esta pantalla
 * reporta HECHOS, no conclusiones financieras. "Meses sin pago registrado"
 * significa que no hay un pago de mensualidad capturado para esos meses —
 * puede ser un pago no capturado, una cortesia o un error de captura. El
 * sistema no puede distinguirlos, asi que la UI presenta el dato sin
 * interpretarlo y sin llamar moroso a nadie.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    // Service role: la funcion tiene EXECUTE revocado a anon/authenticated
    // (fix 8f18ccc portado de plantilla), asi que solo service_role la ve.
    const admin = createAdminClient()

    // El nombre lo resuelve rpcReporte: en EDVEX (showroom) apunta a la
    // variante _demo, que INCLUYE las filas sembradas por los jobs pg_cron;
    // en un cliente real apunta a la oficial, que las excluye. Sin esto, el
    // showroom mostraria una tabla vacia porque su padron es 100% demo.
    const { data, error } = await admin.rpc(rpcReporte('estado_cuenta_alumnos'))

    if (error) {
      console.error('[GET /api/admin/estado-cuenta] rpc:', error.code, error.message, error)

      // Se ramifica por codigo. Un mensaje unico del tipo "¿está aplicada la
      // migración?" solo es cierto para PGRST202; ante un permiso mal
      // configurado o un timeout mandaria al admin a re-ejecutar SQL en
      // produccion para diagnosticar un problema que no es ese.
      const detalle =
        error.code === 'PGRST202'
          ? (ES_SHOWROOM
              ? 'Falta la función estado_cuenta_alumnos_demo en la base de datos.'
              : 'Falta aplicar la migración de control escolar.')
          : error.code === '42501'
            ? 'La aplicación no tiene permiso para ejecutar el reporte (revisa SUPABASE_SERVICE_ROLE_KEY).'
            : 'Inténtalo de nuevo; si persiste, revisa los logs del servidor.'

      return NextResponse.json(
        { error: `No se pudo calcular el estado de cuenta. ${detalle}` },
        { status: 500 },
      )
    }

    /** Shape exacto que devuelve la funcion SQL. */
    type Row = {
      alumno_id: string
      usuario_id: string
      nombre_completo: string | null
      email: string | null
      matricula: string | null
      plan_nombre: string | null
      plan_duracion_meses: number | null
      meses_desbloqueados: number | null
      meses_con_pago: number | null
      meses_sin_pago_registrado: number | null
      meses_pagados_de_mas: number | null
      inscripcion_pagada: boolean
      inscripcion_con_pago_registrado: boolean
      certificacion_pagada: boolean
      total_pagado: string | number | null
      fecha_ultimo_pago: string | null
      activo: boolean
    }

    const alumnos = ((data ?? []) as Row[]).map(r => ({
      id: r.alumno_id,
      nombre_completo: r.nombre_completo ?? '—',
      email: r.email ?? '—',
      matricula: r.matricula ?? null,
      // NULL a proposito, NO '—': la UI lo distingue como incidencia de alta
      // ("Sin plan") en vez de como dato ausente sin importancia.
      plan_nombre: r.plan_nombre ?? null,
      plan_duracion_meses: r.plan_duracion_meses ?? null,
      meses_desbloqueados: r.meses_desbloqueados ?? 0,
      meses_con_pago: r.meses_con_pago ?? 0,
      meses_sin_pago_registrado: r.meses_sin_pago_registrado ?? 0,
      meses_pagados_de_mas: r.meses_pagados_de_mas ?? 0,
      inscripcion_pagada: Boolean(r.inscripcion_pagada),
      inscripcion_con_pago_registrado: Boolean(r.inscripcion_con_pago_registrado),
      certificacion_pagada: Boolean(r.certificacion_pagada),
      // PostgREST serializa NUMERIC como string para no perder precision.
      // Convertir aqui evita que una suma mas adentro concatene en vez de sumar.
      total_pagado: Number(r.total_pagado ?? 0),
      fecha_ultimo_pago: r.fecha_ultimo_pago ?? null,
      activo: Boolean(r.activo),
    }))

    // El payload lleva PII de todo el padrón (nombre, email, matrícula e
    // historial de importes) en un GET sin parámetros. No conviene depender del
    // default del host para que no acabe en una caché intermedia ni en el disco
    // del navegador de un equipo compartido.
    return NextResponse.json(
      { alumnos, es_showroom: ES_SHOWROOM },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[GET /api/admin/estado-cuenta]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
