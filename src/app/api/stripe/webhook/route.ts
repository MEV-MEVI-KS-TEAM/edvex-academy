/**
 * POST /api/stripe/webhook
 * Recibe eventos de Stripe y aplica el pago en Supabase.
 * Firma verificada con STRIPE_WEBHOOK_SECRET.
 *
 * Todo el trabajo de escritura se delega a la RPC public.aplicar_pago_stripe,
 * que hace INSERT en pagos + UPDATE de alumnos en UNA SOLA transaccion. Este
 * handler no escribe nada por su cuenta: desde un cliente HTTP (service role)
 * cada .from() es su propia transaccion autocommit, y ese es el origen del
 * doble-incremento de meses_desbloqueados.
 *
 * CONTRATO CON LA RPC (congelado, no modificar de un lado solo):
 *   aplicar_pago_stripe(p_alumno_id uuid, p_tipo text, p_monto numeric,
 *                       p_stripe_session_id text, p_modulo_numero integer,
 *                       p_incremento_meses integer) RETURNS jsonb
 *   -> { resultado: 'aplicado'|'duplicado'|'alumno_no_encontrado',
 *        meses_desbloqueados: number|null, modulos_desbloqueados: unknown,
 *        pago_id: string|null }
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import type { PostgrestError } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

/** Forma exacta del jsonb que devuelve public.aplicar_pago_stripe. */
type ResultadoPago = {
  resultado: 'aplicado' | 'duplicado' | 'alumno_no_encontrado'
  meses_desbloqueados: number | null
  modulos_desbloqueados: unknown
  pago_id: string | null
}

/**
 * PostgREST entrega un jsonb escalar como objeto, pero si algun dia la funcion
 * pasara a RETURNS TABLE llegaria como array de un elemento. Se desenvuelve
 * defensivamente para que ese cambio no se traduzca en "respuesta inesperada"
 * en cada pago.
 */
function normalizarResultado(valor: unknown): ResultadoPago | null {
  const v = Array.isArray(valor) ? valor[0] : valor
  if (typeof v !== 'object' || v === null) return null
  const r = v as Record<string, unknown>
  if (r.resultado !== 'aplicado' && r.resultado !== 'duplicado' && r.resultado !== 'alumno_no_encontrado') {
    return null
  }
  return v as ResultadoPago
}

// ── Clasificacion transitorio vs permanente ──────────────────────────────────
// CRITERIO: transitorio = "reintentar PUEDE ayudar". Permanente = "el mismo
// payload fallara igual dentro de 3 dias".
//
// Dos clases enteras son transitorias por definicion del estandar SQL:
//   08 = connection_exception  → la sentencia nunca llego a ejecutarse.
//   40 = transaction_rollback  → serialization_failure / deadlock_detected.
// Del resto no se puede razonar por prefijo (la clase 55 mezcla 55P03
// lock_not_available con errores de configuracion; la 57 mezcla 57014
// query_canceled con admin_shutdown), asi que se enumeran uno a uno.
//
// DECISION REVISADA: los errores de DESPLIEGUE y de SCHEMA CACHE son
// TRANSITORIOS, no permanentes. 42883 (funcion inexistente), 42P01 (tabla),
// 3F000 (esquema), 42501 (permiso) y PGRST202/203/301 significan "el objeto
// todavia no esta ahi / PostgREST aun no lo ve". El remedio (aplicar el .sql,
// corregir un GRANT, esperar al NOTIFY pgrst 'reload schema') cabe de sobra en
// la ventana de 3 dias de Stripe. Clasificarlos permanentes destruia el UNICO
// mecanismo de recuperacion automatica que existe y convertia un despliegue
// desordenado —el modo de fallo mas probable de este PR— en perdida definitiva
// de dinero, a cambio de no llenar el dashboard de Stripe. Trade-off equivocado
// en un camino de cobro.
// XX000 (internal_error) tambien pasa a transitorio: es mas barato reintentar
// que perder el cobro.
const CLASES_SQLSTATE_TRANSITORIAS = ['08', '40'] as const

const CODIGOS_SQLSTATE_TRANSITORIOS: ReadonlySet<string> = new Set([
  '53000', '53100', '53200', '53300', '53400',  // insufficient_resources
  '55006', '55P03',                             // object_in_use, lock_not_available
  '57014',                                      // query_canceled (statement_timeout)
  '57P01', '57P02', '57P03', '57P05',           // shutdown / cannot_connect_now
  '3F000',                                      // invalid_schema_name
  '42P01',                                      // undefined_table
  '42883',                                      // undefined_function  ← despliegue
  '42501',                                      // insufficient_privilege ← GRANT pendiente
  'XX000',                                      // internal_error
  'PGRST000', 'PGRST001', 'PGRST002',           // PostgREST sin conexion / cache no cargado
  'PGRST202', 'PGRST203', 'PGRST301',           // funcion no en cache / ambigua / JWT
])

/** Codigo con el que la BD senala "ya existe" si escapara del ON CONFLICT. */
const SQLSTATE_UNIQUE_VIOLATION = '23505'

