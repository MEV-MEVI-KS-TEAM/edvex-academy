'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, CheckCircle, ChevronDown, ChevronRight,
  Save, Video, ExternalLink, ImageOff,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ToastContainer, useToast } from '@/components/ui/toast'
import { BunnyVistaPrevia } from '@/components/admin/BunnyVistaPrevia'
import { esBunnyUrl } from '@/lib/video/bunny-url'

/* ---------- types ---------- */
interface VideoItem { titulo: string; url: string; duracion: string; titulo_en?: string | null; url_en?: string | null }
interface Opcion   { id: string; texto: string; es_correcta: boolean }
interface Pregunta { id: string; numero: number; texto: string; tipo: string; retroalimentacion: string | null; opciones: Opcion[] }
interface Evaluacion { id: string; titulo: string; tipo: string; intentos_max: number; preguntas: Pregunta[] }
interface Semana   { id: string; numero: number; titulo: string; contenido: string; videos: VideoItem[] | null }
interface Materia  {
  id: string; codigo: string; nombre: string; color_hex: string
  descripcion: string; objetivo: string; temario: string[]
  semanas: Semana[]
  evaluaciones: Evaluacion[]
}

/* ---------- constants ---------- */
const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }
const VIDEO_LABELS = ['Video 1 (principal)', 'Video 2', 'Video 3']

/* ---------- helpers ---------- */
function extractYouTubeId(url: string): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function getOriginalUrls(semana: Semana): string[] {
  const vids = semana.videos ?? []
  return [0, 1, 2].map(i => vids[i]?.url ?? '')
}

