/**
 * Selector de variante de las RPC de reportes y estado de cuenta.
 *
 * ============================================================================
 * POR QUE EXISTE ESTA BIFURCACION
 * ============================================================================
 * EDVEX Academy es un SHOWROOM de ventas: por diseño no tiene ni tendra alumnos
 * reales. Los 2 jobs pg_cron (`generar_pagos_demo_diario`,
 * `registrar_alumnos_demo_semanal`) siembran el 100% del padron y de los pagos.
 *
 * Las funciones OFICIALES (`estado_cuenta_alumnos`, `reporte_ingresos_*`)
 * excluyen las filas demo a proposito: son las que se clonan a clientes REALES,
 * donde el dinero de siembra no puede contaminar la caja. Correcto alli,
 * inservible aqui: en EDVEX dejarian todos los reportes en $0 y el showroom
 * mostraria una plataforma vacia justo en la demo de ventas.
 *
 * Por eso conviven dos juegos con SHAPE IDENTICO:
 *   - `<nombre>`        → excluye demo. Clientes reales (plantilla-maestra).
 *   - `<nombre>_demo`   → incluye demo. EDVEX.
 *
 * El MISMO codigo de app sirve para ambos; solo cambia el sufijo que resuelve
 * este modulo. Cuando esto se porte a plantilla-maestra, basta con NO definir
 * la variable de entorno.
 *
 * ============================================================================
 * POR QUE FALLA RUIDOSO Y NO SILENCIOSO
 * ============================================================================
 * Si el flag se activa en un cliente real que no tiene las `_demo`, PostgREST
 * responde `PGRST202` (function not found) y el endpoint devuelve 500. Es
 * DELIBERADO: la alternativa —caer al nombre oficial— produciria reportes
 * plausibles pero con el criterio contrario al configurado, y nadie lo notaria.
 * Un 500 se investiga; un numero equivocado se cobra.
 *
 * ============================================================================
 * POR QUE NEXT_PUBLIC_
 * ============================================================================
 * Estas RPC solo se invocan desde el servidor (route handlers con service role),
 * asi que una variable privada bastaria. Se usa `NEXT_PUBLIC_` para que la UI
 * pueda ademas rotular el panel como "datos de demostracion": en un showroom,
 * que el espectador sepa que los numeros son sembrados es una caracteristica,
 * no una fuga. No contiene ningun secreto: es un booleano de configuracion.
 */

/** `true` cuando esta instancia es un showroom y sus reportes deben incluir demo. */
export const ES_SHOWROOM = process.env.NEXT_PUBLIC_SHOWROOM === 'true'

/** Nombres base de las RPC que tienen variante `_demo`. */
export type RpcReporte =
  | 'estado_cuenta_alumnos'
  | 'reporte_ingresos_semanales'
  | 'reporte_ingresos_mensuales'

/**
 * Devuelve el nombre de RPC a invocar segun el modo de la instancia.
 *
 *   rpcReporte('reporte_ingresos_semanales')
 *     → 'reporte_ingresos_semanales_demo'  en EDVEX
 *     → 'reporte_ingresos_semanales'       en un cliente real
 */
export function rpcReporte(nombre: RpcReporte): string {
  return ES_SHOWROOM ? `${nombre}_demo` : nombre
}

/**
 * Predicado equivalente para filtrar en SQL/consultas sobre
 * `v_pagos_clasificados`, que expone `es_demo`.
 *
 * `null` = no filtrar (showroom: entran todas las filas).
 * `false` = solo pagos no-demo (cliente real).
 *
 * Se expone como funcion y no como constante para que el criterio de "que
 * cuenta como ingreso" viva en UN solo sitio junto al de las RPC. Si un dia
 * divergen, los KPI y las series de la misma pantalla mostrarian cifras
 * distintas — exactamente el fallo que esta bifurcacion pretende evitar.
 */
export function filtroEsDemo(): false | null {
  return ES_SHOWROOM ? null : false
}