function esErrorTransitorio(error: PostgrestError): boolean {
  const code = error.code ?? ''
  // Sin codigo estructurado ⇒ nunca hubo respuesta de PostgREST (DNS, socket,
  // abort, 502 del gateway). supabase-js devuelve { error } con code vacio.
  if (code === '') return true
  if (CLASES_SQLSTATE_TRANSITORIAS.some((clase) => code.startsWith(clase))) return true
  return CODIGOS_SQLSTATE_TRANSITORIOS.has(code)
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET no configurado')
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 })
  }

  let event: Stripe.Event
  const body = await req.text()
  const signature = req.headers.get('stripe-signature') || ''

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    // Unico 4xx que se conserva: firma invalida. No es un pago nuestro.
    const message = err instanceof Error ? err.message : 'Firma invalida'
    console.error('[Stripe Webhook]', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // async_payment_succeeded es el evento con el que Stripe notifica la
  // liquidacion de un metodo asincrono (OXXO, SEPA, boleto). Hoy es inalcanzable
  // porque checkout/route.ts:81 fija payment_method_types: ['card'], pero
  // anadirlo ahora cuesta una linea y evita que el dia que se habilite otro
  // metodo el pago se cobre y no se aplique nunca. La RPC es idempotente por
  // stripe_session_id, asi que procesar ambos eventos es seguro.
  if (event.type !== 'checkout.session.completed' &&
      event.type !== 'checkout.session.async_payment_succeeded') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session

  // 'no_payment_required' es el cupon del 100%: es un cobro valido de 0 USD.
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    console.warn(
      `[Stripe Webhook] Sesion ${session.id} descartada con payment_status=${session.payment_status}. ` +
      `Si se habilito un metodo de pago asincrono, verificar que llega el evento ` +
      `checkout.session.async_payment_succeeded (ya manejado).`
    )
    return NextResponse.json({ received: true })
  }

  const { alumnoId, moduloNumero, priceId } = session.metadata || {}

  if (!alumnoId || !RE_UUID.test(alumnoId)) {
    // PERMANENTE: la metadata la escribe nuestro propio /api/stripe/checkout y
    // ya esta congelada en el evento. Ningun reintento la va a corregir.
    // 200 a proposito: un 4xx/5xx aqui provoca 3 dias de reintentos inutiles.
    console.error(
      `[Stripe Webhook] PERMANENTE — metadata.alumnoId ausente o no es UUID: ${alumnoId ?? '(ausente)'} ` +
      `(session ${session.id}). Aplicar el pago a mano desde el panel admin.`
    )
    return NextResponse.json({ received: true })
  }

  // Sin el "!": process.env.X es string | undefined bajo strict. Si la variable
  // falta, `priceId === undefined` podia dar acelerado=true (+2 meses regalados)
  // o, con priceId presente, acelerado=false siempre (acelerado cobrado, +1 mes
  // aplicado). Ambos silenciosos. Se trata como fallo de configuracion → 500
  // para que Stripe reintente cuando se corrija el entorno.
  const PRICE_MODULO_ACELERADO = process.env.STRIPE_PRICE_MODULO_ACELERADO
  if (!PRICE_MODULO_ACELERADO) {
    console.error('[Stripe Webhook] TRANSITORIO — STRIPE_PRICE_MODULO_ACELERADO no configurado')
    return NextResponse.json({ error: 'Config incompleta' }, { status: 500 })
  }

  // Sin fallbacks inventados: si Stripe no manda amount_total, el importe real
  // es 0. Grabar 50.00 o 450.00 "por si acaso" metia datos falsos en la
  // contabilidad (reportes/route.ts:51 los sumaba como ingreso real).
  const monto = (session.amount_total ?? 0) / 100
  if (session.amount_total === null) {
    console.warn(`[Stripe Webhook] amount_total null en session ${session.id}; se registra monto 0`)
  }

  let tipo: 'inscripcion' | 'certificacion' | 'modulo'
  let numeroModulo: number | null = null
  let incrementoMeses: number | null = null
  let descripcion: string

  if (moduloNumero === 'inscripcion') {
    // Marca como pagada + salir de demo. NO desbloquea meses: el alumno debe
    // comprar su primer modulo para abrir Mes 1. TUT101 sigue siendo gratis.
    tipo = 'inscripcion'
    descripcion = 'Inscripción'
  } else if (moduloNumero === 'certificacion') {
    tipo = 'certificacion'
    descripcion = 'Certificación'
  } else {
    const acelerado = priceId === PRICE_MODULO_ACELERADO
    const num = parseInt(moduloNumero ?? '', 10)

    if (Number.isNaN(num) || num < 1 || num > 6) {
      console.error(
        `[Stripe Webhook] PERMANENTE — moduloNumero invalido o fuera de rango (1-6): ${moduloNumero} ` +
        `(session ${session.id}, alumno ${alumnoId}). Aplicar a mano.`
      )
      return NextResponse.json({ received: true })
    }

    tipo = 'modulo'
    numeroModulo = num
    incrementoMeses = acelerado ? 2 : 1
    descripcion = `Módulo ${num} (${acelerado ? 'acelerado' : 'estándar'})`
  }

  // ── Aplicacion transaccional ───────────────────────────────────────────────
  // Se elimino el SELECT previo de idempotencia contra pagos.stripe_session_id:
  // era un check-then-act sin lock (2-4 round-trips HTTP entre la lectura y la
  // escritura) y ademas fail-open, porque descartaba su propio { error } y un
  // SELECT fallido se leia como "no procesado". El ON CONFLICT DO NOTHING de la
  // RPC resuelve check y act en la MISMA sentencia y la MISMA transaccion que el
  // UPDATE de alumnos. No hay ventana.
  //
  // El concepto NO se manda: lo deriva la RPC, para que el vocabulario no pueda
  // divergir entre este webhook y la captura manual del PR 3.
  const supabase = createAdminClient()

  let data: unknown
  let error: PostgrestError | null

  try {
    ;({ data, error } = await supabase.rpc('aplicar_pago_stripe', {
      p_alumno_id:         alumnoId,
      p_tipo:              tipo,
      p_monto:             monto,
      p_stripe_session_id: session.id,
      p_modulo_numero:     numeroModulo,
      p_incremento_meses:  incrementoMeses,
    }))
  } catch (err) {
    // supabase-js normalmente no lanza, pero un abort/timeout del fetch puede
    // escapar. Siempre transitorio: nunca supimos si la transaccion se aplico,
    // y la RPC es idempotente, asi que reintentar es seguro.
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Stripe Webhook] TRANSITORIO (excepcion de transporte) — session ${session.id}: ${message}`)
    return NextResponse.json({ error: 'Error transitorio, reintentar' }, { status: 500 })
  }

  if (error) {
    if (error.code === SQLSTATE_UNIQUE_VIOLATION) {
      // Red de seguridad: la RPC lo absorbe con ON CONFLICT, pero si escapa
      // significa exactamente "este evento ya se proceso, comprobado por la BD".
      console.log(`[Stripe Webhook] Evento ya procesado (session ${session.id}), ignorando`)
      return NextResponse.json({ received: true })
    }

    if (esErrorTransitorio(error)) {
      console.error(
        `[Stripe Webhook] TRANSITORIO [${error.code}] — session ${session.id}, alumno ${alumnoId}: ${error.message}`
      )
      return NextResponse.json({ error: 'Error transitorio, reintentar' }, { status: 500 })
    }

    // PERMANENTE: solo lo que depende del payload (22023 validaciones de la RPC,
    // 22P02 uuid invalido, 23502/23503/23514 constraints). 200 a proposito: un
    // 500 haria que Stripe reintentara 3 dias sobre un error que no se resuelve
    // solo. El log es la senal de accion.
    console.error(
      `[Stripe Webhook] PERMANENTE [${error.code}] — session ${session.id}, alumno ${alumnoId}, ` +
      `concepto "${descripcion}", monto ${monto} USD. ${error.message}` +
      `${error.details ? ` | ${error.details}` : ''}${error.hint ? ` | hint: ${error.hint}` : ''} ` +
      `— NO se reintentara; aplicar el pago a mano desde el panel admin.`
    )
    return NextResponse.json({ received: true })
  }

  const resultado = normalizarResultado(data)

  if (!resultado) {
    // Desajuste de contrato TS↔SQL: permanente por definicion.
    console.error(
      `[Stripe Webhook] PERMANENTE — respuesta inesperada de aplicar_pago_stripe ` +
      `(session ${session.id}): ${JSON.stringify(data)}`
    )
    return NextResponse.json({ received: true })
  }

  if (resultado.resultado === 'duplicado') {
    console.log(`[Stripe Webhook] Evento ya procesado (session ${session.id}), ignorando`)
    return NextResponse.json({ received: true })
  }

  if (resultado.resultado === 'alumno_no_encontrado') {
    // La RPC lo devuelve como estado de negocio, sin excepcion y sin escribir
    // nada, para que el stripe_session_id NO quede quemado: si el alumno se crea
    // despues, un reenvio manual del evento SI podra aplicarse.
    console.error(
      `[Stripe Webhook] PERMANENTE — alumno ${alumnoId} no existe (session ${session.id}, ` +
      `concepto "${descripcion}", monto ${monto} USD). NO se registro ningun pago. ` +
      `Crear el alumno y reenviar el evento desde el dashboard de Stripe.`
    )
    return NextResponse.json({ received: true })
  }

  if (tipo === 'inscripcion') {
    console.log(`[Stripe Webhook] Inscripción pagada — alumno ${alumnoId} (meses_desbloqueados sin cambio)`)
  } else if (tipo === 'certificacion') {
    console.log(`[Stripe Webhook] Certificación pagada — alumno ${alumnoId} → certificacion_pagada = true`)
  } else {
    console.log(
      `[Stripe Webhook] Módulo ${numeroModulo} pagado ` +
      `(${incrementoMeses === 2 ? 'acelerado +2' : 'estándar +1'}) — alumno ${alumnoId} ` +
      `→ meses_desbloqueados = ${resultado.meses_desbloqueados}`
    )
  }

  return NextResponse.json({ received: true })
}
