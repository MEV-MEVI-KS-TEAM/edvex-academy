import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esAlumnoProtegido, MENSAJE_ALUMNO_PROTEGIDO } from '@/lib/alumno-protegido'

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (esAlumnoProtegido(user.id)) {
      return NextResponse.json({ error: MENSAJE_ALUMNO_PROTEGIDO }, { status: 403 })
    }

    const { plan_estudio_id } = await req.json()
    if (!plan_estudio_id || typeof plan_estudio_id !== 'string') {
      return NextResponse.json({ error: 'plan_estudio_id es requerido' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verificar que el alumno no tiene plan asignado aún
    const { data: alumno, error: alumnoErr } = await admin
      .from('alumnos')
      .select('id, plan_estudio_id')
      .eq('usuario_id', user.id)
      .single()

    if (alumnoErr || !alumno) {
      return NextResponse.json({ error: 'Perfil de alumno no encontrado' }, { status: 404 })
    }

    if (alumno.plan_estudio_id) {
      return NextResponse.json({ error: 'Ya tienes un plan asignado. No puedes cambiarlo.' }, { status: 409 })
    }

    // Validar que el plan exista y esté activo
    const { data: plan, error: planErr } = await admin
      .from('planes_estudio')
      .select('id, nombre, duracion_meses, precio_mensual')
      .eq('id', plan_estudio_id)
      .eq('activo', true)
      .single()

    if (planErr || !plan) {
      return NextResponse.json({ error: 'Plan no encontrado o inactivo' }, { status: 404 })
    }

    // Asignar el plan
    const { error: updateErr } = await admin
      .from('alumnos')
      .update({ plan_estudio_id })
      .eq('id', alumno.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      plan: {
        id: plan.id,
        nombre: plan.nombre,
        duracion_meses: plan.duracion_meses,
        precio_mensual: plan.precio_mensual,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
