import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/auth/confirm']
  const isPublicRoute = publicRoutes.some(route =>
    route === '/'
      ? request.nextUrl.pathname === '/'
      : request.nextUrl.pathname.startsWith(route)
  )

  // Usuario autenticado intentando acceder a ruta pública → redirigir a su dashboard
  // Excepción: "/" es la landing pública, no se redirige aunque esté autenticado
  const isLandingRoot = request.nextUrl.pathname === '/'
  if (user && isPublicRoute && !isLandingRoot) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol, activo')
      .eq('id', user.id)
      .single()

    // Cuenta desactivada: se la deja en la ruta pública en vez de rebotarla a su
    // dashboard.
    //
    // NO es cosmético, evita un BUCLE INFINITO: el bloque de rutas admin de
    // abajo manda al admin inactivo a /login, y este bloque lo mandaría de
    // vuelta a /admin —su rol sigue siendo ADMIN—, turnándose indefinidamente
    // con 302 y sin un solo error en los logs.
    //
    // Efecto lateral asumido: un ALUMNO dado de baja tampoco será redirigido
    // automáticamente desde /login a /alumno. Puede seguir navegando a /alumno a
    // mano (este cambio no cierra el acceso de alumnos, que es otro asunto),
    // pero deja de ser empujado dentro de una plataforma de la que se le dio de
    // baja, que es el comportamiento coherente.
    if (usuario?.activo === false) return supabaseResponse

    const roleRedirects: Record<string, string> = {
      ADMIN: '/admin',
      ALUMNO: '/alumno',
    }

    const destination = usuario?.rol ? (roleRedirects[usuario.rol] ?? '/login') : '/login'
    const url = request.nextUrl.clone()
    url.pathname = destination
    return NextResponse.redirect(url)
  }

  // Usuario no autenticado intentando acceder a ruta protegida → redirigir a login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Segunda capa de seguridad: verificar rol para rutas de administración
  const isAdminRoute =
    request.nextUrl.pathname.startsWith('/admin') ||
    request.nextUrl.pathname.startsWith('/api/admin')

  if (user && isAdminRoute) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol, activo')
      .eq('id', user.id)
      .single()

    // La baja en EDVEX es lógica (usuarios.activo = false), así que hasta ahora
    // una cuenta dada de baja seguía navegando el panel con normalidad. Se
    // comprueba ANTES del rol: un admin desactivado sigue teniendo rol ADMIN, y
    // el check de rol lo dejaría pasar.
    //
    // Solo el false explícito. La columna es NOT NULL DEFAULT TRUE; si un NULL
    // apareciera por una migración futura, la lectura segura es "no dado de
    // baja" — bloquear por un NULL inesperado tumbaría el panel entero.
    if (usuario?.activo === false) {
      if (request.nextUrl.pathname.startsWith('/api/admin')) {
        return NextResponse.json({ error: 'Esta cuenta está desactivada.' }, { status: 403 })
      }
      // A /login y NO a /alumno: un admin desactivado no es un alumno, y
      // mandarlo a /alumno le enseñaría un dashboard de estudiante vacío en vez
      // de decirle que su cuenta ya no está activa. El bloque de rutas públicas
      // de arriba lo deja quedarse en /login en vez de rebotarlo.
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('cuenta', 'desactivada')
      return NextResponse.redirect(url)
    }

    if (usuario?.rol !== 'ADMIN') {
      if (request.nextUrl.pathname.startsWith('/api/admin')) {
        return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
      }
      const url = request.nextUrl.clone()
      url.pathname = '/alumno'
      return NextResponse.redirect(url)
    }
  }

  // Navegación libre: el alumno puede acceder a todas las secciones de /alumno/*
  // sin restricciones del middleware. El acceso al CONTENIDO de materias se controla
  // a nivel de API (meses, materia, quiz endpoints).
  // Única regla: si ya tiene plan, no puede volver a /alumno/elegir-plan.
  const pathname = request.nextUrl.pathname

  if (user && pathname === '/alumno/elegir-plan') {
    const { data: alumno } = await supabase
      .from('alumnos')
      .select('plan_estudio_id')
      .eq('usuario_id', user.id)
      .single()

    if (alumno?.plan_estudio_id) {
      const url = request.nextUrl.clone()
      url.pathname = '/alumno'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