/* ============================================================= */
export default function ContenidoDetallePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { toasts, showToast, removeToast } = useToast()

  const [materia, setMateria]   = useState<Materia | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // video editing state
  const [openSemanas, setOpenSemanas] = useState<Set<string>>(new Set())
  const [localUrls, setLocalUrls]     = useState<Record<string, string[]>>({})
  const [saving, setSaving]           = useState<Record<string, boolean>>({})

  /* --- load data --- */
  useEffect(() => {
    const supabase = createClient()
    async function cargar() {
      try {
        const { data: materiaBase, error: matErr } = await supabase
          .from('materias').select('*').eq('id', id).single()
        if (matErr || !materiaBase) { setError('Materia no encontrada'); return }

        const { data: semanas } = await supabase
          .from('semanas').select('*').eq('materia_id', id).order('numero')

        const { data: evaluaciones } = await supabase
          .from('evaluaciones').select('*').eq('materia_id', id)

        const evaluacionesConPreguntas: Evaluacion[] = await Promise.all(
          ((evaluaciones ?? []) as { id: string; titulo: string; tipo: string; intentos_max: number }[]).map(async (ev) => {
            const { data: preguntas } = await supabase
              .from('preguntas').select('*, opciones(*)').eq('evaluacion_id', ev.id).order('numero')
            return { ...ev, preguntas: (preguntas ?? []) as Pregunta[] }
          })
        )

        setMateria({
          ...(materiaBase as unknown as Materia),
          semanas: (semanas ?? []) as Semana[],
          evaluaciones: evaluacionesConPreguntas,
        })
      } catch {
        setError('Error al cargar la materia')
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [id])

  /* --- semana toggle --- */
  function toggleSemana(semanaId: string, semana: Semana) {
    setOpenSemanas(prev => {
      const next = new Set(prev)
      if (next.has(semanaId)) {
        next.delete(semanaId)
      } else {
        next.add(semanaId)
        // initialize local URLs if first time opening
        if (!localUrls[semanaId]) {
          setLocalUrls(p => ({ ...p, [semanaId]: getOriginalUrls(semana) }))
        }
      }
      return next
    })
  }

  /* --- url editing --- */
  function handleUrlChange(semanaId: string, index: number, value: string) {
    setLocalUrls(prev => {
      const arr = [...(prev[semanaId] ?? ['', '', ''])]
      arr[index] = value
      return { ...prev, [semanaId]: arr }
    })
  }

  function hasChanges(semanaId: string, semana: Semana): boolean {
    const local = localUrls[semanaId]
    if (!local) return false
    const original = getOriginalUrls(semana)
    return local.some((url, i) => url !== original[i])
  }

  /* --- save --- */
  async function handleSave(semana: Semana) {
    const urls = localUrls[semana.id]
    if (!urls) return

    setSaving(prev => ({ ...prev, [semana.id]: true }))

    // Build videos array – only include non-empty URLs
    // Si la URL de ese lugar no cambió, se conservan sus campos en inglés
    // (titulo_en, url_en): guardar sin tocarla no debe borrar la versión en inglés.
    const videos: VideoItem[] = urls
      .map((url, i) => {
        const previo = semana.videos?.[i]
        const igual = !!previo && previo.url === url.trim()
        return {
          ...(igual && previo.titulo_en !== undefined ? { titulo_en: previo.titulo_en } : {}),
          ...(igual && previo.url_en !== undefined ? { url_en: previo.url_en } : {}),
          titulo: previo?.titulo || VIDEO_LABELS[i],
          url: url.trim(),
          duracion: previo?.duracion ?? '',
        }
      })
      .filter(v => v.url !== '')

    try {
      const res = await fetch(`/api/admin/contenido/semanas/${semana.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos }),
      })
      if (!res.ok) {
        const data = await res.json()
        showToast(data.error ?? 'Error al guardar', 'error')
        return
      }

      // Update materia state with new videos
      setMateria(prev => {
        if (!prev) return prev
        return {
          ...prev,
          semanas: prev.semanas.map(s =>
            s.id === semana.id ? { ...s, videos } : s
          ),
        }
      })
      // Reset local URLs to match saved state
      const newOriginal = [0, 1, 2].map(i => videos[i]?.url ?? '')
      setLocalUrls(prev => ({ ...prev, [semana.id]: newOriginal }))

      showToast(`Videos de semana ${semana.numero} actualizados`, 'success')
    } catch {
      showToast('Error inesperado al guardar', 'error')
    } finally {
      setSaving(prev => ({ ...prev, [semana.id]: false }))
    }
  }

  /* ---------- rendering ---------- */

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  if (error || !materia) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <p className="text-sm" style={{ color: '#EF4444' }}>{error ?? 'Error'}</p>
      <button onClick={() => router.back()} className="text-sm" style={{ color: '#5B6CFF' }}>Regresar</button>
    </div>
  )

  const semanasOrdenadas = [...(materia.semanas ?? [])].sort((a, b) => a.numero - b.numero)

  return (
    <div className="space-y-6 max-w-4xl">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push('/admin/contenido')}
          className="mt-1 p-2 rounded-lg transition-all flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: materia.color_hex || '#5B6CFF' }} />
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(91,108,255,0.15)', color: '#7B8AFF' }}>
              {materia.codigo}
            </span>
          </div>
          <h2 className="text-xl font-bold mt-1" style={{ color: '#F1F5F9' }}>{materia.nombre}</h2>
        </div>
      </div>

      {/* Info */}
      {(materia.descripcion || materia.objetivo) && (
        <div className="rounded-xl p-5 space-y-4" style={CARD}>
          <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Información</h3>
          {materia.descripcion && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Descripción</p>
              <p className="text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>{materia.descripcion}</p>
            </div>
          )}
          {materia.objetivo && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Objetivo</p>
              <p className="text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>{materia.objetivo}</p>
            </div>
          )}
        </div>
      )}

      {/* ====== Semanas con Videos ====== */}
      {semanasOrdenadas.length > 0 && (
        <div className="rounded-xl p-5 space-y-3" style={CARD}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Semanas y Videos</h3>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
              {semanasOrdenadas.length} semanas
            </span>
          </div>

          <div className="space-y-2">
            {semanasOrdenadas.map(sem => {
              const isOpen = openSemanas.has(sem.id)
              const videoCount = (sem.videos ?? []).length
              const changed = hasChanges(sem.id, sem)
              const isSaving = saving[sem.id] ?? false

              return (
                <div key={sem.id} className="rounded-xl overflow-hidden" style={{ background: '#0D1017', border: '1px solid #2A2F3E' }}>
                  {/* Semana header (click to expand) */}
                  <button
                    onClick={() => toggleSemana(sem.id, sem)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left transition-all"
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold flex-shrink-0"
                        style={{ background: 'rgba(91,108,255,0.2)', color: '#5B6CFF' }}
                      >
                        {sem.numero}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#F1F5F9' }}>{sem.titulo}</p>
                        {sem.contenido && (
                          <p className="text-xs truncate mt-0.5" style={{ color: '#64748B' }}>
                            {sem.contenido.replace(/\*\*(.*?)\*\*/g, '$1').slice(0, 80)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: videoCount > 0 ? 'rgba(91,108,255,0.1)' : 'rgba(148,163,184,0.1)', color: videoCount > 0 ? '#7B8AFF' : '#64748B' }}>
                        <Video className="w-3 h-3" />
                        {videoCount}
                      </span>
                      {isOpen
                        ? <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />
                        : <ChevronRight className="w-4 h-4" style={{ color: '#94A3B8' }} />
                      }
                    </div>
                  </button>

                  {/* Expanded: video editing area */}
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid #1E2130' }}>
                      <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[0, 1, 2].map(idx => {
                          const url = localUrls[sem.id]?.[idx] ?? ''
                          const ytId = extractYouTubeId(url)
                          const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null

                          return (
                            <div key={idx} className="space-y-2">
                              {/* Label */}
                              <p className="text-xs font-medium" style={{ color: idx === 0 ? '#7B8AFF' : '#64748B' }}>
                                {VIDEO_LABELS[idx]}
                              </p>

                              {/* Thumbnail (video propio: vista previa firmada por el servidor) */}
                              {esBunnyUrl(url) ? (
                                <BunnyVistaPrevia url={url} titulo={sem.titulo} oscuro />
                              ) : (
                              <div
                                className="relative rounded-lg overflow-hidden flex items-center justify-center"
                                style={{ background: '#181C26', border: '1px solid #2A2F3E', aspectRatio: '16/9' }}
                              >
                                {thumbUrl ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={thumbUrl}
                                      alt={VIDEO_LABELS[idx]}
                                      className="absolute inset-0 w-full h-full object-cover"
                                    />
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="absolute top-1.5 right-1.5 p-1 rounded-md transition-all"
                                      style={{ background: 'rgba(0,0,0,0.6)', color: '#F1F5F9' }}
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <ImageOff className="w-6 h-6" style={{ color: '#334155' }} />
                                    <span className="text-[10px]" style={{ color: '#475569' }}>
                                      {url ? 'URL no válida' : 'Sin video'}
                                    </span>
                                  </div>
                                )}
                              </div>
                              )}

                              {/* URL input */}
                              <input
                                type="text"
                                placeholder="https://youtube.com/watch?v=..."
                                value={url}
                                onChange={e => handleUrlChange(sem.id, idx, e.target.value)}
                                className="w-full text-xs rounded-lg px-3 py-2 outline-none transition-all focus:ring-1"
                                style={{
                                  background: '#181C26',
                                  border: '1px solid #2A2F3E',
                                  color: '#F1F5F9',
                                }}
                                onFocus={e => { e.currentTarget.style.borderColor = '#5B6CFF' }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#2A2F3E' }}
                              />
                            </div>
                          )
                        })}
                      </div>

                      {/* Save button */}
                      {changed && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleSave(sem)}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-60"
                            style={{
                              background: 'rgba(91,108,255,0.15)',
                              color: '#7B8AFF',
                              border: '1px solid rgba(91,108,255,0.3)',
                            }}
                            onMouseEnter={e => { if (!isSaving) e.currentTarget.style.background = 'rgba(91,108,255,0.25)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.15)' }}
                          >
                            {isSaving
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Save className="w-4 h-4" />
                            }
                            {isSaving ? 'Guardando…' : 'Guardar videos'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ====== Evaluaciones ====== */}
      {(materia.evaluaciones ?? []).length > 0 && materia.evaluaciones.map(ev => (
        <div key={ev.id} className="rounded-xl p-5 space-y-4" style={CARD}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>{ev.titulo}</h3>
              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                {ev.tipo} · {ev.intentos_max} intento{ev.intentos_max !== 1 ? 's' : ''} máx · {(ev.preguntas ?? []).length} preguntas
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
              Evaluación
            </span>
          </div>

          <div className="space-y-4">
            {(ev.preguntas ?? []).sort((a, b) => a.numero - b.numero).map((preg, pi) => (
              <div key={preg.id} className="rounded-lg p-4 space-y-3" style={{ background: '#0D1017', border: '1px solid #2A2F3E' }}>
                <div className="flex items-start gap-3">
                  <span
                    className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(91,108,255,0.2)', color: '#5B6CFF' }}
                  >
                    {pi + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: '#F1F5F9' }}>{preg.texto}</p>
                    <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(148,163,184,0.1)', color: '#94A3B8' }}>
                      {preg.tipo}
                    </span>
                  </div>
                </div>

                {(preg.opciones ?? []).length > 0 && (
                  <div className="ml-9 space-y-1.5">
                    {preg.opciones.map(op => (
                      <div
                        key={op.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                        style={op.es_correcta
                          ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10B981' }
                          : { background: 'rgba(255,255,255,0.03)', border: '1px solid #2A2F3E', color: '#94A3B8' }
                        }
                      >
                        {op.es_correcta && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#10B981' }} />}
                        <span>{op.texto}</span>
                      </div>
                    ))}
                  </div>
                )}

                {preg.retroalimentacion && (
                  <div className="ml-9 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(91,108,255,0.06)', border: '1px solid rgba(91,108,255,0.15)', color: '#94A3B8' }}>
                    <span className="font-semibold" style={{ color: '#7B8AFF' }}>Retroalimentación: </span>
                    {preg.retroalimentacion}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
