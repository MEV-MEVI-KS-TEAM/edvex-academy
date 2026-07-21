import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyStaff } from '@/lib/supabase/verify-admin'
import { filtroEsDemo, ES_SHOWROOM } from '@/lib/reportes/rpc'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/pagos — historial de pagos. SOLO LECTURA.
 *
 * NO EXISTE UN POST AQUÍ, Y ES DELIBERADO.
 * Plantilla sí tiene POST /api/admin/pagos, que hace un INSERT directo en
 * `pagos`. Portarlo a EDVEX crearía un SEGUNDO camino de captura junto al que ya
 * existe (`/api/admin/alumnos/[id]/desbloquear-mes` → RPC `desbloquear_mes`), y
 * ese segundo camino no incrementaría `meses_desbloqueados` ni respetaría el
 * tope del plan. El resultado sería justo el doble conteo de `total_pagado` que
 * se cerró al unificar la captura.
 *
 * La captura vive en la ficha del alumno. Esta pantalla es el libro mayor.
 *
 * Guard: verifyStaff. Es la misma información que el staff ya ve alumno por
 * alumno, solo agregada. Los ingresos GLOBALES (que sí son de dirección) siguen
 * en /api/admin/reportes con verifyAdmin.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyStaff(supabase, user.id)
    if (denied) return denied

    const admin = createAdminClient()

    // Se lee de la vista clasificada, no de `pagos`: así la categoría y la marca
    // de demo las decide la BD y no una condición duplicada en TypeScript. Es la
    // misma fuente que alimenta /api/admin/reportes, de modo que el historial y
    // los totales no pueden discrepar.
    const filtro = filtroEsDemo()
    let q = admin
      .from('v_pagos_clasificados')
      .select('id, alumno_id, monto, concepto, categoria, metodo_pago, referencia, mes_desbloqueado, meses_cubiertos, stripe_session_id, registrado_por, fecha_pago, created_at, es_demo', { count: 'exact' })
      .order('fecha_pago', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (filtro === false) q = q.eq('es_demo', false)

    const { data, error, count } = await q

    if (error) {
      console.error('[GET /api/admin/pagos]', error.code, error.message)
      return NextResponse.json(
        { error: 'No se pudo cargar el historial de pagos. ¿Está aplicada la migración de control escolar?' },
        { status: 500 },
      )
    }

    type PagoR = {
      id: string
      alumno_id: string
      monto: string | number
      concepto: string | null
      categoria: string
      metodo_pago: string
      referencia: string | null
      mes_desbloqueado: number | null
      meses_cubiertos: number | null
      stripe_session_id: string | null
      registrado_por: string | null
      fecha_pago: string
      created_at: string
      es_demo: boolean
    }
    const pagos = (data ?? []) as unknown as PagoR[]

    // Nombre del alumno. El puente es alumnos.usuario_id → usuarios.id:
    // pagos.alumno_id referencia alumnos.id, que NO es el id de usuarios.
    const alumnoIds = [...new Set(pagos.map(p => p.alumno_id).filter(Boolean))]
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

    const result = pagos.map(p => ({
      id: p.id,
      alumno_id: p.alumno_id,
      alumno_nombre: nombrePorAlumno.get(p.alumno_id) ?? '—',
      alumno_matricula: matriculaPorAlumno.get(p.alumno_id) ?? null,
      // PostgREST serializa NUMERIC como string para no perder precisión.
      monto: Number(p.monto ?? 0),
      concepto: p.concepto,
      categoria: p.categoria,
      metodo_pago: p.metodo_pago,
      referencia: p.referencia,
      mes_desbloqueado: p.mes_desbloqueado,
      meses_cubiertos: p.meses_cubiertos,
      // Solo el booleano: el id de sesión de Stripe no aporta nada en pantalla y
      // es un identificador de un sistema de cobro externo.
      es_stripe: Boolean(p.stripe_session_id),
      es_manual: Boolean(p.registrado_por),
      fecha_pago: p.fecha_pago,
      created_at: p.created_at,
      es_demo: p.es_demo,
    }))

    // `total` y `truncado` para que la UI no presente una consulta topada como
    // si fuera la caja completa: el cron demo siembra pagos a diario, así que el
    // límite se alcanza solo con el tiempo.
    const total = count ?? result.length
    return NextResponse.json(
      { pagos: result, total, truncado: total > result.length, es_showroom: ES_SHOWROOM },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[GET /api/admin/pagos]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
