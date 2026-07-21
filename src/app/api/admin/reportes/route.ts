import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'
import { rpcReporte, filtroEsDemo, ES_SHOWROOM } from '@/lib/reportes/rpc'

// Lee cookies de sesion: nunca puede prerenderizarse. Declararlo evita que Next
// intente el render estatico en build, falle con DynamicServerError y lo capture
// el catch de abajo, ensuciando el log de build con un "Error inesperado" que no
// lo es. El comportamiento en runtime no cambia: la ruta ya era dinamica.
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/reportes
 *
 * Guard: verifyAdmin (NO staff). Los ingresos globales no son del secretario.
 *
 * Las series de ingresos vienen de las RPC del PR 1 (agregacion en SQL con
 * rejilla America/Mexico_City). Antes se agregaban en JavaScript sobre TODAS las
 * filas de `pagos` traidas a memoria, usando la zona del servidor Node — UTC en
 * Vercel — asi que los cortes de semana y de mes caian 6 h antes de lo que
 * secretaria espera.
 *
 * Los KPI de dinero se leen de `v_pagos_clasificados` y NO de `pagos`, para que
 * la marca de demo la decida la BD (`es_demo`) y no una condicion duplicada
 * aqui. Si el criterio viviera en dos sitios, la tarjeta "Ingresos Totales" y la
 * grafica de la misma pantalla acabarian mostrando cifras distintas.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    // Service role para todas las queries de datos (bypass RLS)
    const admin = createAdminClient()

    // Total alumnos
    const { count: totalAlumnos } = await admin
      .from('alumnos')
      .select('*', { count: 'exact', head: true })

    // Alumnos activos (join con usuarios)
    const { data: alumnosData } = await admin
      .from('alumnos')
      .select('meses_desbloqueados, contactado_whatsapp, created_at, usuarios(activo)')

    type AlumnoR = { meses_desbloqueados: number; contactado_whatsapp: boolean; created_at: string; usuarios: { activo: boolean } | null }
    const alumnosList = (alumnosData ?? []) as unknown as AlumnoR[]
    const alumnosActivos = alumnosList.filter(a => a.usuarios?.activo !== false).length
    const promMeses = alumnosList.length > 0
      ? alumnosList.reduce((s, a) => s + (a.meses_desbloqueados ?? 0), 0) / alumnosList.length
      : 0

    // Alumnos pendientes de contactar (activos + no contactados por WhatsApp)
    const pendientesContactar = alumnosList.filter(
      a => a.usuarios?.activo !== false && !a.contactado_whatsapp
    ).length

    // Alumnos nuevos esta semana
    const hace7dias = new Date()
    hace7dias.setDate(hace7dias.getDate() - 7)
    const alumnosNuevosSemana = alumnosList.filter(
      a => new Date(a.created_at) >= hace7dias
    ).length

    // ── Dinero ────────────────────────────────────────────────────────────────
    // Desde la vista clasificada. `monto` llega como STRING (PostgREST serializa
    // NUMERIC asi para no perder precision): sumar sin Number() concatenaria.
    const filtro = filtroEsDemo()
    let qPagos = admin
      .from('v_pagos_clasificados')
      .select('id, alumno_id, monto, metodo_pago, concepto, categoria, fecha_pago, created_at, es_demo')
    if (filtro === false) qPagos = qPagos.eq('es_demo', false)

    const { data: pagosData, error: errPagos } = await qPagos
    if (errPagos) {
      // La vista es del PR 1. Si falta, es un despliegue adelantado a su SQL:
      // conviene verlo, no degradarlo a ceros que parecen datos.
      console.error('[Reportes] v_pagos_clasificados no disponible', errPagos)
      return NextResponse.json(
        { error: 'Reportes no disponibles: falta aplicar la migración de control escolar' },
        { status: 503 },
      )
    }

    type PagoR = {
      id: string
      alumno_id: string
      monto: string | number
      metodo_pago: string
      concepto: string | null
      categoria: string
      fecha_pago: string
      created_at: string
      es_demo: boolean
    }
    const pagosList = (pagosData ?? []) as unknown as PagoR[]
    const totalIngresos = pagosList.reduce((s, p) => s + Number(p.monto ?? 0), 0)

    // ── Series de ingresos (agregadas en SQL) ────────────────────────────────
    // En paralelo: son independientes entre si y de todo lo anterior.
    const [resSemanas, resMeses] = await Promise.all([
      admin.rpc(rpcReporte('reporte_ingresos_semanales'), { num_semanas: 8 }),
      admin.rpc(rpcReporte('reporte_ingresos_mensuales'), { num_meses: 6 }),
    ])

    type SemanaR = { semana_inicio: string; total: string | number }
    type MesR = { mes: string; total: string | number }

    // Degradacion a [] y no a 503: las series son un anadido de esta pantalla.
    // Si fallan, el resto del reporte (alumnos, materias, pagos recientes) sigue
    // siendo util y es preferible mostrarlo que fundir la pagina entera.
    if (resSemanas.error) console.error('[Reportes] reporte_ingresos_semanales', resSemanas.error)
    if (resMeses.error) console.error('[Reportes] reporte_ingresos_mensuales', resMeses.error)

    const ingresosSemanales = ((resSemanas.data ?? []) as SemanaR[]).map(s => ({
      semana_inicio: s.semana_inicio,
      total: Number(s.total ?? 0),
    }))
    const ingresosMensuales = ((resMeses.data ?? []) as MesR[]).map(m => ({
      mes: m.mes,
      total: Number(m.total ?? 0),
    }))

    // `ingresos_mes` sale del ULTIMO punto de la serie mensual, no de un calculo
    // JS paralelo: la RPC ya devuelve el mes en curso como ultima fila, con la
    // misma rejilla horaria que la grafica. Calcularlo aparte reintroduciria la
    // discrepancia "la tarjeta dice X y la barra dice Y" ante un pago retroactivo
    // (fecha_pago editable, Bug 57 de plantilla).
    // Fallback: si la serie no vino, se calcula sobre fecha_pago para no mostrar
    // 0 cuando si hay ingresos.
    const ingresosMes = ingresosMensuales.length > 0
      ? ingresosMensuales[ingresosMensuales.length - 1].total
      : (() => {
          const ahora = new Date()
          const prefijo = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
          return pagosList
            .filter(p => (p.fecha_pago ?? '').startsWith(prefijo))
            .reduce((s, p) => s + Number(p.monto ?? 0), 0)
        })()

    // ── Pagos recientes ──────────────────────────────────────────────────────
    // La vista no expone el nombre del alumno y no conviene fiarse del embedding
    // de PostgREST sobre una vista, asi que el nombre se resuelve en una segunda
    // consulta acotada a los alumnos implicados.
    const recientes = [...pagosList]
      .sort((a, b) => {
        const fa = a.fecha_pago ?? a.created_at
        const fb = b.fecha_pago ?? b.created_at
        if (fa !== fb) return fb.localeCompare(fa)
        // Desempate por created_at: dos pagos del mismo dia (fecha_pago es DATE)
        // deben salir en orden de captura, no arbitrario.
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      .slice(0, 20)

    const nombrePorAlumno = new Map<string, string>()
    if (recientes.length > 0) {
      const ids = Array.from(new Set(recientes.map(p => p.alumno_id)))
      const { data: alumnosNombre } = await admin
        .from('alumnos')
        .select('id, usuarios(nombre_completo)')
        .in('id', ids)
      type AlumnoNombreR = { id: string; usuarios: { nombre_completo: string } | null }
      for (const a of ((alumnosNombre ?? []) as unknown as AlumnoNombreR[])) {
        if (a.usuarios?.nombre_completo) nombrePorAlumno.set(a.id, a.usuarios.nombre_completo)
      }
    }

    const pagosRecientes = recientes.map(p => ({
      alumno: nombrePorAlumno.get(p.alumno_id) ?? '—',
      monto: Number(p.monto ?? 0),
      metodo_pago: p.metodo_pago,
      concepto: p.concepto,
      categoria: p.categoria,
      fecha_pago: p.fecha_pago,
      created_at: p.created_at,
    }))

    // Rendimiento por materia
    const { data: califs } = await admin
      .from('calificaciones')
      .select('materia_id, aprobada, materias(codigo, nombre)')

    type CalifR = { materia_id: string; aprobada: boolean; materias: { codigo: string; nombre: string } | null }
    const califsList = (califs ?? []) as unknown as CalifR[]

    const materiaMap = new Map<string, { codigo: string; nombre: string; aprobados: number; reprobados: number }>()
    for (const c of califsList) {
      if (!c.materia_id) continue
      if (!materiaMap.has(c.materia_id)) {
        materiaMap.set(c.materia_id, {
          codigo: c.materias?.codigo ?? '',
          nombre: c.materias?.nombre ?? '',
          aprobados: 0,
          reprobados: 0,
        })
      }
      const entry = materiaMap.get(c.materia_id)!
      if (c.aprobada) entry.aprobados++
      else entry.reprobados++
    }

    const rendimientoMaterias = Array.from(materiaMap.entries()).map(([id, v]) => {
      const total = v.aprobados + v.reprobados
      return {
        materia_id: id,
        codigo: v.codigo,
        nombre: v.nombre,
        total_cursaron: total,
        aprobados: v.aprobados,
        reprobados: v.reprobados,
        porcentaje_aprobacion: total > 0 ? Math.round((v.aprobados / total) * 100) : 0,
      }
    }).sort((a, b) => b.total_cursaron - a.total_cursaron)

    return NextResponse.json({
      stats: {
        total_alumnos: totalAlumnos ?? 0,
        alumnos_activos: alumnosActivos,
        total_ingresos: totalIngresos,
        ingresos_mes: ingresosMes,
        promedio_meses: Math.round(promMeses * 10) / 10,
        pendientes_contactar: pendientesContactar,
        alumnos_nuevos_semana: alumnosNuevosSemana,
      },
      ingresos_semanales: ingresosSemanales,
      ingresos_mensuales: ingresosMensuales,
      rendimiento_materias: rendimientoMaterias,
      pagos_recientes: pagosRecientes,
      // Permite a la UI rotular la pantalla como datos de demostracion.
      es_showroom: ES_SHOWROOM,
    })
  } catch (err) {
    console.error('[Reportes] Error inesperado', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
