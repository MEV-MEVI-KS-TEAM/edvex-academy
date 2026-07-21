'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, Wallet, Search, CheckCircle2, AlertTriangle } from 'lucide-react'
import { fmtUSD, fmtFecha, norm } from '@/lib/format'

interface EstadoAlumno {
  id: string
  nombre_completo: string
  email: string
  matricula: string | null
  plan_nombre: string | null
  plan_duracion_meses: number | null
  meses_desbloqueados: number
  meses_con_pago: number
  meses_sin_pago_registrado: number
  meses_pagados_de_mas: number
  inscripcion_pagada: boolean
  inscripcion_con_pago_registrado: boolean
  certificacion_pagada: boolean
  total_pagado: number
  fecha_ultimo_pago: string | null
  activo: boolean
}

type FiltroEstado = 'todos' | 'sin_pago_registrado' | 'al_corriente' | 'sin_actividad'
type Orden = 'nombre' | 'estado'

/**
 * Los tres estados son una PARTICIÓN: cada alumno cae en exactamente uno, y los
 * contadores de los filtros suman el total. Antes "al corriente" era
 * simplemente `meses_sin_pago_registrado === 0`, lo que metía en verde a los
 * alumnos sin plan y a los recién dados de alta: 0 meses abiertos ⇒ 0 meses sin
 * pago ⇒ "Al corriente" junto a un badge ámbar de "Sin plan" en la misma fila.
 * La pantalla se contradecía y los contadores sumaban más que el total.
 */
type Situacion = 'sin_actividad' | 'al_corriente' | 'con_pendientes'

function situacionDe(a: { plan_nombre: string | null; meses_desbloqueados: number; meses_sin_pago_registrado: number }): Situacion {
  // Alta incompleta o sin nada que cobrar todavía: no es bueno ni malo, es que
  // no hay nada que evaluar. Pintarlo de verde afirma algo que no sabemos.
  if (!a.plan_nombre || a.meses_desbloqueados === 0) return 'sin_actividad'
  return a.meses_sin_pago_registrado === 0 ? 'al_corriente' : 'con_pendientes'
}

/**
 */

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }
const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }
const ACENTO = '#5B6CFF'

/** Badge compacto reutilizado en varias columnas. */
function Badge({ texto, color, fondo, icono }: { texto: string; color: string; fondo: string; icono?: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: fondo, color }}
    >
      {icono}
      {texto}
    </span>
  )
}

