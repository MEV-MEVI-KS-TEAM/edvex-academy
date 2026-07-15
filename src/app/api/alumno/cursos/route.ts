import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { porcentajeProgreso } from '@/lib/cursos/progreso'
import { leccionesDeCurso, completadasDe, portadaFirmada } from '@/lib/cursos/alumno-data'
import type { CursoCatalogoItem } from '@/types/cursos-alumno'
import type { CursoTipo } from '@/types/cursos'

// ─── GET /api/alumno/cursos — catálogo del alumno (RLS: publicados + inscrito) ─
// Identity bridge (EDVEX): las inscripciones se guardan contra alumnos.id (UUID
// aleatorio), NO auth.uid(). Se resuelve alumnos.id vía usuario_id y con él se
// consultan inscripciones/progreso. Los reads de cursos van por la sesión del
// usuario (RLS) — solo devuelve publicados+inscritos; el firmado de portadas usa
// el service role. Un admin (o cualquiera sin fila en alumnos) no tiene
// inscripciones → catálogo vacío.
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Identity bridge: resolver alumnos.id (null para admin / usuario sin alumnos).
    const { data: alumno } = await supabase
      .from('alumnos')
      .select('id')
      .eq('usuario_id', user.id)
      .maybeSingle()
    if (!alumno) return NextResponse.json([])
    const alumnoId = alumno.id as string

    // Cursos a los que el alumno está inscrito (RLS: select de sus inscripciones).
    const { data: inscripciones } = await supabase
      .from('curso_inscripciones')
      .select('curso_id')
      .eq('alumno_id', alumnoId)

    const cursoIds = (inscripciones ?? []).map(i => i.curso_id as string)
    if (cursoIds.length === 0) return NextResponse.json([])

    // De esos, la RLS "cursos: select inscritos o admin" devuelve solo los publicados.
    const { data: cursos } = await supabase
      .from('cursos')
      .select('id, nombre, nombre_en, descripcion, descripcion_en, tipo, portada_path, orden, created_at')
      .in('id', cursoIds)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true })

    const admin = createAdminClient()

    const items: CursoCatalogoItem[] = await Promise.all(
      (cursos ?? []).map(async curso => {
        const lecciones = await leccionesDeCurso(supabase, curso.id as string)
        const leccionIds = lecciones.map(l => l.leccionId)
        const completadas = await completadasDe(supabase, alumnoId, leccionIds)
        const total = leccionIds.length
        return {
          id: curso.id as string,
          nombre: curso.nombre as string,
          nombre_en: (curso.nombre_en as string | null) ?? '',
          descripcion: (curso.descripcion as string | null) ?? null,
          descripcion_en: (curso.descripcion_en as string | null) ?? '',
          tipo: curso.tipo as CursoTipo,
          portadaUrl: await portadaFirmada(admin, curso.portada_path as string | null),
          totalLecciones: total,
          completadas: completadas.size,
          porcentaje: porcentajeProgreso(completadas.size, total),
        }
      })
    )

    return NextResponse.json(items)
  } catch (err) {
    console.error('[GET /api/alumno/cursos]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
