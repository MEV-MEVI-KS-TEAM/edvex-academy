'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Error boundary del área privada (/admin y /alumno).
 *
 * Vive en el nivel `(dashboard)` a propósito: en Next.js App Router un
 * `error.tsx` NO atrapa el error de su propio `layout.tsx`, solo el de sus
 * hijos. Los layouts de admin y alumno pueden `throw` cuando la consulta a
 * `usuarios` falla de forma transitoria; ese error sube hasta aquí y el usuario
 * ve un botón "Intentar de nuevo" en lugar de ser expulsado a /login con la
 * sesión todavía válida.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { lang } = useLanguage()

  useEffect(() => {
    // Deja rastro en el servidor/consola para diagnóstico sin exponer detalles al usuario.
    console.error('[dashboard/error]', error)
  }, [error])

  const copy =
    lang === 'en'
      ? {
          title: 'Something went wrong',
          body: 'We could not load your panel. Your session is still active — just try again.',
          retry: 'Try again',
        }
      : {
          title: 'Algo salió mal',
          body: 'No pudimos cargar tu panel. Tu sesión sigue activa: solo vuelve a intentarlo.',
          retry: 'Intentar de nuevo',
        }

  return (
    <div
      className="flex items-center justify-center min-h-screen px-4"
      style={{ background: '#0B0D11' }}
    >
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        <AlertTriangle className="w-10 h-10" style={{ color: '#F59E0B' }} />
        <h1 className="text-lg font-semibold" style={{ color: '#F1F5F9' }}>
          {copy.title}
        </h1>
        <p className="text-sm" style={{ color: '#94A3B8' }}>
          {copy.body}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg text-sm font-medium transition-colors"
          style={{ background: '#0055ff', color: '#fff' }}
        >
          <RefreshCw className="w-4 h-4" />
          {copy.retry}
        </button>
      </div>
    </div>
  )
}
