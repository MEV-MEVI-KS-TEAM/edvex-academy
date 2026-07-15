import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── GET /api/alumno/cursos/tiene — ¿el alumno tiene ≥1 curso accesible? ──────
// Alimenta la visibilidad del ítem de nav "Cursos y Diplomados" (solo si hay).
// La RLS "cursos: select inscritos o admin" hace que este SELECT devuelva solo
// cursos publicados en los que el alumno está inscrito (o todo, si es admin).
//
// Identity bridge (EDVEX): la policy cursos_select resuelve internamente
// alumnos.id vía usuario_id, así que no hace falta resolverlo aquí: un no-admin
// sin fila en alumnos, o sin inscripciones, obtiene 0 filas → tiene:false.
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ tiene: false })

    const { data } = await supabase.from('cursos').select('id').limit(1)
    return NextResponse.json({ tiene: (data?.length ?? 0) > 0 })
  } catch {
    return NextResponse.json({ tiene: false })
  }
}
