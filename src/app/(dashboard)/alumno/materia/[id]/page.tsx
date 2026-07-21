'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2, PlayCircle } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { createClient } from '@/lib/supabase/client'
import VideoEmbed from '@/components/alumno/VideoEmbed'
import ReadingProgress from '@/components/alumno/ReadingProgress'
import WeekRoadmap from '@/components/alumno/WeekRoadmap'
import CelebrationBanner from '@/components/alumno/CelebrationBanner'
import FadeIn from '@/components/ui/FadeIn'
import SplitTitle from '@/components/ui/SplitTitle'
import SemanaQuiz from '@/components/alumno/SemanaQuiz'
import NotasPersonales from '@/components/alumno/NotasPersonales'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

interface Video { titulo: string; titulo_en: string; url: string; url_en: string; duracion: string }
interface Semana {
  id: string; numero: number; titulo: string; titulo_en: string
  contenido: string; contenido_en: string
  url_en: string; videos: Video[]
}
interface Evaluacion {
  id: string; titulo: string; titulo_en: string; tipo: string; intentos_max: number
  intentos_usados: number; aprobada: boolean; calificacion_aprobatoria: number | null
}
interface BibItem { titulo: string; url?: string; tipo?: string }
interface Materia {
  id: string; codigo: string; nombre: string; nombre_en: string; color_hex: string
  descripcion: string; descripcion_en: string; objetivo: string; objetivo_en: string; temario: string[]
  temario_en?: string[]
  bibliografia: BibItem[]
  bibliografia_en?: BibItem[]
  semanas: Semana[]
  evaluaciones: Evaluacion[]
}

type Tab = 'contenido' | 'examen' | 'informacion'

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }
const INPUT_BG = { background: '#0B0D11' }

function renderBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: '#F1F5F9', fontWeight: 600 }}>{part}</strong>
      : part
  )
}

function renderTexto(texto: string) {
  const paragraphs = texto.split(/\n{2,}/)
  return paragraphs.map((para, pi) => {
    const lines = para.split('\n')
    return (
      <p key={pi} className="text-sm leading-relaxed" style={{ color: '#94A3B8', marginBottom: '0.75em' }}>
        {lines.map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {renderBold(line)}
          </span>
        ))}
      </p>
    )
  })
}

