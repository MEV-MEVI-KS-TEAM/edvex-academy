import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/supabase/verify-admin'

export const dynamic = 'force-dynamic'

/**
 * Roles de staff que gestiona esta pantalla.
 *
 * EN MAYÚSCULA, al revés que plantilla. En EDVEX el CHECK de `usuarios.rol`
 * admite 'ADMIN' | 'ALUMNO', `is_admin()` compara contra 'ADMIN' y el
 * middleware enruta por el valor exacto. Insertar 'admin' en minúscula crearía
 * una cuenta que pasa el alta sin error y luego NO puede entrar a ninguna parte:
 * el fallo aparece al primer login, lejos de su causa.
 *
 * SECRETARIO se lista aquí, pero el CHECK de la BD todavía NO lo admite: crear
 * uno hoy falla con 23514 y esta ruta lo traduce a un mensaje claro. Se deja
 * declarado para que el día que se amplíe el CHECK no haya que tocar la API.
 */
const ROLES_STAFF = ['ADMIN', 'SECRETARIO'] as const
type RolStaff = typeof ROLES_STAFF[number]

/**
 * GET /api/admin/usuarios
 * Lista las cuentas de staff. SOLO ADMIN — la gestión de staff no es del
 * secretario aunque algún día exista.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const admin = createAdminClient()

    // nombre_completo en una sola columna: EDVEX no tiene nombre + apellidos.
    const { data: usuarios, error } = await admin
      .from('usuarios')
      // Sin `activo`: la pantalla no lo muestra porque hoy NO revoca nada
      // —verifyAdmin y el middleware solo miran `rol`— y un badge "Inactivo"
      // haría creer que la cuenta quedó sin acceso. Ver la nota del PR.
      .select('id, nombre_completo, email, rol, created_at')
      .in('rol', [...ROLES_STAFF])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/admin/usuarios]', error.code, error.message)
      return NextResponse.json({ error: 'No se pudieron cargar las cuentas' }, { status: 500 })
    }

    return NextResponse.json(
      { usuarios: usuarios ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[GET /api/admin/usuarios]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

/**
 * POST /api/admin/usuarios
 * Crea una cuenta de staff. SOLO ADMIN.
 * Body: { nombre_completo, email, password?, rol }
 * Sin password se genera una temporal que se devuelve UNA sola vez.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const denied = await verifyAdmin(supabase, user.id)
    if (denied) return denied

    const body = await request.json()

    // Se acepta nombre_completo directo o nombre+apellidos por separado, y se
    // concatena: así el formulario puede tener uno o dos campos sin que la API
    // tenga que cambiar. La BD guarda siempre una sola columna.
    const nombreCompleto = (
      typeof body.nombre_completo === 'string' && body.nombre_completo.trim()
        ? body.nombre_completo
        : [body.nombre, body.apellidos].filter(v => typeof v === 'string' && v.trim()).join(' ')
    ).trim()

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    // .toUpperCase(), al revés que plantilla. Ver el comentario de ROLES_STAFF.
    const rol = (typeof body.rol === 'string' ? body.rol.trim().toUpperCase() : '') as RolStaff

    if (!nombreCompleto) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }
    if (!ROLES_STAFF.includes(rol)) {
      return NextResponse.json(
        { error: `Rol inválido. Usa: ${ROLES_STAFF.join(', ')}` },
        { status: 400 },
      )
    }

    let password = typeof body.password === 'string' ? body.password : ''
    let passwordTemporal: string | null = null
    if (!password) {
      passwordTemporal = randomBytes(9).toString('base64url')
      password = passwordTemporal
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // SIN `rol`: user_metadata es autoescribible por el titular de la sesion
      // (supabase.auth.updateUser({ data: {...} }) desde el navegador). Guardar
      // ahi el rol crea una segunda copia del atributo de autorizacion bajo
      // control del usuario. Hoy nadie la lee —el rol efectivo sale siempre de
      // usuarios.rol— pero es justo el campo que consumen los hooks de claims y
      // las policies del tipo auth.jwt()->'user_metadata'->>'rol'. Si algun dia
      // hace falta el rol en el JWT, va en app_metadata, que el usuario no puede
      // escribir.
      user_metadata: { nombre_completo: nombreCompleto },
    })

    if (authError) {
      if (authError.message.includes('already')) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 })
      }
      console.error('[POST /api/admin/usuarios] auth:', authError.message)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const newUserId = authData.user.id

    // Upsert y no insert: EDVEX no tiene trigger handle_new_user (verificado en
    // EDVEX-SUPABASE-SETUP.sql), pero un alta previa que fallara despues de
    // crear la fila dejaria un id huerfano, y ahi un insert plano reventaria con
    // 23505 sin explicar nada. El upsert lo absorbe.
    const { error: usuarioError } = await admin
      .from('usuarios')
      .upsert(
        { id: newUserId, nombre_completo: nombreCompleto, email, rol, activo: true },
        { onConflict: 'id' },
      )

    if (usuarioError) {
      // Rollback: sin esto queda una cuenta en Auth que no existe en `usuarios`,
      // capaz de autenticarse pero no de resolver su rol — un fantasma que
      // además bloquea el email para un reintento.
      await admin.auth.admin.deleteUser(newUserId)

      // 23514 = violación de CHECK. Hoy es el caso real de 'SECRETARIO': el
      // CHECK de usuarios.rol solo admite ADMIN y ALUMNO.
      if (usuarioError.code === '23514') {
        return NextResponse.json(
          { error: `La base de datos todavía no admite el rol ${rol}. Amplía el CHECK de usuarios.rol antes de crear esta cuenta.` },
          { status: 400 },
        )
      }
      console.error('[POST /api/admin/usuarios] upsert:', usuarioError.code, usuarioError.message)
      return NextResponse.json({ error: 'No se pudo crear la cuenta' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      usuario: { id: newUserId, nombre_completo: nombreCompleto, email, rol },
      password_temporal: passwordTemporal,
    }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/admin/usuarios]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
