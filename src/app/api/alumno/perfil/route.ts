import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { esAlumnoProtegido } from '@/lib/alumno-protegido'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data, error } = await supabase
      .from('alumnos')
      .select('*, planes_estudio(nombre, duracion_meses), usuarios(nombre_completo, email, avatar_url)')
      .eq('usuario_id', user.id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

    const a = data as unknown as {
      id: string
      matricula: string
      plan_estudio_id: string | null
      meses_desbloqueados: number
      inscripcion_pagada?: boolean
      modulos_desbloqueados?: number[]
      created_at: string
      planes_estudio: { nombre: string; duracion_meses: number } | null
      usuarios: { nombre_completo: string; email: string; avatar_url?: string | null } | null
    }

    return NextResponse.json({
      id: a.id,
      matricula: a.matricula,
      plan_estudio_id: a.plan_estudio_id,
      meses_desbloqueados: a.meses_desbloqueados,
      inscripcion_pagada: a.inscripcion_pagada ?? false,
      modulos_desbloqueados: Array.isArray(a.modulos_desbloqueados) ? a.modulos_desbloqueados : [],
      created_at: a.created_at,
      plan_nombre: a.planes_estudio?.nombre ?? '',
      duracion_meses: a.planes_estudio?.duracion_meses ?? 0,
      nombre_completo: a.usuarios?.nombre_completo ?? '',
      email: a.usuarios?.email ?? '',
      avatar_url: a.usuarios?.avatar_url ?? null,
      // Cuenta demo compartida (prospectos): la UI oculta cambiar contraseña y foto.
      protegido: esAlumnoProtegido(user.id),
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
