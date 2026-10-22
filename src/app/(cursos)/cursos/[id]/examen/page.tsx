'use client'

/**
 * Examen final de curso — vista del alumno. Port de la plantilla PV con los
 * colores de EDVEX (EDVEX no emite constancias de curso: sin esos avisos).
 *
 * Diseño deliberadamente simple: TODAS las preguntas en una sola vista
 * scrolleable, sin cronómetro y sin autosave. Cada envío es un resultado nuevo,
 * así que el historial sale gratis.
 *
 * Las preguntas llegan SANITIZADAS de la API (sin respuesta correcta ni
 * explicación). La calificación y la revisión solo aparecen después de enviar,
 * calculadas en el servidor.
 *
 * Los intentos SÍ están limitados, y el candado real vive en la ruta: lo de aquí
 * es solo cortesía visual para no dejar al alumno mandar un envío que el
 * servidor va a rechazar. La revisión, además, solo trae la respuesta correcta
 * de las preguntas que el alumno contestó.
 *
 * D22d: aprobar CIERRA el examen (K-d2): ya no hay «Volver a intentar» después de
 * aprobar. Y mientras quede reintento, la revisión es DIFERIDA (K-d3): puntaje y
 * desglose por tema, sin ✓/✗ por pregunta ni respuestas correctas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { INTENTOS_PERMITIDOS_DEFAULT } from '@/lib/cursos/examen'
import type {
  DesgloseTema, Letra, PreguntaSanitizada, ResultadoHistorial, RevisionPregunta,
} from '@/types/cursos-examen'

const LETRAS: Letra[] = ['a', 'b', 'c', 'd']

interface Calificado {
  aciertos: number
  total: number
  porcentaje: number
  desglose_temas: DesgloseTema[]
  revision: RevisionPregunta[]
  aprobado?: boolean
  /** false = revisión diferida: todavía puede volver a presentar. */
  revision_completa?: boolean
}

/** Listado de intentos previos. Se usa en la vista de resultados y, antes de
 *  contestar, en el aviso de "ya presentaste este examen". */
