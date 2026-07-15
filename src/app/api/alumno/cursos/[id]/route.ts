import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { porcentajeProgreso, cursoCompletado } from '@/lib/cursos/progreso'
import { modulosConProgreso, portadaFirmada } from '@/lib/cursos/alumno-data'
import type { CursoDetalleAlumno } from '@/types/cursos-alumno'
import type { CursoTipo } from '@/types/cursos'

// ─── GET /api/alumno/cursos/[id] — detalle del curso para el visor ────────────
// Sesión del usuario + RLS: si el alumno no está inscrito o el curso no está
// publicado, la RLS devuelve vacío → 404 (el front redirige al catálogo). El
// admin (is_admin(), rol='ADMIN') accede aunque esté en borrador → modoPreview.
//
// Identity bridge (EDVEX): el progreso se calcula contra alumnos.id (UUID
// aleatorio), NO auth.uid(). Se resuelve vía usuario_id; para un admin en vista
// previa (sin fila en alumnos) el id es '' → sin progreso. El firmado de portada
// y material usa el service role (admin client) — por eso modulosConProgreso,
// que firma el material internamente, recibe el admin client. El control de
// acceso ya lo garantiza el fetch de `curso` con la sesión del usuario (RLS).
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: curso } = await supabase
      .from('cursos')
      .select('id, nombre, nombre_en, descripcion, descripcion_en, tipo, estado, portada_path')
      .eq('id', params.id)
      .maybeSingle()

    // RLS vacío = sin acceso (no inscrito / no publicado / no existe).
    if (!curso) return NextResponse.json({ error: 'Curso no disponible' }, { status: 404 })

    // ¿El que mira es admin? → vista previa (sin progreso ni inscripción).
    // Rol en MAYÚSCULA, comparación sensible a mayúsculas (convención EDVEX).
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .maybeSingle()
    const modoPreview = usuario?.rol === 'ADMIN'

    // Identity bridge: alumnos.id (null para admin en vista previa).
    const { data: alumno } = await supabase
      .from('alumnos')
      .select('id')
      .eq('usuario_id', user.id)
      .maybeSingle()
    const alumnoId = (alumno?.id as string | undefined) ?? ''

    const admin = createAdminClient()
    const { modulos, total, completadas } = await modulosConProgreso(admin, alumnoId, params.id)

    // Primera lección pendiente en orden (módulo, lección); si todas están
    // completas o no hay progreso, la primera lección del curso.
    const enOrden = modulos.flatMap(m => m.lecciones)
    const pendiente = enOrden.find(l => !l.completada)
    const primeraLeccionPendienteId = pendiente?.id ?? enOrden[0]?.id ?? null

    const detalle: CursoDetalleAlumno = {
      curso: {
        id: curso.id as string,
        nombre: curso.nombre as string,
        nombre_en: (curso.nombre_en as string | null) ?? '',
        descripcion: (curso.descripcion as string | null) ?? null,
        descripcion_en: (curso.descripcion_en as string | null) ?? '',
        tipo: curso.tipo as CursoTipo,
        estado: curso.estado as string,
        portadaUrl: await portadaFirmada(admin, curso.portada_path as string | null),
      },
      modoPreview,
      modulos,
      totalLecciones: total,
      completadas,
      porcentaje: porcentajeProgreso(completadas, total),
      completado: cursoCompletado(completadas, total),
      primeraLeccionPendienteId,
    }
    return NextResponse.json(detalle)
  } catch (err) {
    console.error('[GET /api/alumno/cursos/[id]]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
