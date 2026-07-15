import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Layout del visor de cursos a pantalla completa (/cursos/[id]). Vive FUERA del
 * layout del alumno a propósito: aquí entran tanto alumnos (inscritos, vía RLS)
 * como el admin (vista previa) — por eso NO hay redirect a /admin y NO se exige
 * rol ALUMNO. Solo se exige sesión (defensa en profundidad sobre el middleware).
 *
 * Chrome mínimo sin sidebar/topbar del dashboard: fondo oscuro EDVEX #0B0D11.
 */
export default async function CursosViewerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen" style={{ background: '#0B0D11', color: '#F1F5F9' }}>
      {children}
    </div>
  )
}