function ListaHistorial({ items }: { items: ResultadoHistorial[] }) {
  return (
    <div className="rounded-2xl p-4 space-y-2" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
      {items.map(h => (
        <div key={h.id} className="flex justify-between text-xs py-1">
          <span style={{ color: '#94A3B8' }}>
            {new Date(h.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span className="font-semibold" style={{ color: '#CBD5E1' }}>
            {h.aciertos}/{h.total} · {Math.round(Number(h.porcentaje))}%
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ExamenCursoPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const cursoId = params.id

  const [preguntas, setPreguntas] = useState<PreguntaSanitizada[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [respuestas, setRespuestas] = useState<Record<string, Letra>>({})
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [resultado, setResultado] = useState<Calificado | null>(null)
  const [historial, setHistorial] = useState<ResultadoHistorial[]>([])
  // Arranca en el fallback y se sustituye por el valor del curso al cargar.
  const [intentosPermitidos, setIntentosPermitidos] = useState(INTENTOS_PERMITIDOS_DEFAULT)
  const [verHistorial, setVerHistorial] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ya aprobó en un envío anterior: el examen está cerrado (K-d2).
  const [aprobadoPrevio, setAprobadoPrevio] = useState(false)

  const cargarHistorial = useCallback(() => {
    fetch(`/api/alumno/cursos/${cursoId}/examen/resultados`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { historial: ResultadoHistorial[] } | null) => setHistorial(j?.historial ?? []))
      .catch(() => { /* el historial es accesorio: si falla, no rompe el examen */ })
  }, [cursoId])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/alumno/cursos/${cursoId}/examen`)
      .then(async r => {
        if (r.status === 404) { if (!cancelled) router.replace(`/alumno/curso/${cursoId}`); return null }
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((j: { preguntas: PreguntaSanitizada[]; intentos_permitidos?: number; aprobado?: boolean } | null) => {
        if (!j || cancelled) return
        setPreguntas(j.preguntas)
        setAprobadoPrevio(j.aprobado === true)
        // Límite POR CURSO (cursos.intentos_permitidos). Si la API no lo manda
        // se conserva el fallback, nunca "sin límite".
        if (typeof j.intentos_permitidos === 'number' && j.intentos_permitidos > 0) {
          setIntentosPermitidos(j.intentos_permitidos)
        }
      })
      .catch(() => { if (!cancelled) setError('No se pudo cargar el examen.') })
      .finally(() => { if (!cancelled) setCargando(false) })
    cargarHistorial()
    return () => { cancelled = true }
  }, [cursoId, router, cargarHistorial])

  const contestadas = useMemo(() => Object.keys(respuestas).length, [respuestas])
  const total = preguntas?.length ?? 0
  const faltantes = total - contestadas

  // El historial trae un renglón por envío, así que los intentos usados salen
  // gratis del fetch que ya se hacía. El límite de verdad lo aplica la ruta.
  const intentosRestantes = Math.max(0, intentosPermitidos - historial.length)
  const sinIntentos = intentosRestantes === 0

  const elegir = (preguntaId: string, letra: Letra) =>
    setRespuestas(prev => ({ ...prev, [preguntaId]: letra }))

  const enviar = useCallback(async () => {
    if (!preguntas) return
    setEnviando(true)
    setError(null)
    setConfirmar(false)
    try {
      const res = await fetch(`/api/alumno/cursos/${cursoId}/examen/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Se mandan TODAS: las no contestadas van en null y cuentan como error.
          respuestas: preguntas.map(p => ({ pregunta_id: p.id, respuesta: respuestas[p.id] ?? null })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar el examen')
      setResultado(json as Calificado)
      cargarHistorial()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el examen')
    } finally {
      setEnviando(false)
    }
  }, [cursoId, preguntas, respuestas, cargarHistorial])

  const reintentar = () => {
    setResultado(null)
    setRespuestas({})
    setVerHistorial(false)
    window.scrollTo({ top: 0 })
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#F1F5F9' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-5 py-3"
        style={{ background: '#12151C', borderBottom: '1px solid #2A2F3E', color: '#F1F5F9' }}
      >
        <button
          onClick={() => router.push(`/alumno/curso/${cursoId}`)}
          className="p-1.5 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF' }}
          aria-label="Volver al curso"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm sm:text-base font-bold truncate leading-tight">Examen final</h1>
          <p className="text-[11px]" style={{ color: '#94A3B8' }}>
            {resultado ? `${resultado.aciertos} de ${resultado.total} aciertos` : aprobadoPrevio ? 'Aprobado' : `${contestadas} de ${total} contestadas`}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">

          {error && (
            <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.3)' }}>
              {error}
            </div>
          )}

          {/* ── RESULTADOS ── */}
          {resultado && (
            <>
              <div className="rounded-2xl p-5 text-center" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
                <p className="text-4xl sm:text-5xl font-bold" style={{ color: '#F1F5F9' }}>
                  {resultado.aciertos}<span className="text-2xl" style={{ color: '#94A3B8' }}>/{resultado.total}</span>
                </p>
                <p className="text-lg font-semibold mt-1" style={{ color: '#F1F5F9' }}>
                  {Math.round(resultado.porcentaje)}%
                </p>
              </div>

              {resultado.desglose_temas.length > 0 && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
                  <h2 className="text-sm font-bold" style={{ color: '#F1F5F9' }}>Por tema</h2>
                  {resultado.desglose_temas.map(t => {
                    const pct = t.total === 0 ? 0 : Math.round((t.aciertos / t.total) * 100)
                    return (
                      <div key={t.tema}>
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color: '#CBD5E1' }}>{t.tema}</span>
                          <span className="font-semibold" style={{ color: '#94A3B8' }}>{t.aciertos}/{t.total}</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#2A2F3E' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#5B6CFF' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {resultado.aprobado && (
                <div className="rounded-2xl p-4 text-sm" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.3)' }}>
                  ¡Aprobaste el examen final!
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                {/* Aprobar cierra el examen (K-d2): no hay reintento después de aprobar. */}
                {!resultado.aprobado && <button
                  onClick={reintentar}
                  disabled={sinIntentos}
                  className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold flex-1"
                  style={
                    sinIntentos
                      ? { background: 'rgba(148,163,184,0.08)', color: '#94A3B8', cursor: 'not-allowed' }
                      : { background: '#5B6CFF', color: '#fff' }
                  }
                >
                  <RotateCcw className="w-4 h-4" />
                  {sinIntentos
                    ? 'Sin intentos disponibles'
                    : `Volver a intentar (${intentosRestantes} ${intentosRestantes === 1 ? 'restante' : 'restantes'})`}
                </button>}
                <button
                  onClick={() => setVerHistorial(v => !v)}
                  className="rounded-xl px-5 py-3 text-sm font-semibold flex-1"
                  style={{ background: 'rgba(91,108,255,0.08)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.25)' }}
                >
                  {verHistorial ? 'Ocultar historial' : `Ver historial (${historial.length})`}
                </button>
              </div>

              {verHistorial && <ListaHistorial items={historial} />}

              <h2 className="text-sm font-bold pt-2" style={{ color: '#F1F5F9' }}>Revisión</h2>
              {resultado.revision_completa === false && (
                <p className="text-xs" style={{ color: '#FBBF24' }}>
                  Verás qué acertaste y las respuestas correctas cuando apruebes o uses tu último
                  intento. Mientras tanto, guíate por tu desglose por tema.
                </p>
              )}
              {resultado.revision.map((r, i) => (
                <div key={r.pregunta_id} className="rounded-2xl p-4 space-y-2" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
                  <div className="flex items-start gap-2">
                    {r.es_correcta === undefined
                      ? <span className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                      : r.es_correcta
                        ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#10B981' }} />
                        : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} />}
                    <p className="text-sm font-medium whitespace-pre-wrap" style={{ color: '#F1F5F9' }}>
                      <span style={{ color: '#94A3B8' }}>{i + 1}. </span>{r.enunciado}
                    </p>
                  </div>
                  <div className="space-y-1 pl-6">
                    {LETRAS.map(L => {
                      // r.respuesta_correcta llega undefined cuando no contestaste
                      // esta pregunta: entonces ninguna opción se marca correcta.
                      // r.respuesta_correcta llega undefined cuando la clave NO
                      // se revela: o no contestaste esta pregunta, o todavía te
                      // quedan intentos (TICKET-2026-09-07-51). En ese caso
                      // ninguna opción se marca como la buena — pero la TUYA sí
                      // se pinta según hayas acertado o no, que es la
                      // retroalimentación que sí corresponde darte.
                      const esCorrecta = r.respuesta_correcta !== undefined && L === r.respuesta_correcta
                      const esTuya = L === r.tu_respuesta
                      const tuyaAcertada = esTuya && r.es_correcta === true
                      // Revisión diferida: la tuya se marca sin decir si acertaste.
                      const tuyaSinVeredicto = esTuya && r.es_correcta === undefined
                      return (
                        <p
                          key={L}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={
                            esCorrecta || tuyaAcertada
                              ? { background: 'rgba(16,185,129,0.12)', color: '#34D399', fontWeight: 600 }
                              : tuyaSinVeredicto ? { background: 'rgba(91,108,255,0.12)', color: '#F1F5F9', fontWeight: 600 }
                                : esTuya ? { background: 'rgba(239,68,68,0.1)', color: '#FCA5A5' }
                                  : { color: '#94A3B8' }
                          }
                        >
                          {L}) {r.opciones[L]}
                          {esTuya && r.es_correcta !== true && ' — tu respuesta'}
                          {tuyaAcertada && ' — tu respuesta ✓'}
                          {esCorrecta && !esTuya && ' ✓'}
                        </p>
                      )
                    })}
                    {r.tu_respuesta === null && (
                      <p className="text-xs" style={{ color: '#FBBF24' }}>
                        No la contestaste, cuenta como incorrecta.
                      </p>
                    )}
                    {r.tu_respuesta !== null && r.es_correcta === false && r.respuesta_correcta === undefined && (
                      <p className="text-xs" style={{ color: '#FBBF24' }}>
                        Repasa este tema antes de tu siguiente intento.
                      </p>
                    )}
                  </div>
                  {r.explicacion && (
                    <p className="text-xs pl-6 pt-1 whitespace-pre-wrap" style={{ color: '#94A3B8' }}>{r.explicacion}</p>
                  )}
                </div>
              ))}
            </>
          )}

          {/* ── YA APROBADO: el examen está cerrado (K-d2) ── */}
          {!resultado && aprobadoPrevio && (
            <div className="rounded-2xl p-5 space-y-3" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
              <p className="text-sm font-bold" style={{ color: '#34D399' }}>Ya aprobaste este examen.</p>
              {historial.length > 0 && <ListaHistorial items={historial} />}
            </div>
          )}

          {/* ── EXAMEN ── */}
          {!resultado && !aprobadoPrevio && preguntas && (
            <>
              {/* Intentos previos. El historial ya se cargaba al montar, pero su UI
                  vivía SOLO dentro del bloque de resultados: quien ya había
                  presentado el examen no podía consultarlo sin volver a enviarlo. */}
              {historial.length > 0 && (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: '#F1F5F9' }}>
                        Ya presentaste este examen {historial.length === 1 ? 'una vez' : `${historial.length} veces`}
                      </p>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>
                        Mejor puntaje: {Math.round(Math.max(...historial.map(h => Number(h.porcentaje))))}%
                      </p>
                    </div>
                    <button
                      onClick={() => setVerHistorial(v => !v)}
                      className="rounded-xl px-4 py-2 text-xs font-semibold flex-shrink-0"
                      style={{ background: 'rgba(91,108,255,0.08)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.25)' }}
                    >
                      {verHistorial ? 'Ocultar' : 'Ver intentos'}
                    </button>
                  </div>
                  {verHistorial && <ListaHistorial items={historial} />}
                </div>
              )}

              <p className="text-xs" style={{ color: '#94A3B8' }}>
                Contesta las {total} preguntas y envía. No hay límite de tiempo.{' '}
                {sinIntentos
                  ? 'Ya usaste todos tus intentos.'
                  : `Te ${intentosRestantes === 1 ? 'queda' : 'quedan'} ${intentosRestantes} de ${intentosPermitidos} ${intentosRestantes === 1 ? 'intento' : 'intentos'}.`}{' '}
                Al terminar verás tu puntaje y tu desglose por tema. Qué acertaste y
                las respuestas correctas se muestran cuando acredites el examen o
                uses tu último intento.
              </p>

              {preguntas.map((p, i) => (
                <div key={p.id} className="rounded-2xl p-4 space-y-3" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium whitespace-pre-wrap" style={{ color: '#F1F5F9' }}>
                      <span style={{ color: '#94A3B8' }}>{i + 1}. </span>{p.enunciado}
                    </p>
                    {respuestas[p.id] && <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#10B981' }} />}
                  </div>
                  {p.tema && <p className="text-[11px]" style={{ color: '#94A3B8' }}>{p.tema}</p>}
                  <div className="space-y-1.5">
                    {LETRAS.map(L => {
                      const sel = respuestas[p.id] === L
                      return (
                        <button
                          key={L}
                          onClick={() => elegir(p.id, L)}
                          className="w-full flex items-start gap-2 text-left px-3 py-2 rounded-xl text-sm"
                          style={sel
                            ? { background: 'rgba(91,108,255,0.12)', border: '1px solid #5B6CFF', color: '#F1F5F9' }
                            : { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#CBD5E1' }}
                        >
                          <span
                            className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                            style={sel
                              ? { background: '#5B6CFF', color: '#fff' }
                              : { background: '#2A2F3E', color: '#94A3B8' }}
                          >
                            {L.toUpperCase()}
                          </span>
                          <span className="whitespace-pre-wrap">{p[`opcion_${L}` as const]}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <button
                onClick={() => (faltantes > 0 ? setConfirmar(true) : enviar())}
                disabled={enviando}
                className="w-full rounded-xl px-5 py-3.5 text-sm font-semibold disabled:opacity-60"
                style={{ background: '#5B6CFF', color: '#fff' }}
              >
                {enviando ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</span> : 'Enviar examen'}
              </button>
            </>
          )}
        </div>
      </main>

      {/* Confirmación cuando quedan preguntas sin contestar */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: '#181C26', border: '1px solid #2A2F3E' }}>
            <h2 className="text-base font-bold" style={{ color: '#F1F5F9' }}>
              Te {faltantes === 1 ? 'falta' : 'faltan'} {faltantes} {faltantes === 1 ? 'pregunta' : 'preguntas'}
            </h2>
            <p className="text-sm" style={{ color: '#94A3B8' }}>
              Las que dejes sin contestar cuentan como incorrectas. ¿Enviar de todos modos?
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setConfirmar(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold flex-1"
                style={{ background: 'rgba(91,108,255,0.08)', color: '#7B8AFF' }}
              >
                Seguir contestando
              </button>
              <button
                onClick={enviar}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold flex-1"
                style={{ background: '#5B6CFF', color: '#fff' }}
              >
                Enviar así
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
