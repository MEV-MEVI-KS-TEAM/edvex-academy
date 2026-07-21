import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Verifica que el usuario autenticado tiene rol ADMIN.
 * Retorna un NextResponse 403 si no lo es, o null si la verificación pasa.
 */
export async function verifyAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userId)
    .single()

  if (!usuario || (usuario.rol as string | undefined)?.toUpperCase() !== 'ADMIN') {
    return NextResponse.json({ error: 'Acceso denegado. Se requiere rol ADMIN.' }, { status: 403 })
  }
  return null
}

/**
 * Verifica que el usuario es staff: rol ADMIN o SECRETARIO.
 *
 * SECRETARIO NO EXISTE todavía en EDVEX: el CHECK de `usuarios.rol` solo admite
 * 'ADMIN' y 'ALUMNO', así que hoy por aquí solo pasan admins y este helper se
 * comporta exactamente igual que verifyAdmin. Se añade ahora para que los
 * endpoints que en plantilla son de staff queden marcados como tales desde el
 * principio; el día que se cree el rol, no hay que revisitar cada ruta y
 * adivinar cuál debía abrirse.
 *
 * Usarlo NO otorga acceso a nadie que no lo tenga ya. Los endpoints que deben
 * seguir siendo exclusivos de admin (gestión de staff, ingresos globales) usan
 * verifyAdmin a propósito.
 */
export async function verifyStaff(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userId)
    .single()

  // .toUpperCase() aunque EDVEX ya guarde el rol en mayúscula: normalizar aquí
  // hace que una fila escrita a mano en minúscula no abra ni cierre accesos por
  // accidente. Falla cerrado si el usuario no existe.
  const rol = (usuario?.rol as string | undefined)?.toUpperCase()
  if (!usuario || (rol !== 'ADMIN' && rol !== 'SECRETARIO')) {
    return NextResponse.json(
      { error: 'Acceso denegado. Se requiere rol ADMIN o SECRETARIO.' },
      { status: 403 },
    )
  }
  return null
}

/**
 * Devuelve el rol del usuario normalizado en MAYÚSCULA, o null si no existe.
 * Para respuestas condicionales por rol (ocultar columnas sensibles, gating de
 * botones en la UI) sin repetir la consulta en cada ruta.
 */
export async function getRolActual(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userId)
    .single()
  return (usuario?.rol as string | undefined)?.toUpperCase() ?? null
}
