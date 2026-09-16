import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function matriculaUnica(): string {
  const year = new Date().getFullYear()
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `ALU-${year}-${rand}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'email' | 'recovery' | 'signup' | null

  console.log('[auth/confirm] START - token_hash:', token_hash ? token_hash.slice(0, 12) + '...' : 'NULL', '| type:', type)

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://edvexacademy.online'

  if (!token_hash || !type) {
    console.log('[auth/confirm] ERROR - missing token_hash or type, redirecting to /login?error=invalid_link')
    return NextResponse.redirect(`${base}/login?error=invalid_link`)
  }

  const supabase = await createClient()

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({ token_hash, type })

  console.log('[auth/confirm] verifyOtp result - error:', verifyError?.message ?? 'none')
  console.log('[auth/confirm] verifyData.user:', verifyData?.user?.id ?? 'NULL', '| email:', verifyData?.user?.email ?? 'NULL')
  console.log('[auth/confirm] verifyData.session:', verifyData?.session ? 'PRESENT' : 'NULL')

  if (verifyError) {
    return NextResponse.redirect(`${base}/login?error=confirmation_failed`)
  }

  const user = verifyData.user

  if (!user) {
    console.log('[auth/confirm] ERROR - user is null after verifyOtp, redirecting to /login?error=no_user')
    return NextResponse.redirect(`${base}/login?error=no_user`)
  }

  const admin = createAdminClient()

  // Verificar si ya tiene fila en usuarios
  const { data: existing, error: existingError } = await admin
    .from('usuarios')
    .select('id')
    .eq('id', user.id)
    .single()

  console.log('[auth/confirm] existing usuario:', existing?.id ?? 'NOT FOUND', '| error:', existingError?.message ?? 'none')

  if (!existing) {
    const nombre_completo =
      (user.user_metadata?.nombre_completo as string | undefined)?.trim() ||
      user.email?.split('@')[0] ||
      ''
    const telefono =
      (user.user_metadata?.telefono as string | undefined)?.trim() || null

    if (!user.email) {
      console.error('[auth/confirm] SKIP inserts - email is null')
      return NextResponse.redirect(`${base}/login?error=setup_failed`)
    }

    const { error: usuarioError } = await admin.from('usuarios').insert({
      id: user.id,
      email: user.email,
      nombre_completo,
      rol: 'ALUMNO',
      activo: true,
    })

    console.log('[auth/confirm] INSERT usuario - error:', usuarioError?.message ?? 'OK', '| code:', usuarioError?.code ?? '-')

    if (!usuarioError || usuarioError.code === '23505') {
      let matricula = matriculaUnica()
      let alumnoError = null
      for (let i = 0; i < 10; i++) {
        const result = await admin.from('alumnos').insert({
          usuario_id: user.id,
          matricula,
          plan_estudio_id: null,
          meses_desbloqueados: 0,
          inscripcion_pagada: false,
          modulos_desbloqueados: [],
          telefono,
          // Alta por /register: se marca como autorregistro para ocultarlo del
          // padrón que ven los administradores (no es un alumno demo sembrado).
          autorregistro: true,
        })
        alumnoError = result.error
        if (!alumnoError) break
        if (alumnoError.code === '23505') { matricula = matriculaUnica(); continue }
        break
      }
      console.log('[auth/confirm] INSERT alumno - error:', alumnoError?.message ?? 'OK', '| matricula:', matricula)
    } else {
      console.error('[auth/confirm] ERROR no recuperable en INSERT usuarios - code:', usuarioError.code)
      return NextResponse.redirect(`${base}/login?error=setup_failed`)
    }
  } else {
    console.log('[auth/confirm] usuario ya existe, skipping inserts')
  }

  console.log('[auth/confirm] DONE - redirecting to /alumno/elegir-plan')
  return NextResponse.redirect(`${base}/alumno/elegir-plan`)
}
