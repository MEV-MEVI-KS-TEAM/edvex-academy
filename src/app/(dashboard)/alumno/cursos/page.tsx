'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { GraduationCap, Loader2, BookOpen } from 'lucide-react'
import { ProgressBar } from '@/components/cursos/ProgressBar'
import { useLanguage } from '@/context/LanguageContext'
import type { CursoCatalogoItem } from '@/types/cursos-alumno'

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

export default function MisCursosPage() {
  const router = useRouter()
  const { lang, t } = useLanguage()
  const loc = (es: string | null, en: string) => (lang === 'en' && en ? en : (es ?? ''))

  const [cursos, setCursos] = useState<CursoCatalogoItem[] | null>(null)
  const [error, setError] = useState(false)
  const [aviso, setAviso] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/alumno/cursos')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(json => { if (!cancelled) setCursos(Array.isArray(json) ? json : []) })
      .catch(() => { if (!cancelled) { setCursos([]); setError(true) } })
    return () => { cancelled = true }
  }, [])

  // Aviso cuando el visor redirige aquí por falta de acceso (?aviso=sin-acceso)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('aviso') === 'sin-acceso') {
      setAviso(true)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  if (cursos === null) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>
          {t('courses.myCoursesTitle')}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
          {t('courses.continueSubtitle')}
        </p>
      </div>

      {aviso && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B' }}
        >
          {t('courses.notAvailable')}
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: '#EF4444' }}>{t('courses.loadError')}</p>
      )}

      {/* Estado vacío */}
      {!error && cursos.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl text-center px-6"
          style={CARD}
        >
          <GraduationCap className="w-10 h-10" style={{ color: '#2A2F3E' }} />
          <p className="text-sm font-semibold" style={{ color: '#94A3B8' }}>{t('courses.emptyTitle')}</p>
          <p className="text-xs" style={{ color: '#64748B' }}>
            {t('courses.emptyBody')}
          </p>
        </div>
      )}

      {/* Grid de cursos */}
      {cursos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cursos.map(curso => {
            const nombre = loc(curso.nombre, curso.nombre_en)
            const descripcion = loc(curso.descripcion, curso.descripcion_en)
            const completo = curso.porcentaje >= 100
            return (
              <button
                key={curso.id}
                onClick={() => router.push(`/cursos/${curso.id}`)}
                className="text-left rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5"
                style={{ ...CARD, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#5B6CFF' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A2F3E' }}
              >
                {/* Portada */}
                <div
                  className="relative w-full"
                  style={{ aspectRatio: '16/9', background: 'linear-gradient(135deg, #232841 0%, #12151F 100%)' }}
                >
                  {curso.portadaUrl ? (
                    <Image
                      src={curso.portadaUrl}
                      alt={nombre}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <GraduationCap className="w-9 h-9" style={{ color: 'rgba(91,108,255,0.45)' }} />
                    </div>
                  )}
                  {completo && (
                    <span
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: '#10B981', color: '#04120B' }}
                    >
                      {t('courses.completed')}
                    </span>
                  )}
                </div>

                {/* Cuerpo */}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <span
                    className="inline-block self-start px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF' }}
                  >
                    {curso.tipo === 'diplomado' ? t('courses.typeDiplomado') : t('courses.typeCurso')}
                  </span>
                  <h3 className="text-base font-bold leading-snug" style={{ color: '#F1F5F9' }}>
                    {nombre}
                  </h3>
                  {descripcion && (
                    <p className="text-xs line-clamp-2" style={{ color: '#94A3B8' }}>
                      {descripcion}
                    </p>
                  )}

                  <div className="mt-auto pt-3 space-y-1.5">
                    <ProgressBar porcentaje={curso.porcentaje} size="sm" />
                    <p className="flex items-center gap-1 text-[11px]" style={{ color: '#64748B' }}>
                      <BookOpen className="w-3 h-3" />
                      {curso.completadas}/{curso.totalLecciones} {t('courses.lessons')}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
