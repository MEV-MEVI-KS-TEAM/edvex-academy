import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import PageTransition from '@/components/ui/PageTransition'

export default async function AlumnoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Único motivo legítimo para mandar a /login: NO hay usuario autenticado.
  if (!user) redirect('/login')

  // La consulta a `usuarios` puede fallar por un motivo transitorio (red, RLS,
  // timeout). Antes, cualquier fallo dejaba `usuario` en null y rebotaba a
  // /login aunque la sesión fuera perfectamente válida. Ahora se distinguen tres
  // casos con `.maybeSingle()` (0 filas => data null SIN error; solo un fallo
  // real trae `error`):
  //   1. error   -> se reintenta una vez y, si persiste, se lanza para que lo
  //                 atrape el error boundary (botón "Intentar de nuevo"). NO se
  //                 expulsa a quien sí tiene sesión.
  //   2. sin fila -> usuario autenticado sin perfil (huérfano): a /login, como
  //                 antes.
  //   3. rol != ALUMNO -> a SU panel, como el middleware, no a /login.
  let { data: usuario, error } = await supabase
    .from('usuarios')
    .select('nombre_completo, rol, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    ;({ data: usuario, error } = await supabase
      .from('usuarios')
      .select('nombre_completo, rol, avatar_url')
      .eq('id', user.id)
      .maybeSingle())
  }

  if (error) {
    throw new Error(`No se pudo cargar el perfil del usuario (${error.code ?? 'desconocido'})`)
  }

  if (!usuario) redirect('/login')

  if (usuario.rol !== 'ALUMNO') redirect('/admin')

  return (
    <DashboardLayout
      role="ALUMNO"
      userName={usuario!.nombre_completo}
      avatarUrl={(usuario as unknown as { avatar_url?: string | null }).avatar_url ?? null}
      pageTitle="header.studentPortal"
      showFooter={true}
    >
      <PageTransition>{children}</PageTransition>
    </DashboardLayout>
  )
}