export default function EstadoCuentaPage() {
  const [alumnos, setAlumnos] = useState<EstadoAlumno[]>([])
  const [esShowroom, setEsShowroom] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroEstado>('todos')
  const [orden, setOrden] = useState<Orden>('estado')

  useEffect(() => {
    fetch('/api/admin/estado-cuenta')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setAlumnos(data.alumnos ?? [])
        setEsShowroom(Boolean(data.es_showroom))
      })
      .catch(() => setError('Error al cargar el estado de cuenta'))
      .finally(() => setLoading(false))
  }, [])

  const sinPlan = alumnos.filter(a => !a.plan_nombre).length

  // Los contadores se calculan sobre la lista YA filtrada por búsqueda, para que
  // los números del selector describan lo que el admin tiene delante y no el
  // padrón entero. Y salen de situacionDe(), la misma función que pinta el badge:
  // así es imposible que el filtro diga una cosa y la fila otra.
  const { porBusqueda, nSinActividad, nAlCorriente, nConPendientes } = useMemo(() => {
    const q = norm(busqueda.trim())
    const lista = q
      ? alumnos.filter(a =>
          norm(a.nombre_completo).includes(q)
          || norm(a.email).includes(q)
          || norm(a.matricula ?? '').includes(q))
      : alumnos
    return {
      porBusqueda: lista,
      nSinActividad: lista.filter(a => situacionDe(a) === 'sin_actividad').length,
      nAlCorriente: lista.filter(a => situacionDe(a) === 'al_corriente').length,
      nConPendientes: lista.filter(a => situacionDe(a) === 'con_pendientes').length,
    }
  }, [alumnos, busqueda])

  const filas = useMemo(() => {
    let lista = porBusqueda
    if (filtro === 'sin_pago_registrado') lista = lista.filter(a => situacionDe(a) === 'con_pendientes')
    if (filtro === 'al_corriente') lista = lista.filter(a => situacionDe(a) === 'al_corriente')
    if (filtro === 'sin_actividad') lista = lista.filter(a => situacionDe(a) === 'sin_actividad')
    return [...lista].sort((a, b) =>
      orden === 'estado'
        ? b.meses_sin_pago_registrado - a.meses_sin_pago_registrado
          || a.nombre_completo.localeCompare(b.nombre_completo)
        : a.nombre_completo.localeCompare(b.nombre_completo)
    )
  }, [porBusqueda, filtro, orden])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: ACENTO }} />
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-sm" style={{ color: '#EF4444' }}>{error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Estado de Cuenta</h2>
          {esShowroom && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
            >
              Datos de demostración
            </span>
          )}
        </div>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
          Alumnos activos · meses desbloqueados frente a pagos de mensualidad registrados · importes en USD
        </p>
      </div>

      {/* Aviso de altas incompletas. Se muestra solo si las hay: un alumno sin
          plan no puede recibir pagos manuales (desbloquear_mes lanza P0003), así
          que es una incidencia accionable, no una curiosidad estadística. */}
      {sinPlan > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
          <p className="text-sm" style={{ color: '#FDE68A' }}>
            {sinPlan} alumno{sinPlan !== 1 ? 's' : ''} sin plan de estudios asignado. Sin plan no es
            posible registrar un pago manual.
          </p>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#64748B' }} />
          <input
            type="text"
            placeholder="Buscar por nombre, email o matrícula..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
            style={INPUT_STYLE}
            onFocus={e => { e.currentTarget.style.border = `1px solid ${ACENTO}` }}
            onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
          />
        </div>
        <select
          value={filtro}
          aria-label="Filtrar por situación de pago"
          onChange={e => setFiltro(e.target.value as FiltroEstado)}
          className="px-3 py-2.5 rounded-xl text-sm outline-none"
          style={INPUT_STYLE}
        >
          {/* "Todos los activos": la RPC filtra por usuarios.activo, así que
              esto NUNCA es el padrón completo. Rotularlo "Todos" haría que el
              conteo no cuadrara con Reportes y con /admin/alumnos sin
              explicación. Los tres siguientes son una partición y suman el
              total mostrado. */}
          <option value="todos">Todos los activos ({porBusqueda.length})</option>
          <option value="sin_pago_registrado">Con meses sin pago registrado ({nConPendientes})</option>
          <option value="al_corriente">Al corriente ({nAlCorriente})</option>
          <option value="sin_actividad">Sin actividad o sin plan ({nSinActividad})</option>
        </select>
        <select
          value={orden}
          aria-label="Ordenar la lista"
          onChange={e => setOrden(e.target.value as Orden)}
          className="px-3 py-2.5 rounded-xl text-sm outline-none"
          style={INPUT_STYLE}
        >
          <option value="estado">Ordenar: meses sin pago primero</option>
          <option value="nombre">Ordenar: por nombre</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-xl overflow-hidden" style={CARD}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <Wallet className="w-4 h-4" style={{ color: ACENTO }} />
          <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
            {filas.length} alumno{filas.length !== 1 ? 's' : ''}
          </h3>
        </div>
        {filas.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
            {/* Distinguir "no hay datos" de "no hay coincidencias": culpar a un
                filtro que el admin nunca tocó le manda a buscar un problema
                inexistente. Misma convención que /admin/alumnos. */}
            {alumnos.length === 0
              ? 'Aún no hay alumnos activos registrados'
              : 'Sin alumnos que coincidan con la búsqueda o el filtro'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Alumno', 'Plan', 'Meses', 'Con pago', 'Inscripción', 'Total pagado', 'Último pago', 'Estado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(a => (
                  <tr
                    key={a.id}
                    style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,108,255,0.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/admin/alumnos/${a.id}`} className="block group">
                        <span className="font-medium group-hover:underline" style={{ color: '#F1F5F9' }}>{a.nombre_completo}</span>
                        {a.matricula && (
                          <span className="block font-mono text-xs mt-0.5" style={{ color: '#64748B' }}>{a.matricula}</span>
                        )}
                      </Link>
                    </td>

                    {/* Plan NULL = alta incompleta, no dato ausente. Se marca en
                        ámbar para que se distinga de un valor que simplemente no
                        aplica; una celda vacía lo haría invisible. */}
                    <td className="px-4 py-3 text-xs">
                      {a.plan_nombre ? (
                        <span style={{ color: '#94A3B8' }}>
                          {a.plan_nombre}
                          {a.plan_duracion_meses ? ` · ${a.plan_duracion_meses} meses` : ''}
                        </span>
                      ) : (
                        <Badge
                          texto="Sin plan"
                          color="#F59E0B"
                          fondo="rgba(245,158,11,0.15)"
                          icono={<AlertTriangle className="w-3 h-3" />}
                        />
                      )}
                    </td>

                    <td className="px-4 py-3 font-semibold text-center tabular-nums" style={{ color: '#F1F5F9' }}>
                      {a.meses_desbloqueados}
                    </td>
                    <td className="px-4 py-3 font-semibold text-center tabular-nums" style={{ color: '#F1F5F9' }}>
                      {a.meses_con_pago}
                    </td>

                    <td className="px-4 py-3">
                      {/* Manda el flag de alumnos: es el que gobierna el acceso
                          real del alumno en la app. El pago registrado es
                          informativo, y su discrepancia con el flag es
                          justamente lo que el admin necesita ver — el botón
                          "Marcar inscripción pagada" mueve el flag sin insertar
                          en pagos. */}
                      <Badge
                        texto={a.inscripcion_pagada ? 'Pagada' : 'Pendiente'}
                        color={a.inscripcion_pagada ? '#10B981' : '#F59E0B'}
                        fondo={a.inscripcion_pagada ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'}
                      />
                      {a.inscripcion_pagada && !a.inscripcion_con_pago_registrado && (
                        <span className="block text-[10px] mt-1" style={{ color: '#64748B' }}>
                          sin pago capturado
                        </span>
                      )}
                      {/* La certificación es un cobro real (checkout tipo
                          'certificacion') y entra en "Total pagado". Sin
                          mostrarla, ese alumno enseña un importe que no cuadra
                          con ninguna columna visible y el admin no puede
                          explicarlo desde esta pantalla. */}
                      {a.certificacion_pagada && (
                        <span className="block text-[10px] mt-1" style={{ color: '#A78BFA' }}>
                          + certificación
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#10B981' }}>
                      {fmtUSD(a.total_pagado)}
                    </td>

                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#94A3B8' }}>
                      {a.fecha_ultimo_pago ? fmtFecha(a.fecha_ultimo_pago) : 'Sin pagos registrados'}
                    </td>

                    <td className="px-4 py-3">
                      {/* Tres estados excluyentes, calculados con la MISMA
                          función que alimenta los contadores del filtro. */}
                      {situacionDe(a) === 'sin_actividad' && (
                        <Badge
                          texto={a.plan_nombre ? 'Sin actividad' : 'Alta incompleta'}
                          color="#94A3B8"
                          fondo="rgba(148,163,184,0.15)"
                        />
                      )}
                      {situacionDe(a) === 'al_corriente' && (
                        <Badge
                          texto="Al corriente"
                          color="#10B981"
                          fondo="rgba(16,185,129,0.15)"
                          icono={<CheckCircle2 className="w-3 h-3" />}
                        />
                      )}
                      {situacionDe(a) === 'con_pendientes' && (
                        // Informativo, no acusación: el sistema solo sabe que no
                        // hay pago capturado — no si es cortesía, omisión o error.
                        <Badge
                          texto={`${a.meses_sin_pago_registrado} mes${a.meses_sin_pago_registrado !== 1 ? 'es' : ''} sin pago registrado`}
                          color="#F59E0B"
                          fondo="rgba(245,158,11,0.15)"
                        />
                      )}

                      {/* Fuera del condicional a propósito: meses_pagados_de_mas
                          y meses_sin_pago_registrado son columnas independientes
                          de la RPC, no dos caras de la misma. Anidarlo en la
                          rama verde ocultaba el saldo a favor justo en la fila
                          que el admin va a cobrar. El módulo acelerado abre 2
                          meses con 1 pago, así que este caso es normal, no un
                          error. */}
                      {a.meses_pagados_de_mas > 0 && (
                        <span className="block text-[10px] mt-1" style={{ color: '#64748B' }}>
                          {a.meses_pagados_de_mas} mes{a.meses_pagados_de_mas !== 1 ? 'es' : ''} pagado
                          {a.meses_pagados_de_mas !== 1 ? 's' : ''} de más
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
