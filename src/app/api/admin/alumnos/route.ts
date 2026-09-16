import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    // Usar service role para el SELECT ya que RLS en 'usuarios' impediría leer registros de otros
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('alumnos')
      .select(`
        id,
        matricula,
        meses_desbloqueados,
        created_at,
        plan_estudio_id,
        usuario_id,
        telefono,
        contactado_whatsapp,
        inscripcion_pagada,
        usuarios (nombre_completo, email, activo),
        planes_estudio (nombre, duracion_meses)
      `)
      // Ocultar autorregistros (los que entraron por /register): no son padrón demo.
      .eq('autorregistro', false)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result = ((data ?? []) as unknown[]).map((row) => {
      const a = row as {
        id: string
        matricula: string
        meses_desbloqueados: number
        created_at: string
        plan_estudio_id: string
        usuario_id: string
        telefono: string | null
        contactado_whatsapp: boolean
        inscripcion_pagada: boolean
        usuarios: { nombre_completo: string; email: string; activo: boolean } | { nombre_completo: string; email: string; activo: boolean }[] | null
        planes_estudio: { nombre: string; duracion_meses: number } | null
      }
      // Supabase puede retornar el join como objeto o como array dependiendo del schema
      const usuariosData = Array.isArray(a.usuarios) ? a.usuarios[0] : a.usuarios
      return {
        id: a.id,
        matricula: a.matricula,
        meses_desbloqueados: a.meses_desbloqueados,
        created_at: a.created_at,
        nombre_completo: usuariosData?.nombre_completo ?? '',
        email: usuariosData?.email ?? '',
        activo: usuariosData?.activo ?? true,
        telefono: a.telefono ?? null,
        contactado_whatsapp: a.contactado_whatsapp ?? false,
        inscripcion_pagada: a.inscripcion_pagada ?? false,
        plan_nombre: a.planes_estudio?.nombre ?? '',
        duracion_meses: a.planes_estudio?.duracion_meses ?? 0,
      }
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const body = await request.json()
    const { nombre_completo, email, password, plan_estudio_id, telefono } = body

    if (!nombre_completo || !email || !password) {
      return NextResponse.json({ error: 'Nombre, email y contraseña son requeridos' }, { status: 400 })
    }

    if (typeof password !== 'string' || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres, una letra y un número' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese correo electrónico' }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const newUserId = authData.user.id

    // Insertar en tabla usuarios
    const { error: usuarioError } = await admin
      .from('usuarios')
      .insert({
        id: newUserId,
        email,
        nombre_completo,
        rol: 'ALUMNO',
        activo: true,
      })

    if (usuarioError) {
      await admin.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ error: usuarioError.message }, { status: 500 })
    }

    // Insertar en tabla alumnos con reintento en colisión de matrícula (código 23505)
    const year = new Date().getFullYear()
    let alumnoData = null
    for (let i = 0; i < 5; i++) {
      const rand = Math.floor(Math.random() * 9000) + 1000
      const matricula = `ALU-${year}-${rand}`
      const { data, error } = await admin
        .from('alumnos')
        .insert({
          usuario_id: newUserId,
          matricula,
          plan_estudio_id: plan_estudio_id || null,
          meses_desbloqueados: 0,
          telefono: telefono?.trim() || null,
        })
        .select()
        .single()
      if (!error) { alumnoData = data; break }
      if (error.code !== '23505') {
        await admin.auth.admin.deleteUser(newUserId)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      // Colisión de matrícula → reintentar con otro número aleatorio
    }

    if (!alumnoData) {
      await admin.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ error: 'No se pudo generar matrícula única' }, { status: 500 })
    }

    return NextResponse.json(alumnoData, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