export default function MateriaPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { lang, t } = useLanguage()
  const loc = (es: string, en: string) => lang === 'en' && en ? en : es

  const [materia, setMateria] = useState<Materia | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('contenido')
  const [semanaSeleccionada, setSemanaSeleccionada] = useState<string | null>(null)
  const [alumnoId, setAlumnoId] = useState<string>('')
  const [alumnoError, setAlumnoError] = useState<string | null>(null)
  const [semanasCompletadas, setSemanasCompletadas] = useState<Set<string>>(new Set())
  const [materiaAcreditada, setMateriaAcreditada] = useState(false)
  const [glosario, setGlosario] = useState<{ id: string; termino: string; termino_en: string; definicion: string; definicion_en: string }[]>([])

  const [mostrarGuia, setMostrarGuia] = useState(true)
  const guiaRef = useRef<HTMLDivElement>(null)

  // Resetear guía cada vez que el alumno entra al tab examen
  useEffect(() => {
    if (tab === 'examen') setMostrarGuia(true)
  }, [tab])

  const ocultarGuia = () => {
    if (guiaRef.current) {
      gsap.to(guiaRef.current, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => setMostrarGuia(false),
      })
    } else {
      setMostrarGuia(false)
    }
  }

  const cardSigueRef = useRef<HTMLDivElement>(null)
  const todasCompletas = materia
    ? semanasCompletadas.size === materia.semanas.length && materia.semanas.length > 0
    : false

  useGSAP(() => {
    if (todasCompletas && cardSigueRef.current) {
      gsap.fromTo(
        cardSigueRef.current,
        { scale: 0.95, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' }
      )
    }
  }, { dependencies: [todasCompletas] })

  useEffect(() => {
    fetch(`/api/alumno/materia/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('No tienes acceso a esta materia')
        return r.json()
      })
      .then(data => {
        setMateria(data)
        // Default: primera semana hasta que cargue el progreso
        if (data.semanas?.length > 0) setSemanaSeleccionada(data.semanas[0].id)
        // Cargar glosario en paralelo (data.id = materia.id, no el id del mes)
        fetch(`/api/alumno/glosario/${data.id}`)
          .then(r => r.json())
          .then(g => { if (g.terminos) setGlosario(g.terminos) })
          .catch(() => {})
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  // Cargar progreso de semanas una vez que la materia está disponible
  useEffect(() => {
    if (!materia) return
    const semanaIds = materia.semanas.map(s => s.id)
    if (semanaIds.length === 0) return

    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: alumnoData } = await supabase
        .from('alumnos')
        .select('id')
        .eq('usuario_id', user.id)
        .single()
      if (!alumnoData) {
        setAlumnoError('No se pudo cargar tu perfil. Intenta recargar la página.')
        return
      }

      const { id: aId } = alumnoData as { id: string }
      setAlumnoId(aId)

      const { data: progreso } = await supabase
        .from('progreso_semanas')
        .select('semana_id')
        .eq('alumno_id', aId)
        .in('semana_id', semanaIds)

      if (progreso) {
        const completadasSet = new Set(progreso.map((r: { semana_id: string }) => r.semana_id))
        setSemanasCompletadas(completadasSet)

        // Seleccionar la primera semana no completada, o la última si todas están completas
        const primeraActiva = materia.semanas.find(s => !completadasSet.has(s.id))
        const defaultSemana = primeraActiva ?? materia.semanas[materia.semanas.length - 1]
        if (defaultSemana) setSemanaSeleccionada(defaultSemana.id)
      }
    })()
  }, [materia])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  if (error || !materia) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <p className="text-sm" style={{ color: '#EF4444' }}>{error ?? 'Materia no encontrada'}</p>
      <button type="button" onClick={() => router.back()} className="text-base min-h-[48px] px-4 rounded-xl touch-manipulation" style={{ color: '#5B6CFF' }}>Regresar</button>
    </div>
  )

  const tabs: { key: Tab; label: string }[] = [
    { key: 'contenido', label: t('subjects.tabContent') },
    { key: 'examen', label: t('subjects.tabExam') },
    { key: 'informacion', label: t('subjects.tabInfo') },
  ]

  const esTutorialMateria = materia.codigo?.toUpperCase().startsWith('TUT')
  const etiquetaUnidadLectura = esTutorialMateria
    ? (lang === 'en' ? 'Activity' : 'Actividad')
    : (lang === 'en' ? 'Week' : 'Semana')
  const etiquetaUnidadPlural = esTutorialMateria
    ? (lang === 'en' ? 'Activities' : 'Actividades')
    : (lang === 'en' ? 'Weeks' : 'Semanas')

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <FadeIn delay={0}>
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl touch-manipulation active:opacity-80 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(91,108,255,0.15)', color: '#7B8AFF' }}>
              {materia.codigo}
            </span>
            <div className="w-2 h-2 rounded-full" style={{ background: materia.color_hex || '#5B6CFF' }} />
          </div>
          <SplitTitle text={loc(materia.nombre, materia.nombre_en)} className="text-xl font-bold mt-1" style={{ color: '#F1F5F9' }} />
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
            >
              {t.label}
              {tab === t.key && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: '#5B6CFF' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
      </FadeIn>

      {/* Tab: Contenido */}
      <FadeIn delay={200}>
      {tab === 'contenido' && (
        <>
          {materia.semanas.length === 0 ? (
            <div className="flex items-center justify-center py-12 rounded-xl" style={CARD}>
              <p className="text-sm" style={{ color: '#94A3B8' }}>{t('subjects.noWeeks')}</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Columna izquierda: roadmap */}
              <div className="w-full md:w-1/3 rounded-xl p-5 flex-shrink-0" style={CARD}>
                <div className="overflow-y-auto max-h-[min(50vh,420px)] md:max-h-[calc(100vh-120px)] md:sticky md:top-4 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <WeekRoadmap
                    semanas={materia.semanas}
                    semanasCompletadas={semanasCompletadas}
                    semanaActivaId={semanaSeleccionada ?? undefined}
                    onSemanaClick={setSemanaSeleccionada}
                    lang={lang}
                    esTutorial={materia.codigo?.toUpperCase().startsWith('TUT')}
                  />
                </div>
              </div>

              {/* Columna derecha: contenido de la semana seleccionada */}
              <div className="flex-1 min-w-0 space-y-4">
                {(() => {
                  const semana = materia.semanas.find(s => s.id === semanaSeleccionada)
                  if (!semana) return (
                    <div className="flex items-center justify-center py-16 rounded-xl" style={CARD}>
                      <p className="text-sm" style={{ color: '#94A3B8' }}>
                        {esTutorialMateria
                          ? (lang === 'en' ? 'Select an activity to get started' : 'Selecciona una actividad para comenzar')
                          : (lang === 'en' ? 'Select a week to get started' : 'Selecciona una semana para comenzar')}
                      </p>
                    </div>
                  )
                  return (
                    <div className="rounded-xl p-5 space-y-4" style={CARD}>
                      {/* Header de la semana */}
                      <div className="pb-3" style={{ borderBottom: '1px solid #2A2F3E' }}>
                        <span className="text-xs font-mono" style={{ color: '#6366F1' }}>
                          {etiquetaUnidadLectura} {semana.numero}
                        </span>
                        <h3 className="text-base font-bold mt-0.5" style={{ color: '#F1F5F9' }}>
                          {loc(semana.titulo, semana.titulo_en)}
                        </h3>
                        {/* Tiempo estimado de lectura y videos */}
                        {(() => {
                          const contenidoActual = loc(semana.contenido, semana.contenido_en) || ''
                          const palabras = contenidoActual.trim() ? contenidoActual.trim().split(/\s+/).length : 0
                          const minLectura = palabras > 0 ? Math.ceil(palabras / 200) : 0
                          const minVideos = (semana.videos ?? []).reduce((acc, v) => {
                            const match = v.duracion?.match(/(\d+)/)
                            return acc + (match ? parseInt(match[1]) : 0)
                          }, 0)
                          const partes = []
                          if (minLectura > 0) partes.push(`📖 ${minLectura} min ${lang === 'en' ? 'reading' : 'lectura'}`)
                          if (minVideos > 0) partes.push(`🎬 ${minVideos} min ${lang === 'en' ? 'of videos' : 'de videos'}`)
                          if (partes.length === 0) return null
                          return (
                            <p className="text-xs mt-1.5" style={{ color: '#64748B' }}>
                              {partes.join(' · ')}
                            </p>
                          )
                        })()}
                      </div>

                      {/* Contenido */}
                      {(lang === 'en' ? (semana.contenido_en || semana.contenido) : semana.contenido) && (
                        <div className="space-y-1">
                          {renderTexto(loc(semana.contenido, semana.contenido_en))}
                        </div>
                      )}

                      {/* Error de perfil: muestra banner si quiz y notas no pudieron cargarse */}
                      {!alumnoId && alumnoError && (
                        <div
                          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
                          style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#FCA5A5',
                          }}
                        >
                          <span className="mt-px flex-shrink-0">⚠</span>
                          <span>{alumnoError}</span>
                        </div>
                      )}

                      {/* Mini quiz de refuerzo */}
                      {alumnoId && (
                        <SemanaQuiz
                          semanaId={semana.id}
                          alumnoId={alumnoId}
                          lang={lang}
                        />
                      )}

                      {/* Videos */}
                      {(semana.videos?.length > 0 || (lang === 'en' && semana.url_en)) && (
                        <div className="space-y-2 pt-2">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{t('subjects.videos')}</p>

                          {lang === 'en' && semana.url_en && (
                            <a
                              href={semana.url_en}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 px-4 min-h-[48px] rounded-xl touch-manipulation active:opacity-90"
                              style={{ ...INPUT_BG, border: '1px solid rgba(91,108,255,0.3)' }}
                            >
                              <PlayCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#7B8AFF' }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: '#F1F5F9' }}>{loc(semana.titulo, semana.titulo_en)} — English Version</p>
                                <p className="text-xs mt-0.5" style={{ color: '#7B8AFF' }}>EN</p>
                              </div>
                            </a>
                          )}

                          {semana.videos.map((v, i) => (
                            <VideoEmbed
                              key={i}
                              url={loc(v.url, v.url_en)}
                              titulo={loc(v.titulo, v.titulo_en)}
                              duracion={v.duracion}
                              lang={lang}
                            />
                          ))}
                        </div>
                      )}

                      {/* Notas personales */}
                      {alumnoId && (
                        <NotasPersonales
                          semanaId={semana.id}
                          alumnoId={alumnoId}
                          lang={lang}
                        />
                      )}

                      {/* Progreso / CTA al final de la semana (texto, quiz, videos, notas) — visible al hacer scroll hasta el final */}
                      <ReadingProgress
                        semanaId={semana.id}
                        alumnoId={alumnoId}
                        lang={lang}
                        yaCompletada={semanasCompletadas.has(semana.id)}
                        onCompletada={() => {
                          const nuevas = new Set([...semanasCompletadas, semana.id])
                          setSemanasCompletadas(nuevas)
                          if (materia && materia.semanas.every(s => nuevas.has(s.id))) {
                            setMateriaAcreditada(true)
                          }
                        }}
                      />
                    </div>
                  )
                })()}

                {/* Card ¿Qué sigue? — aparece cuando todas las semanas están completadas */}
                {todasCompletas && (
                  <div
                    ref={cardSigueRef}
                    className="rounded-xl p-6 flex flex-col items-center text-center gap-4"
                    style={{
                      background: '#1E2535',
                      border: '1px solid rgba(99,102,241,0.35)',
                      boxShadow: '0 0 24px rgba(99,102,241,0.08)',
                    }}
                  >
                    {/* Ícono */}
                    <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>🎯</span>

                    {/* Título */}
                    <div className="space-y-1">
                      <h3 className="text-base font-bold" style={{ color: '#F1F5F9' }}>
                        {lang === 'en' ? 'Subject completed!' : '¡Materia completada!'}
                      </h3>
                      <p className="text-sm" style={{ color: '#94A3B8' }}>
                        {lang === 'en'
                          ? 'You can now take your final exam'
                          : 'Ya puedes presentar tu examen final'}
                      </p>
                    </div>

                    {/* Botón primario */}
                    <button
                      type="button"
                      onClick={() => setTab('examen')}
                      className="w-full min-h-[52px] rounded-xl text-base font-semibold touch-manipulation active:opacity-90"
                      style={{ background: '#5B6CFF', color: '#fff', border: 'none' }}
                    >
                      {lang === 'en' ? 'Go to exam →' : 'Ir al examen →'}
                    </button>

                    {/* Separador */}
                    <p className="text-xs" style={{ color: '#475569' }}>— {lang === 'en' ? 'or' : 'o'} —</p>

                    {/* Texto secundario */}
                    <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>
                      {lang === 'en'
                        ? "Continue to the next month when you're ready"
                        : 'Continúa con el siguiente mes cuando estés listo'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab: Examen */}
      {tab === 'examen' && (
        <div className="space-y-4">

          {/* Guía de estudio — aparece antes del examen */}
          {mostrarGuia && (() => {
            const pendientes = materia.semanas.filter(s => !semanasCompletadas.has(s.id)).length
            const termsPills = glosario.slice(0, 4)
            return (
              <div
                ref={guiaRef}
                className="rounded-xl p-5 space-y-5"
                style={{ background: '#1A1F2E', border: '1px solid #2A2F3E' }}
              >
                {/* Encabezado */}
                <div className="space-y-0.5">
                  <h3 className="text-base font-bold" style={{ color: '#F1F5F9' }}>
                    {lang === 'en' ? 'Prepare for the exam' : 'Prepárate para el examen'}
                  </h3>
                  <p className="text-sm" style={{ color: '#64748B' }}>
                    {lang === 'en'
                      ? 'Review these key points before starting'
                      : 'Repasa estos puntos clave antes de comenzar'}
                  </p>
                </div>

                {/* Alerta semanas pendientes */}
                {pendientes > 0 && (
                  <div
                    className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm"
                    style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}
                  >
                    <span style={{ fontSize: '1rem', lineHeight: 1.4 }}>⚠️</span>
                    <p style={{ color: '#FDE68A' }}>
                      {lang === 'en'
                        ? esTutorialMateria
                          ? `You have ${pendientes} pending ${pendientes === 1 ? 'activity' : 'activities'}. We recommend completing ${pendientes === 1 ? 'it' : 'them'} before the exam.`
                          : `You have ${pendientes} pending week${pendientes !== 1 ? 's' : ''}. We recommend completing ${pendientes === 1 ? 'it' : 'them'} before the exam.`
                        : esTutorialMateria
                          ? `Tienes ${pendientes} actividad${pendientes !== 1 ? 'es' : ''} pendiente${pendientes !== 1 ? 's' : ''}. Te recomendamos completarlas antes del examen.`
                          : `Tienes ${pendientes} semana${pendientes !== 1 ? 's' : ''} pendiente${pendientes !== 1 ? 's' : ''}. Te recomendamos completarlas antes del examen.`}
                    </p>
                  </div>
                )}

                {/* Checklist de semanas */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>
                    {etiquetaUnidadPlural}
                  </p>
                  <ul className="space-y-1.5">
                    {materia.semanas.map(s => {
                      const completa = semanasCompletadas.has(s.id)
                      return (
                        <li key={s.id} className="flex items-center gap-2.5 text-sm">
                          <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>
                            {completa ? '✅' : '⚪'}
                          </span>
                          <span style={{ color: completa ? '#CBD5E1' : '#475569' }}>
                            {loc(s.titulo, s.titulo_en)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                {/* Términos importantes */}
                {termsPills.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#475569' }}>
                      {lang === 'en' ? 'Key terms' : 'Términos importantes'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {termsPills.map(term => (
                        <span
                          key={term.id}
                          className="px-3 py-1 rounded-full text-xs font-medium"
                          style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.25)' }}
                        >
                          {lang === 'en' ? term.termino_en : term.termino}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botón comenzar */}
                <button
                  type="button"
                  onClick={ocultarGuia}
                  className="w-full min-h-[52px] rounded-xl text-base font-semibold touch-manipulation active:opacity-90"
                  style={{ background: '#5B6CFF', color: '#fff', border: 'none' }}
                >
                  {lang === 'en' ? "I'm ready — start exam →" : 'Ya estoy listo — comenzar examen →'}
                </button>
              </div>
            )
          })()}

          {/* Evaluaciones — se muestran al ocultar la guía */}
          {!mostrarGuia && (materia.evaluaciones.length === 0 ? (
            <div className="flex items-center justify-center py-12 rounded-xl" style={CARD}>
              <p className="text-sm" style={{ color: '#94A3B8' }}>{t('subjects.noExams')}</p>
            </div>
          ) : (
            materia.evaluaciones.map(ev => {
              const intentosRestantes = ev.intentos_max - ev.intentos_usados
              return (
                <div key={ev.id} className="rounded-xl p-5 space-y-4" style={CARD}>
                  <div>
                    <h3 className="text-base font-semibold" style={{ color: '#F1F5F9' }}>{loc(ev.titulo, ev.titulo_en)}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm" style={{ color: '#94A3B8' }}>
                      <span>{t('subjects.attemptsLabel')} {ev.intentos_usados}/{ev.intentos_max}</span>
                    </div>
                  </div>

                  {ev.aprobada ? (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <span className="text-lg">✓</span>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: '#10B981' }}>{t('subjects.alreadyPassed')}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                          {t('subjects.gradeLabel')} <strong style={{ color: '#10B981' }}>{ev.calificacion_aprobatoria}</strong>
                        </p>
                      </div>
                    </div>
                  ) : intentosRestantes <= 0 ? (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <span className="text-lg">✗</span>
                      <p className="text-sm font-semibold" style={{ color: '#EF4444' }}>{t('subjects.noAttemptsLeft')}</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => router.push(`/alumno/evaluacion/${ev.id}`)}
                      className="w-full min-h-[52px] rounded-xl text-base font-semibold touch-manipulation active:opacity-90 px-3"
                      style={{ background: '#5B6CFF', color: '#fff' }}
                    >
                      {t('subjects.takeExam')} ({intentosRestantes} {intentosRestantes !== 1 ? t('subjects.attemptPlural') : t('subjects.attemptSingular')} {intentosRestantes !== 1 ? t('subjects.availablePlural') : t('subjects.availableSingular')})
                    </button>
                  )}
                </div>
              )
            })
          ))}
        </div>
      )}

      {/* Tab: Información */}
      {tab === 'informacion' && (
        <div className="space-y-4">
          {/* Descripción / Objetivo */}
          {(materia.descripcion || materia.objetivo) && (
            <div className="rounded-xl p-5 space-y-2" style={CARD}>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>{t('subjects.descriptionLabel')}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>
                {loc(materia.descripcion || materia.objetivo, materia.descripcion_en)}
              </p>
            </div>
          )}
          {/* Objetivo (solo si es distinto de descripción) */}
          {materia.objetivo && materia.objetivo !== materia.descripcion && (
            <div className="rounded-xl p-5 space-y-2" style={CARD}>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>{t('subjects.objectiveLabel')}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>{loc(materia.objetivo, materia.objetivo_en)}</p>
            </div>
          )}

          {/* Syllabus: títulos de semanas + un solo temario (ES o EN según idioma) */}
          {(() => {
            const temas = (lang === 'en' && materia.temario_en?.length) ? materia.temario_en : (materia.temario ?? [])
            const haySemanas = materia.semanas?.length > 0
            const hayTemas = temas.length > 0
            if (!haySemanas && !hayTemas) return null
            return (
              <div className="rounded-xl p-5 space-y-3" style={CARD}>
                <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>{t('subjects.syllabus')}</h3>
                {haySemanas && (
                  <ol className="space-y-2">
                    {materia.semanas!.map(semana => (
                      <li key={semana.id} className="flex items-start gap-3 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold" style={{ background: 'rgba(91,108,255,0.15)', color: '#5B6CFF' }}>
                          {semana.numero}
                        </span>
                        <span style={{ color: '#94A3B8' }}>{loc(semana.titulo, semana.titulo_en)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {hayTemas && (
                  <ol className="space-y-2">
                    {temas.map((tema, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold" style={{ background: 'rgba(91,108,255,0.15)', color: '#5B6CFF' }}>
                          {i + 1}
                        </span>
                        <span style={{ color: '#94A3B8' }}>{tema}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )
          })()}

          {/* Bibliografía: loc(bibliografia, bibliografia_en) con fallback */}
          {((lang === 'en' && materia.bibliografia_en?.length) ? materia.bibliografia_en : materia.bibliografia)?.length > 0 && (
            <div className="rounded-xl p-5 space-y-3" style={CARD}>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>{t('subjects.bibliography')}</h3>
              <ul className="space-y-2">
                {(lang === 'en' && materia.bibliografia_en?.length ? materia.bibliografia_en : materia.bibliografia).map((bib, i) => {
                  const etiqueta = bib.tipo ? `${bib.titulo} (${bib.tipo})` : bib.titulo
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#5B6CFF' }} />
                      {bib.url ? (
                        <a
                          href={bib.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm transition-colors"
                          style={{ color: '#5B6CFF' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#7B8AFF' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#5B6CFF' }}
                        >
                          {etiqueta}
                        </a>
                      ) : (
                        <span className="text-sm" style={{ color: '#94A3B8' }}>{etiqueta}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Glosario */}
          {glosario.length > 0 && (
            <div className="rounded-xl p-5 space-y-4" style={CARD}>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
                {lang === 'en' ? 'Glossary' : 'Glosario'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {glosario.map(t => (
                  <div
                    key={t.id}
                    className="px-4 py-3 rounded-lg space-y-1"
                    style={{
                      background: 'rgba(91,108,255,0.04)',
                      borderLeft: '3px solid rgba(91,108,255,0.4)',
                      border: '1px solid #2A2F3E',
                      borderLeftWidth: '3px',
                      borderLeftColor: 'rgba(91,108,255,0.5)',
                    }}
                  >
                    <p className="text-sm font-semibold" style={{ color: '#7B8AFF' }}>
                      {lang === 'en' ? t.termino_en : t.termino}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>
                      {lang === 'en' ? t.definicion_en : t.definicion}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      </FadeIn>

      {materiaAcreditada && (
        <CelebrationBanner
          materiaNombre={materia.nombre}
          materiaNombre_en={materia.nombre_en}
          lang={lang}
          onClose={() => setMateriaAcreditada(false)}
        />
      )}
    </div>
  )
}
