import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mesesConAcceso } from '@/lib/alumno-protegido'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: alumnoData, error: alumnoError } = await supabase
      .from('alumnos')
      .select('meses_desbloqueados, inscripcion_pagada, area')
      .eq('usuario_id', user.id)
      .single()

    if (alumnoError || !alumnoData) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    const alumno = alumnoData as unknown as {
      meses_desbloqueados: number
      inscripcion_pagada: boolean
      area: string | null
    }

    // Cuentas protegidas: todo el programa abierto (lib/alumno-protegido).
    const meses = mesesConAcceso(user.id, alumno.meses_desbloqueados, alumno.area)

    // Siempre mostrar todos los meses con candado/abierto.
    // TUT101 siempre desbloqueada. Demás materias según meses_desbloqueados.
    // Ambos planes (Estándar 6 meses y Express 3 meses) cubren los mismos
    // 6 meses de contenido — la diferencia es la velocidad de desbloqueo.
    const { data: mesesData, error: mesesError } = await supabase
      .from('meses_contenido')
      .select('*, materias(id, codigo, nombre, nombre_en, color_hex, descripcion, descripcion_en)')
      .order('numero')

    if (mesesError) return NextResponse.json({ error: mesesError.message }, { status: 500 })

    const result = (mesesData ?? []).map((mes: unknown) => {
      const m = mes as {
        id: string
        numero: number
        titulo: string
        materias: { id: string; codigo: string; nombre: string; nombre_en: string; color_hex: string; descripcion: string; descripcion_en: string }[]
      }

      // Marcar cada materia como desbloqueada o no.
      // TUT101 siempre desbloqueada (es la tutoría gratuita).
      // Demás materias: desbloqueadas si el mes <= meses_desbloqueados.
      const materiasConAcceso = m.materias.map(mat => ({
        ...mat,
        desbloqueada: mat.codigo.startsWith('TUT') || m.numero <= meses,
      }))

      return {
        ...m,
        materias: materiasConAcceso,
        desbloqueado: m.numero <= meses,
      }
    })

    // Estado adicional: inscripción pagada pero 0 meses → necesita comprar módulo
    return NextResponse.json({
      meses: result,
      inscripcion_pagada: alumno.inscripcion_pagada,
      meses_desbloqueados: alumno.meses_desbloqueados,
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
