'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Circle, Download, Eye, FileText, List, Loader2, PartyPopper, X,
} from 'lucide-react'
import { VideoPlayer } from '@/components/cursos/VideoPlayer'
import { ProgressBar } from '@/components/cursos/ProgressBar'
import { porcentajeProgreso, cursoCompletado } from '@/lib/cursos/progreso'
import { useLanguage } from '@/context/LanguageContext'
import type { CursoDetalleAlumno, LeccionAlumno } from '@/types/cursos-alumno'

export default function VisorCursoPage() {
  // Next 14 → params síncronos en client component (useParams)
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const cursoId = params.id

  const { lang, t } = useLanguage()
  const loc = (es: string | null, en: string) => (lang === 'en' && en ? en : (es ?? ''))

  const [detalle, setDetalle] = useState<CursoDetalleAlumno | null>(null)
  const [cargando, setCargando] = useState(true)
  const [activaId, setActivaId] = useState<string | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [marcando, setMarcando] = useState(false)

  // ── Carga inicial ──
  useEffect(() => {
    let cancelled = false
    // Origen de la navegación: el admin llega con ?from=admin (para enrutar el
    // 404 de vuelta a su panel en vez de al catálogo del alumno).
    const desdeAdmin = new URLSearchParams(window.location.search).get('from') === 'admin'
    fetch(`/api/alumno/cursos/${cursoId}`)
      .then(async r => {
        if (r.status === 404) {
          if (!cancelled) {
            router.replace(desdeAdmin ? '/admin/cursos' : '/alumno/cursos?aviso=sin-acceso')
          }
          return null
        }
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((json: CursoDetalleAlumno | null) => {
        if (!json || cancelled) return
        setDetalle(json)
        setActivaId(json.primeraLeccionPendienteId)
        // Expandir el módulo que contiene la lección activa
        const mod = json.modulos.find(m => m.lecciones.some(l => l.id === json.primeraLeccionPendienteId))
        setExpandidos(new Set(mod ? [mod.id] : json.modulos.slice(0, 1).map(m => m.id)))
      })
      .catch(() => { /* deja el estado de error abajo */ })
      .finally(() => { if (!cancelled) setCargando(false) })
    return () => { cancelled = true }
  }, [cursoId, router])

  // Lista plana de lecciones en orden (para prev/next y lookup)
  const enOrden = useMemo<LeccionAlumno[]>(
    () => detalle?.modulos.flatMap(m => m.lecciones) ?? [],
    [detalle]
  )
  const activa = useMemo(() => enOrden.find(l => l.id === activaId) ?? null, [enOrden, activaId])
  const idxActiva = useMemo(() => enOrden.findIndex(l => l.id === activaId), [enOrden, activaId])
  const anterior = idxActiva > 0 ? enOrden[idxActiva - 1] : null
  const siguiente = idxActiva >= 0 && idxActiva < enOrden.length - 1 ? enOrden[idxActiva + 1] : null

  const irALeccion = useCallback((id: string) => {
    setActivaId(id)
    setDrawerOpen(false)
    const cont = document.getElementById('leccion-scroll')
    if (cont) cont.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // ── Marcar / desmarcar completada ──
  async function toggleCompletada() {
    if (!detalle || !activa || marcando || detalle.modoPreview) return
    const nuevoEstado = !activa.completada
    setMarcando(true)
    try {
      const res = await fetch(`/api/alumno/cursos/${cursoId}/progreso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leccion_id: activa.id, completada: nuevoEstado }),
      })
      if (!res.ok) return
      // Actualización local (no refetch → no perder la lección activa)
      setDetalle(prev => {
        if (!prev) return prev
        const modulos = prev.modulos.map(m => ({
          ...m,
          lecciones: m.lecciones.map(l => l.id === activa.id ? { ...l, completada: nuevoEstado } : l),
        }))
        const completadas = modulos.flatMap(m => m.lecciones).filter(l => l.completada).length
        return {
          ...prev,
          modulos,
          completadas,
          porcentaje: porcentajeProgreso(completadas, prev.totalLecciones),
          completado: cursoCompletado(completadas, prev.totalLecciones),
        }
      })
    } finally {
      setMarcando(false)
    }
  }

  function toggleModulo(id: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const volver = useCallback(() => {
    router.push(detalle?.modoPreview ? `/admin/cursos/${cursoId}` : '/alumno/cursos')
  }, [router, detalle, cursoId])

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
      </div>
    )
  }
  if (!detalle) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 px-6 text-center">
        <p className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>{t('courses.loadCourseError')}</p>
        <button onClick={() => router.push('/alumno/cursos')} className="text-sm font-medium underline" style={{ color: '#7B8AFF' }}>
          {t('courses.backToCourses')}
        </button>
      </div>
    )
  }

  const { curso, modoPreview } = detalle
  const cursoNombre = loc(curso.nombre, curso.nombre_en)
  const activaTitulo = activa ? loc(activa.titulo, activa.titulo_en) : ''
  const activaTexto = activa ? loc(activa.contenido_texto, activa.contenido_texto_en) : ''

  // ── Índice de módulos/lecciones (reutilizado en drawer móvil y panel desktop) ──
  const Indice = (
    <div className="space-y-2">
      {detalle.modulos.map((modulo, mi) => {
        const abierto = expandidos.has(modulo.id)
        const compl = modulo.lecciones.filter(l => l.completada).length
        return (
          <div key={modulo.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #2A2F3E', background: '#181C26' }}>
            <button
              onClick={() => toggleModulo(modulo.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              style={{ background: 'rgba(91,108,255,0.06)' }}
              aria-expanded={abierto}
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold flex-shrink-0"
                style={{ background: '#5B6CFF', color: '#fff' }}>
                {mi + 1}
              </span>
              <span className="flex-1 text-sm font-semibold truncate" style={{ color: '#F1F5F9' }}>
                {loc(modulo.nombre, modulo.nombre_en)}
              </span>
              <span className="text-[10px] flex-shrink-0" style={{ color: '#64748B' }}>
                {compl}/{modulo.lecciones.length}
              </span>
              <ChevronDown className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: '#64748B', transform: abierto ? 'rotate(180deg)' : 'none' }} />
            </button>

            {abierto && (
              <div className="py-1">
                {modulo.lecciones.length === 0 && (
                  <p className="px-3 py-2 text-xs" style={{ color: '#475569' }}>{t('courses.noLessons')}</p>
                )}
                {modulo.lecciones.map(leccion => {
                  const esActiva = leccion.id === activaId
                  return (
                    <button
                      key={leccion.id}
                      onClick={() => irALeccion(leccion.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                      style={{ background: esActiva ? 'rgba(91,108,255,0.1)' : 'transparent' }}
                    >
                      {leccion.completada
                        ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#34D399' }} />
                        : <Circle className="w-4 h-4 flex-shrink-0" style={{ color: '#334155' }} />}
                      <span className="flex-1 text-xs truncate"
                        style={{ color: esActiva ? '#F1F5F9' : '#94A3B8', fontWeight: esActiva ? 600 : 400 }}>
                        {loc(leccion.titulo, leccion.titulo_en)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-5 py-3"
        style={{ background: '#12151C', borderBottom: '1px solid #2A2F3E', color: '#F1F5F9' }}
      >
        <button onClick={volver} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF' }} aria-label={t('courses.back')}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm sm:text-base font-bold truncate leading-tight">{cursoNombre}</h1>
          <p className="text-[11px]" style={{ color: '#94A3B8' }}>
            {detalle.completadas}/{detalle.totalLecciones} {t('courses.lessons')} · {detalle.porcentaje}%
          </p>
        </div>
        {/* Botón índice (solo móvil) */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
          style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF' }}
        >
          <List className="w-4 h-4" />
          {t('courses.index')}
        </button>
      </header>

      {/* Banner vista previa admin */}
      {modoPreview && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', borderBottom: '1px solid rgba(245,158,11,0.25)' }}>
          <Eye className="w-4 h-4 flex-shrink-0" />
          {t('courses.adminPreview')}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Panel de índice (desktop) */}
        <aside className="hidden md:block w-[320px] flex-shrink-0 overflow-y-auto p-4"
          style={{ borderRight: '1px solid #2A2F3E', background: '#0B0D11', maxHeight: 'calc(100vh - 61px)' }}>
          <div className="mb-3">
            <ProgressBar porcentaje={detalle.porcentaje} />
          </div>
          {Indice}
        </aside>

        {/* Contenido de la lección */}
        <main id="leccion-scroll" className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 61px)' }}>
          <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
            {/* Banner de felicitación */}
            {detalle.completado && (
              <div className="flex items-center gap-3 rounded-2xl px-4 py-4"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)' }}>
                <PartyPopper className="w-6 h-6 flex-shrink-0" style={{ color: '#34D399' }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: '#34D399' }}>
                    {curso.tipo === 'diplomado' ? t('courses.doneDiplomado') : t('courses.doneCurso')}
                  </p>
                  <p className="text-xs" style={{ color: '#10B981' }}>{t('courses.doneBody')}</p>
                </div>
              </div>
            )}

            {!activa ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
                <p className="text-sm" style={{ color: '#94A3B8' }}>
                  {t('courses.noLessons')}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold" style={{ color: '#F1F5F9' }}>
                    {activaTitulo}
                  </h2>
                </div>

                {activa.video_url && <VideoPlayer url={activa.video_url} titulo={activaTitulo} />}

                {activaTexto && (
                  <div
                    className="text-sm leading-relaxed rounded-2xl p-4 sm:p-5"
                    style={{ background: '#181C26', border: '1px solid #2A2F3E', color: '#CBD5E1', whiteSpace: 'pre-wrap' }}
                  >
                    {activaTexto}
                  </div>
                )}

                {activa.tieneMaterial && activa.materialUrl && (
                  <a
                    href={activa.materialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold w-full sm:w-auto justify-center"
                    style={{ background: 'rgba(91,108,255,0.08)', border: '1px solid rgba(91,108,255,0.25)', color: '#7B8AFF' }}
                  >
                    <FileText className="w-4 h-4" />
                    {t('courses.downloadMaterial')}
                    <Download className="w-4 h-4" />
                  </a>
                )}

                {!activa.video_url && !activaTexto && !activa.tieneMaterial && (
                  <p className="text-sm" style={{ color: '#64748B' }}>{t('courses.noContent')}</p>
                )}

                {/* Marcar como completada (oculto en vista previa admin) */}
                {!modoPreview && (
                  <button
                    onClick={toggleCompletada}
                    disabled={marcando}
                    className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold w-full sm:w-auto disabled:opacity-60"
                    style={activa.completada
                      ? { background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.4)' }
                      : { background: '#5B6CFF', color: '#fff' }}
                  >
                    {activa.completada ? <><Check className="w-4 h-4" /> {t('courses.markedComplete')}</> : <>{t('courses.markComplete')}</>}
                  </button>
                )}

                {/* Navegación anterior / siguiente */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    onClick={() => anterior && irALeccion(anterior.id)}
                    disabled={!anterior}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-30"
                    style={{ border: '1px solid #2A2F3E', color: '#94A3B8', background: '#181C26' }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {t('courses.prev')}
                  </button>
                  <button
                    onClick={() => siguiente && irALeccion(siguiente.id)}
                    disabled={!siguiente}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-30"
                    style={{ border: '1px solid #2A2F3E', color: '#94A3B8', background: '#181C26' }}
                  >
                    {t('courses.next')}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Drawer de índice (móvil) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setDrawerOpen(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-[85%] max-w-sm overflow-y-auto p-4" style={{ background: '#0B0D11', borderRight: '1px solid #2A2F3E' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold" style={{ color: '#F1F5F9' }}>{t('courses.courseContent')}</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-1 rounded-lg" style={{ color: '#94A3B8' }} aria-label={t('courses.back')}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mb-3"><ProgressBar porcentaje={detalle.porcentaje} /></div>
            {Indice}
          </div>
        </div>
      )}
    </div>
  )
}
