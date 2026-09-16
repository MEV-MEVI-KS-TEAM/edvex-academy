/**
 * POST /api/auth/register-complete
 * Tras signUp en el cliente: crea usuario en public.usuarios y alumno en public.alumnos.
 * Debe llamarse con la sesión ya iniciada (justo después de signUp).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function matriculaUnica(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `ALU-${year}-${rand}`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const nombre_completo = (body.nombre_completo ?? '').trim()
    if (!nombre_completo) {
      return NextResponse.json({ error: 'nombre_completo es requerido' }, { status: 400 })
    }
    const telefono = (body.telefono ?? '').trim() || null
    const plan_estudio_id = body.plan_estudio_id || null

    const admin = createAdminClient()

    const { error: usuarioError } = await admin
      .from('usuarios')
      .insert({
        id: user.id,
        email: user.email,
        nombre_completo,
        rol: 'ALUMNO',
        activo: true,
      })

    if (usuarioError) {
      if (usuarioError.code === '23505') {
        return NextResponse.json({ error: 'Usuario ya completó el registro' }, { status: 409 })
      }
      return NextResponse.json({ error: usuarioError.message }, { status: 500 })
    }

    let matricula = matriculaUnica()
    const maxAttempts = 10
    for (let i = 0; i < maxAttempts; i++) {
      const { error: alumnoError } = await admin
        .from('alumnos')
        .insert({
          usuario_id: user.id,
          matricula,
          plan_estudio_id,
          meses_desbloqueados: 0,
          inscripcion_pagada: false,
          modulos_desbloqueados: [],
          telefono,
          // Alta por /register (persona real): se oculta del padrón demo admin.
          autorregistro: true,
        })

      if (!alumnoError) break
      if (alumnoError.code === '23505') {
        matricula = matriculaUnica()
        continue
      }
      return NextResponse.json({ error: alumnoError.message }, { status: 500 })
    }

    const { data: alumno } = await admin
      .from('alumnos')
      .select('id')
      .eq('usuario_id', user.id)
      .single()

    if (!alumno) {
      return NextResponse.json({ error: 'Error al crear alumno' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, alumno_id: alumno.id })
  } catch (e) {
    console.error('[register-complete]', e)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
