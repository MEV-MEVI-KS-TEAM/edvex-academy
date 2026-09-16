import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ids de `alumnos` marcados como autorregistro (los que entraron por /register,
 * no sembrados por la demo). Se ocultan del padrón que ven los administradores
 * —lista de Alumnos, Pagos y Documentos— sin borrarlos ni afectar su acceso.
 *
 * Las CIFRAS de Reportes NO usan este filtro: siguen contando a todos, así que el
 * showroom mantiene sus totales (125 alumnos, ingresos) mientras esas personas
 * reales no aparecen en las listas.
 */
export async function idsAlumnosAutorregistro(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from('alumnos').select('id').eq('autorregistro', true)
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** Cláusula `(uuid1,uuid2,...)` para usar con `.not('alumno_id', 'in', ...)`. */
export function listaIn(ids: string[]): string {
  return `(${ids.join(',')})`
}
