import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * ============================================================================
 * `usuarios.activo` GOBIERNA EL ACCESO — no solo el aspecto de una tabla.
 * ============================================================================
 * La baja de una cuenta en EDVEX es lógica: `DELETE /api/admin/alumnos/[id]`
 * hace `.update({ activo: false })` (admin/alumnos/[id]/route.ts:203-206), no
 * borra la fila. Hasta ahora ningún guard miraba esa columna: seleccionaban
 * solo `rol`. Consecuencia: una cuenta dada de baja seguía pasando todos los
 * controles, y en el caso de un ADMIN podía crear otras cuentas de staff. La
 * única revocación real era borrarla en Auth o rotarle la contraseña.
 *
 * Las tres funciones de este archivo leen ahora `rol, activo` y deniegan si
 * `activo === false`.
 *
 * TRATAMIENTO DE NULL: se deniega solo ante el `false` explícito
 * (`activo === false`), no ante NULL o ausente. La columna es
 * `NOT NULL DEFAULT TRUE` (EDVEX-SUPABASE-SETUP.sql:56), así que NULL no debería
 * existir; si apareciera por una migración futura, la interpretación segura es
 * "no se ha dado de baja" y no "bloquear a todo el mundo". Bloquear por un NULL
 * inesperado convertiría un cambio de esquema en una caída total del panel.
 *
 * PENDIENTE, FUERA DE ESTE ARCHIVO: `src/lib/supabase/middleware.ts:68-74`
 * sigue seleccionando solo `rol`. Un admin inactivo puede cargar el armazón de
 * las páginas `/admin/**`, pero cada llamada a datos le responderá 403. Es un
 * estado degradado, no un agujero: la frontera real de acceso a datos es esta.
 * Ver la nota del PR.
 */

/** Campos mínimos que necesita cualquier verificación de acceso. */
type FilaAcceso = { rol: string | null; activo: boolean | null }

async function leerAcceso(
  supabase: SupabaseClient,
  userId: string
): Promise<{ rol: string | null; bloqueado: boolean } | null> {
  const { data } = await supabase
    .from('usuarios')
    .select('rol, activo')
    .eq('id', userId)
    .single()

  if (!data) return null
  const fila = data as FilaAcceso
  return {
    // Normalizado a MAYÚSCULA: EDVEX ya guarda el rol así, pero una fila escrita
    // a mano en minúscula no debe abrir ni cerrar accesos por accidente.
    rol: fila.rol?.toUpperCase() ?? null,
    bloqueado: fila.activo === false,
  }
}

/**
 * Verifica que el usuario autenticado tiene rol ADMIN y su cuenta está activa.
 * Retorna un NextResponse 403 si no lo es, o null si la verificación pasa.
 */
export async function verifyAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const acceso = await leerAcceso(supabase, userId)

  // Mensaje distinto para la cuenta desactivada: "Acceso denegado. Se requiere
  // rol ADMIN" sobre una cuenta que SÍ es admin manda a depurar el rol, que
  // está bien, en vez de a mirar la baja.
  if (acceso?.bloqueado) {
    return NextResponse.json({ error: 'Esta cuenta está desactivada.' }, { status: 403 })
  }
  if (!acceso || acceso.rol !== 'ADMIN') {
    return NextResponse.json({ error: 'Acceso denegado. Se requiere rol ADMIN.' }, { status: 403 })
  }
  return null
}

/**
 * Verifica que el usuario es staff activo: rol ADMIN o SECRETARIO.
 *
 * SECRETARIO NO EXISTE todavía en EDVEX: el CHECK de `usuarios.rol` solo admite
 * 'ADMIN' y 'ALUMNO', así que hoy por aquí solo pasan admins y este helper se
 * comporta igual que verifyAdmin. Se mantiene para que los endpoints de staff
 * queden marcados como tales desde ahora.
 */
export async function verifyStaff(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const acceso = await leerAcceso(supabase, userId)

  if (acceso?.bloqueado) {
    return NextResponse.json({ error: 'Esta cuenta está desactivada.' }, { status: 403 })
  }
  if (!acceso || (acceso.rol !== 'ADMIN' && acceso.rol !== 'SECRETARIO')) {
    return NextResponse.json(
      { error: 'Acceso denegado. Se requiere rol ADMIN o SECRETARIO.' },
      { status: 403 },
    )
  }
  return null
}

/**
 * Devuelve el rol del usuario normalizado en MAYÚSCULA, o null si no existe
 * O SI LA CUENTA ESTÁ DESACTIVADA.
 *
 * Que una cuenta de baja devuelva null y no su rol es deliberado: quien use
 * esto para decidir qué mostrar debe tratarla como si no tuviera rol. Devolver
 * 'ADMIN' para una cuenta dada de baja sería exactamente el fallo que este
 * cambio corrige, reintroducido por la puerta de atrás.
 */
export async function getRolActual(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const acceso = await leerAcceso(supabase, userId)
  if (!acceso || acceso.bloqueado) return null
  return acceso.rol
}
