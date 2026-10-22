'use client'

/**
 * Aula de un curso o diplomado, con la MISMA navegación que una materia
 * (/alumno/materia/[id]): encabezado con regreso, pestañas Contenido · Examen ·
 * Información, roadmap a la izquierda y la lección en una tarjeta a la derecha,
 * «Marcar como completada» y la tarjeta «¿Qué sigue?» al terminar.
 *
 * Port de la plantilla PV (src/components/cursos/AulaCurso.tsx, #322) con los
 * colores de EDVEX. Diferencias con la plantilla, a propósito:
 *  - EDVEX no tiene ventana de pago por curso: la inscripción abre todo el
 *    curso (RLS de curso_lecciones), así que no hay aviso de módulos por abrir.
 *  - EDVEX no emite constancias de curso: no hay botón «Ver mi constancia».
 *
 * Lo monta /alumno/curso/[id], dentro del portal del alumno.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Eye, FileText, Loader2 } from 'lucide-react'
import WeekRoadmap from '@/components/alumno/WeekRoadmap'
import FadeIn from '@/components/ui/FadeIn'
import ContenidoMarkdown, { normalizarContenido } from '@/components/ContenidoMarkdown'
import { VideoPlayer } from '@/components/cursos/VideoPlayer'
import { porcentajeProgreso, cursoCompletado } from '@/lib/cursos/progreso'
import type { CursoDetalleAlumno, LeccionAlumno } from '@/types/cursos-alumno'
import SeccionActividades from '@/components/actividades/SeccionActividades'
import { BotonDescargaPdf } from '@/components/actividades/Descargas'
import { urlPdf, vistaActividades } from '@/components/actividades/datos'

type Tab = 'contenido' | 'examen' | 'informacion'

// Mismas tarjetas que la materia (src/app/(dashboard)/alumno/materia/[id]/page.tsx).
const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }
// Acento de EDVEX legible dentro de las tarjetas oscuras.
const ACENTO = '#8D9AFF'

interface ExamenResumen { total: number; mejor: number | null; aprobado: boolean }

export default function AulaCurso({ cursoId }: { cursoId: string }) {
  const router = useRouter()

  const [detalle, setDetalle] = useState<CursoDetalleAlumno | null>(null)
  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState<Tab>('contenido')
  const [activaId, setActivaId] = useState<string | null>(null)
  const [marcando, setMarcando] = useState(false)
  const [mostrarGuia, setMostrarGuia] = useState(true)
  // Examen final: null mientras carga, false si el curso no tiene examen.
  const [examen, setExamen] = useState<ExamenResumen | false | null>(null)
  const leccionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tab === 'examen') setMostrarGuia(true)
  }, [tab])

  // ── Carga inicial ──
  useEffect(() => {
    let cancelled = false
    fetch(`/api/alumno/cursos/${cursoId}`)
      .then(async r => {
        if (r.status === 404) {
          if (!cancelled) router.replace('/alumno/cursos?aviso=sin-acceso')
          return null
        }
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((json: CursoDetalleAlumno | null) => {
        if (!json || cancelled) return
        setDetalle(json)
        setActivaId(json.primeraLeccionPendienteId)
      })
      .catch(() => { /* deja el estado de error abajo */ })
      .finally(() => { if (!cancelled) setCargando(false) })
    return () => { cancelled = true }
  }, [cursoId, router])

  // ── ¿Este curso tiene examen final? ──
  // Va aparte de la carga del curso: un 404 aquí solo significa "sin examen",
  // no debe tumbar el aula.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/alumno/cursos/${cursoId}/examen`)
      .then(async r => (r.ok ? r.json() : null))
      .then((json: { total: number; mejor_porcentaje: number | null; aprobado?: boolean } | null) => {
        if (cancelled) return
        setExamen(json ? { total: json.total, mejor: json.mejor_porcentaje, aprobado: json.aprobado === true } : false)
      })
      .catch(() => { if (!cancelled) setExamen(false) })
    return () => { cancelled = true }
  }, [cursoId])

  // Lista plana de lecciones en orden (numeración global, prev/next y lookup)
  const enOrden = useMemo<LeccionAlumno[]>(
    () => detalle?.modulos.flatMap(m => m.lecciones) ?? [],
    [detalle]
  )
  const numeroDe = useMemo(() => new Map(enOrden.map((l, i) => [l.id, i + 1])), [enOrden])
  const completadas = useMemo(() => new Set(enOrden.filter(l => l.completada).map(l => l.id)), [enOrden])
  const idxActiva = useMemo(() => enOrden.findIndex(l => l.id === activaId), [enOrden, activaId])
  const activa = idxActiva >= 0 ? enOrden[idxActiva] : null
  const anterior = idxActiva > 0 ? enOrden[idxActiva - 1] : null
  const siguiente = idxActiva >= 0 && idxActiva < enOrden.length - 1 ? enOrden[idxActiva + 1] : null

  const irALeccion = useCallback((id: string) => {
    setActivaId(id)
    // En móvil el roadmap va arriba: llevar al alumno a la lección que eligió.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      requestAnimationFrame(() => leccionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
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
        const hechas = modulos.flatMap(m => m.lecciones).filter(l => l.completada).length
        return {
          ...prev,
          modulos,
          completadas: hechas,
          porcentaje: porcentajeProgreso(hechas, prev.totalLecciones),
          completado: cursoCompletado(hechas, prev.totalLecciones),
        }
      })
    } finally {
      setMarcando(false)
    }
  }

  const volver = useCallback(() => {
    router.push('/alumno/cursos')
  }, [router])

  const irAlExamen = useCallback(() => router.push(`/cursos/${cursoId}/examen`), [router, cursoId])

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  if (!detalle) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-center">
      <p className="text-sm" style={{ color: '#EF4444' }}>No se pudo cargar el curso.</p>
      <button type="button" onClick={volver} className="text-base min-h-[48px] px-4 rounded-xl" style={{ color: '#5B6CFF' }}>Regresar</button>
    </div>
  )

  const { curso, modoPreview } = detalle
  const nombreTipo = curso.tipo === 'diplomado' ? 'Diplomado' : 'Curso'
  const tipoMin = curso.tipo === 'diplomado' ? 'diplomado' : 'curso'

  const tabs: { key: Tab; label: string }[] = [
    { key: 'contenido', label: 'Contenido' },
    { key: 'examen', label: 'Examen' },
    { key: 'informacion', label: 'Información' },
  ]

  const moduloDeActiva = activa ? detalle.modulos.findIndex(m => m.lecciones.some(l => l.id === activa.id)) : -1

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      {/* Banner vista previa admin */}
      {modoPreview && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
          <Eye className="w-4 h-4 flex-shrink-0" />
          Vista previa de administrador — así ve el {tipoMin} el alumno. No se registra progreso.
        </div>
      )}

      {/* Header — igual que la materia */}
      <FadeIn delay={0}>
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={volver}
            aria-label="Regresar"
            className="mt-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl touch-manipulation active:opacity-80 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(91,108,255,0.15)', color: '#7B8AFF' }}>
                {nombreTipo}
              </span>
              <span className="text-xs" style={{ color: '#94A3B8' }}>
                {detalle.completadas}/{detalle.totalLecciones} lecciones · {detalle.porcentaje}%
              </span>
            </div>
            <h1 className="text-xl font-bold mt-1" style={{ color: '#F1F5F9' }}>{curso.nombre}</h1>
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#2A2F3E' }}
              role="progressbar" aria-valuenow={detalle.porcentaje} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${detalle.porcentaje}%`, background: '#5B6CFF' }} />
            </div>
            {urlPdf(curso.cuaderno_pdf_url) && (
              <div className="mt-3">
                <BotonDescargaPdf url={curso.cuaderno_pdf_url} texto="Descargar cuaderno completo" marca="cuaderno" />
              </div>
            )}
          </div>
        </div>
      </FadeIn>

      {/* Tabs */}
      <FadeIn delay={100}>
        <div className="overflow-x-auto -mx-1 px-1" style={{ borderBottom: '1px solid #2A2F3E', WebkitOverflowScrolling: 'touch' }}>
          <div className="flex min-w-max gap-1">
            {tabs.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="px-4 min-h-[48px] text-sm font-medium transition-all relative whitespace-nowrap touch-manipulation active:opacity-80 rounded-t-lg"
                style={{ color: tab === t.key ? '#F1F5F9' : '#94A3B8' }}
                aria-pressed={tab === t.key}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#5B6CFF' }} />
                )}
              </button>
            ))}
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={200}>
        {/* ── Tab: Contenido ── */}
        {tab === 'contenido' && (
          !activa ? (
            <div className="rounded-xl p-10 text-center" style={CARD}>
              <p className="text-sm" style={{ color: '#CBD5E1' }}>Este {tipoMin} todavía no tiene lecciones.</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Columna izquierda: roadmap por módulo */}
              <div className="w-full md:w-1/3 rounded-xl p-5 flex-shrink-0" style={CARD}>
                <div className="overflow-y-auto max-h-[40vh] md:max-h-[calc(100vh-120px)] md:sticky md:top-4 space-y-5">
                  {detalle.modulos.map((modulo, mi) => {
                    const hechas = modulo.lecciones.filter(l => l.completada).length
                    return (
                      <div key={modulo.id} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold flex-shrink-0"
                            style={{ background: 'rgba(141,154,255,0.18)', color: ACENTO }}>
                            {mi + 1}
                          </span>
                          <p className="flex-1 min-w-0 text-xs font-semibold uppercase tracking-wide leading-snug" style={{ color: '#CBD5E1' }}>
                            {modulo.nombre}
                          </p>
                          <span className="text-[11px] flex-shrink-0" style={{ color: '#94A3B8' }}>
                            {hechas}/{modulo.lecciones.length}
                          </span>
                        </div>
                        {modulo.lecciones.length === 0 ? (
                          <p className="text-xs pl-8" style={{ color: '#64748B' }}>Sin lecciones</p>
                        ) : (
                          <WeekRoadmap
                            semanas={modulo.lecciones.map(l => ({ id: l.id, numero: numeroDe.get(l.id) ?? 0, titulo: l.titulo }))}
                            semanasCompletadas={completadas}
                            semanaActivaId={activa.id}
                            onSemanaClick={irALeccion}
                            lang="es"
                            etiqueta="Lección"
                            libre
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Columna derecha: lección seleccionada */}
              <div ref={leccionRef} className="flex-1 min-w-0 space-y-4 scroll-mt-20">
                {(() => {
                  const texto = normalizarContenido(activa.contenido_texto)
                  const palabras = texto.trim() ? texto.trim().split(/\s+/).length : 0
                  const minLectura = palabras > 0 ? Math.ceil(palabras / 200) : 0
                  const meta: string[] = []
                  if (minLectura > 0) meta.push(`📖 ${minLectura} min lectura`)
                  if (activa.video_url) meta.push('🎬 1 video')
                  if (activa.tieneMaterial) meta.push('📄 material')
                  return (
                    <div className="rounded-xl p-5 space-y-4" style={CARD}>
                      {/* Header de la lección */}
                      <div className="pb-3" style={{ borderBottom: '1px solid #2A2F3E' }}>
                        <span className="text-xs font-mono" style={{ color: ACENTO }}>
                          {moduloDeActiva >= 0 ? `Módulo ${moduloDeActiva + 1} · ` : ''}Lección {numeroDe.get(activa.id)}
                        </span>
                        <h2 className="text-base font-bold mt-0.5" style={{ color: '#F1F5F9' }}>{activa.titulo}</h2>
                        {meta.length > 0 && (
                          <p className="text-xs mt-1.5" style={{ color: '#94A3B8' }}>{meta.join(' · ')}</p>
                        )}
                      </div>

                      {activa.video_url && <VideoPlayer url={activa.video_url} titulo={activa.titulo} />}

                      {/* Contenido — el mismo Markdown que las lecciones de la plantilla */}
                      <ContenidoMarkdown texto={texto} />

                      {activa.tieneMaterial && activa.materialUrl && (
                        <div className="space-y-2" style={{ borderTop: '1px solid #2A2F3E', paddingTop: '1rem' }}>
                          <p className="text-xs font-medium" style={{ color: '#94A3B8' }}>Material de la lección</p>
                          <a
                            href={activa.materialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all"
                            style={{ background: '#0D1017', border: '1px solid #2A2F3E', color: '#F1F5F9' }}
                          >
                            <FileText className="w-4 h-4 flex-shrink-0" style={{ color: ACENTO }} />
                            <span className="flex-1 min-w-0 truncate">Descargar material</span>
                            <Download className="w-4 h-4 flex-shrink-0" style={{ color: '#94A3B8' }} />
                          </a>
                        </div>
                      )}

                      {/* Actividades interactivas + «Descargar PDF» de la lección.
                          Sin actividades ni PDF no pinta nada. */}
                      <SeccionActividades actividades={activa.actividades} pdfUrl={activa.actividades_pdf_url} acento={ACENTO} />

                      {!activa.video_url && !texto && !activa.tieneMaterial &&
                        vistaActividades(activa.actividades, activa.actividades_pdf_url).tipo === 'nada' && (
                        <p className="text-sm" style={{ color: '#94A3B8' }}>Esta lección aún no tiene contenido.</p>
                      )}

                      {/* Completar lección — oculto en la vista previa del admin */}
                      {!modoPreview && (
                        <div className="pt-2">
                          {activa.completada ? (
                            <button
                              type="button"
                              onClick={toggleCompletada}
                              disabled={marcando}
                              title="Desmarcar"
                              className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-semibold disabled:opacity-60"
                              style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }}
                            >
                              ✅ Lección completada
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={toggleCompletada}
                              disabled={marcando}
                              className="w-full min-h-[48px] rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                              style={{ background: '#5B6CFF', color: '#fff', border: 'none' }}
                            >
                              {marcando ? '⏳ Guardando...' : '✅ Marcar lección como completada'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Anterior / siguiente */}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => anterior && irALeccion(anterior.id)}
                          disabled={!anterior}
                          className="px-3 min-h-[44px] rounded-xl text-sm font-medium disabled:opacity-30"
                          style={{ border: '1px solid #2A2F3E', color: '#CBD5E1', background: 'rgba(255,255,255,0.03)' }}
                        >
                          ← Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => siguiente && irALeccion(siguiente.id)}
                          disabled={!siguiente}
                          className="px-3 min-h-[44px] rounded-xl text-sm font-medium disabled:opacity-30"
                          style={{ border: '1px solid #2A2F3E', color: '#CBD5E1', background: 'rgba(255,255,255,0.03)' }}
                        >
                          Siguiente →
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {/* Card ¿Qué sigue? */}
                {detalle.completado && (
                  <div
                    className="rounded-xl p-6 flex flex-col items-center text-center gap-4"
                    style={{
                      background: '#1E2535',
                      border: '1px solid rgba(99,102,241,0.35)',
                      boxShadow: '0 0 24px rgba(99,102,241,0.08)',
                    }}
                  >
                    <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>🎯</span>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold" style={{ color: '#F1F5F9' }}>
                        ¡Completaste todas las lecciones!
                      </h3>
                      <p className="text-sm" style={{ color: '#94A3B8' }}>
                        {examen ? 'Ya puedes presentar tu examen final.' : `Terminaste el ${tipoMin}.`}
                      </p>
                    </div>
                    {examen && (
                      <button
                        type="button"
                        onClick={() => setTab('examen')}
                        className="w-full min-h-[48px] rounded-xl text-sm font-semibold transition-all"
                        style={{ background: '#5B6CFF', color: '#fff', border: 'none' }}
                      >
                        Ir al examen →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* ── Tab: Examen ── */}
        {tab === 'examen' && (
          <div className="space-y-4">
            {/* Guía de estudio — la misma idea que la materia */}
            {mostrarGuia && examen && !examen.aprobado && detalle.modulos.length > 0 && (() => {
              const pendientes = detalle.totalLecciones - detalle.completadas
              return (
                <div className="rounded-xl p-5 space-y-5" style={{ background: '#1A1F2E', border: '1px solid #2A2F3E' }}>
                  <div className="space-y-0.5">
                    <h3 className="text-base font-bold" style={{ color: '#F1F5F9' }}>Prepárate para el examen</h3>
                    <p className="text-sm" style={{ color: '#94A3B8' }}>Repasa estos módulos antes de comenzar</p>
                  </div>
                  {pendientes > 0 && (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm"
                      style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
                      <span style={{ fontSize: '1rem', lineHeight: 1.4 }}>⚠️</span>
                      <p style={{ color: '#FDE68A' }}>
                        Tienes {pendientes} lección{pendientes !== 1 ? 'es' : ''} pendiente{pendientes !== 1 ? 's' : ''}. Te recomendamos completarlas antes del examen.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Módulos</p>
                    <ul className="space-y-1.5">
                      {detalle.modulos.map(m => {
                        const completo = m.lecciones.length > 0 && m.lecciones.every(l => l.completada)
                        return (
                          <li key={m.id} className="flex items-center gap-2.5 text-sm">
                            <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{completo ? '✅' : '⚪'}</span>
                            <span style={{ color: completo ? '#CBD5E1' : '#94A3B8' }}>{m.nombre}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMostrarGuia(false)}
                    className="w-full min-h-[52px] rounded-xl text-base font-semibold transition-all"
                    style={{ background: '#5B6CFF', color: '#fff', border: 'none' }}
                  >
                    Ya estoy listo — ver mi examen →
                  </button>
                </div>
              )
            })()}

            {(!mostrarGuia || !examen || examen.aprobado || detalle.modulos.length === 0) && (
              examen === null ? (
                <div className="flex items-center justify-center py-12 rounded-xl" style={CARD}>
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#94A3B8' }} />
                </div>
              ) : examen === false ? (
                <div className="flex items-center justify-center py-12 rounded-xl" style={CARD}>
                  <p className="text-sm" style={{ color: '#94A3B8' }}>Este {tipoMin} todavía no tiene examen final.</p>
                </div>
              ) : (
                <div className="rounded-xl p-5 space-y-4" style={CARD}>
                  <div>
                    <h3 className="text-base font-semibold" style={{ color: '#F1F5F9' }}>Examen final</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm flex-wrap" style={{ color: '#94A3B8' }}>
                      <span>{examen.total} preguntas</span>
                      {examen.mejor !== null && <span>Mejor puntaje: {Math.round(examen.mejor)}%</span>}
                    </div>
                  </div>
                  {examen.aprobado && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <span className="text-lg">✓</span>
                      <p className="text-sm font-semibold" style={{ color: '#10B981' }}>¡Examen aprobado!</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={irAlExamen}
                    className="w-full min-h-[52px] rounded-xl text-base font-semibold transition-all"
                    style={{ background: '#5B6CFF', color: '#fff' }}
                  >
                    {/* Aprobar cierra el examen; ya no se ofrece reintento. */}
                    {examen.aprobado ? 'Ver resultado' : examen.mejor !== null ? 'Volver a intentar' : 'Presentar examen'}
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* ── Tab: Información ── */}
        {tab === 'informacion' && (
          <div className="space-y-4">
            {curso.descripcion && (
              <div className="rounded-xl p-5 space-y-2" style={CARD}>
                <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Descripción</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>{curso.descripcion}</p>
              </div>
            )}
            <div className="rounded-xl p-5 space-y-3" style={CARD}>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Plan de estudios</h3>
              <ol className="space-y-2">
                {detalle.modulos.map((m, i) => (
                  <li key={m.id} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold"
                      style={{ background: 'rgba(141,154,255,0.15)', color: ACENTO }}>
                      {i + 1}
                    </span>
                    <span className="flex-1" style={{ color: '#CBD5E1' }}>{m.nombre}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: '#94A3B8' }}>
                      {m.lecciones.length} lección{m.lecciones.length !== 1 ? 'es' : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </FadeIn>
    </div>
  )
}
