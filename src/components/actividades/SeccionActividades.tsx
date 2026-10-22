'use client'

/**
 * Actividades de UNA semana (Sec/Prepa o materia de licenciatura) o de UNA
 * lección de curso, montadas dentro de su tarjeta oscura.
 *
 *   - Con `actividades` válidas («actividades/1»): el componente interactivo, en
 *     un panel con el papel de la escuela (--color-fondo), con su propio botón
 *     «Descargar PDF» si hay `pdfUrl`.
 *   - Sin actividades pero con PDF: solo el botón «Descargar PDF».
 *   - Sin nada: NO se pinta nada (ni título ni separador).
 *
 * Si el JSON trae algo que el componente no sabe pintar, la falla queda dentro
 * de este bloque (ErrorBoundary): la semana, sus videos y su quiz siguen.
 */
import { Component, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import Actividades from './Actividades'
import { BotonDescargaPdf } from './Descargas'
import { vistaActividades } from './datos'

class Aislar extends Component<{ children: ReactNode; respaldo: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[actividades] no se pudieron mostrar las actividades:', error)
  }
  render() {
    return this.state.error ? this.props.respaldo : this.props.children
  }
}

// EDVEX: el avance de las actividades se guarda en el navegador POR ALUMNO, para
// que al cambiar de cuenta en el mismo equipo no aparezcan las respuestas de otro.
// Se resuelve `alumnos.id` del usuario en sesión (una vez por usuario); sin fila de
// alumno (admin en vista previa) se usa su id de usuario.
const alumnoPorUsuario = new Map<string, Promise<string>>()
// Sin alumno identificable (sin sesión o error de lectura): se muestran las
// actividades pero SIN recordar nada, para no guardar avance en una llave ajena.
const SIN_RECORDAR = 'sin-recordar'

async function alumnoEnSesion(): Promise<string> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return SIN_RECORDAR
  let p = alumnoPorUsuario.get(userId)
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase.from('alumnos').select('id').eq('usuario_id', userId).maybeSingle()
      // Un fallo de lectura no se queda en caché: el siguiente montaje lo reintenta.
      if (error) { alumnoPorUsuario.delete(userId); throw error }
      return (data as { id: string } | null)?.id ?? `usuario-${userId}`
    })()
    alumnoPorUsuario.set(userId, p)
  }
  return p
}

function useAlumnoEnSesion(): string | null {
  const [alumno, setAlumno] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    alumnoEnSesion().then(a => { if (vivo) setAlumno(a) }).catch(() => { if (vivo) setAlumno(SIN_RECORDAR) })
    return () => { vivo = false }
  }, [])
  return alumno
}

export default function SeccionActividades({
  actividades,
  pdfUrl,
  acento,
}: {
  actividades: unknown
  pdfUrl: unknown
  /** Acento legible sobre la tarjeta oscura (para el ícono del botón solo-PDF). */
  acento?: string
}) {
  const alumno = useAlumnoEnSesion()
  const vista = vistaActividades(actividades, pdfUrl)
  if (vista.tipo === 'nada') return null

  const soloPdf = (url: string) => (
    <div className="space-y-2" style={{ borderTop: '1px solid #2A2F3E', paddingTop: '1rem' }} data-actividades="solo-pdf">
      <p className="text-xs font-medium" style={{ color: '#94A3B8' }}>Actividades para imprimir</p>
      <BotonDescargaPdf url={url} texto="Descargar PDF" tono="oscuro" acento={acento} marca="pdf-unidad" />
    </div>
  )

  if (vista.tipo === 'solo-pdf') return soloPdf(vista.pdfUrl)

  // Hasta saber quién es el alumno no se lee ni se escribe avance (evita mezclar cuentas).
  if (!alumno) return null

  return (
    // key por unidad: cada semana / lección tiene su propio límite de error (si
    // una falla, la siguiente que se abre vuelve a intentarlo desde cero).
    <Aislar key={vista.datos.unidad.id} respaldo={vista.pdfUrl ? soloPdf(vista.pdfUrl) : null}>
      {/* Rejilla minmax(0,1fr): la tira de avance (chips sin salto de línea) no
          impone su ancho mínimo. En el celular la columna de la semana es
          `items-start` (ancho «fit-content»): sin esto, la tira estiraba la
          tarjeta a ~760 px y la página se salía de la pantalla a 375 px. */}
      <div className="grid grid-cols-[minmax(0,1fr)]">
        {/* En el celular el panel ocupa todo el ancho de la tarjeta (-mx-5 = su
            padding): el componente está pensado para 16 px de margen, que es su
            px-4. Desde sm vuelve a ser una tarjeta dentro de la tarjeta. */}
        <div
          className="-mx-5 px-4 py-5 sm:mx-0 sm:px-5 sm:rounded-xl"
          style={{ background: 'var(--color-fondo)', border: '1px solid var(--color-borde)' }}
          data-actividades="interactivas"
        >
          <Actividades key={`${alumno}:${vista.datos.unidad.id}`} datos={vista.datos} pdfUrl={vista.pdfUrl ?? undefined}
            alumno={alumno} recordar={alumno !== SIN_RECORDAR} />
        </div>
      </div>
    </Aislar>
  )
}
