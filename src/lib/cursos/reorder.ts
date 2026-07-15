/**
 * Reordenamiento con botones ↑↓ (sin drag & drop) para módulos y lecciones.
 * Renumera secuencialmente a los hermanos y persiste solo las filas que cambian.
 * SOLO para uso en API routes (admin client).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type Direccion = 'up' | 'down'

export async function moveItem(
  admin: SupabaseClient,
  table: 'curso_modulos' | 'curso_lecciones',
  parentCol: 'curso_id' | 'modulo_id',
  parentId: string,
  itemId: string,
  direction: Direccion
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: siblings, error } = await admin
    .from(table)
    .select('id, orden')
    .eq(parentCol, parentId)
    .order('orden', { ascending: true })
    .order('id', { ascending: true })

  if (error) return { ok: false, error: error.message, status: 500 }

  const list = (siblings ?? []) as { id: string; orden: number }[]
  const idx = list.findIndex(s => s.id === itemId)
  if (idx === -1) return { ok: false, error: 'Elemento no encontrado', status: 404 }

  const target = direction === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= list.length) return { ok: true } // ya está en el borde: no-op

  const arr = [...list]
  ;[arr[idx], arr[target]] = [arr[target], arr[idx]]

  for (let i = 0; i < arr.length; i++) {
    if (arr[i].orden !== i) {
      const { error: upError } = await admin.from(table).update({ orden: i }).eq('id', arr[i].id)
      if (upError) return { ok: false, error: upError.message, status: 500 }
    }
  }
  return { ok: true }
}
