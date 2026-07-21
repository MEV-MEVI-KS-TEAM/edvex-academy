'use client'

import { useState, useEffect } from 'react'
import { Users, UserCheck, DollarSign, TrendingUp, Loader2, BookOpen, Award, CalendarRange } from 'lucide-react'
import { fmtUSD, fmtFecha, fmtSemana, fmtMes } from '@/lib/format'

interface Stats {
  total_alumnos: number
  alumnos_activos: number
  total_ingresos: number
  ingresos_mes: number
  promedio_meses: number
}

interface PuntoSemana { semana_inicio: string; total: number }
interface PuntoMes { mes: string; total: number }

interface RendimientoMateria {
  materia_id: string
  codigo: string
  nombre: string
  total_cursaron: number
  aprobados: number
  reprobados: number
  porcentaje_aprobacion: number
}

interface PagoReciente {
  alumno: string
  monto: number
  metodo_pago: string
  concepto: string | null
  categoria: string
  fecha_pago: string
  created_at: string
}

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

/**
 * Etiqueta del método de pago, TOLERANTE A MAYUSCULAS/MINUSCULAS a proposito:
 * los escritores de `pagos` no se pusieron de acuerdo. El webhook de Stripe
 * escribe 'stripe' en minuscula y los jobs pg_cron escriben 'STRIPE' en
 * mayuscula, sobre la misma columna. Un mapa indexado por la cadena literal
 * dejaria la mitad de la tabla con la celda vacia.
 * Fallback al valor crudo: es preferible mostrar un metodo desconocido tal cual
 * que ocultarlo.
 */
const METODO_LABEL: Record<string, string> = {
  stripe: 'Stripe',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
}
const metodoLabel = (m: string | null | undefined) =>
  !m ? '—' : (METODO_LABEL[m.toLowerCase()] ?? m)

/** Color por categoria normalizada que devuelve `pago_categoria` en la BD. */
const CATEGORIA_COLOR: Record<string, string> = {
  INSCRIPCION: '#F59E0B',
  MENSUALIDAD: '#5B6CFF',
  CERTIFICACION: '#A78BFA',
  OTRO: '#94A3B8',
}

export default function ReportesPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [rendimiento, setRendimiento] = useState<RendimientoMateria[]>([])
  const [pagos, setPagos] = useState<PagoReciente[]>([])
  const [semanas, setSemanas] = useState<PuntoSemana[]>([])
  const [meses, setMeses] = useState<PuntoMes[]>([])
  const [esShowroom, setEsShowroom] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/reportes')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setStats(data.stats)
        setRendimiento(data.rendimiento_materias ?? [])
        setPagos(data.pagos_recientes ?? [])
        setSemanas(data.ingresos_semanales ?? [])
        setMeses(data.ingresos_mensuales ?? [])
        setEsShowroom(Boolean(data.es_showroom))
      })
      .catch(() => setError('Error al cargar reportes'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-sm" style={{ color: '#EF4444' }}>{error}</p>
    </div>
  )

  const statCards = [
    { label: 'Total Alumnos', value: String(stats?.total_alumnos ?? 0), icon: Users, color: '#5B6CFF', bg: 'rgba(91,108,255,0.15)' },
    { label: 'Alumnos Activos', value: String(stats?.alumnos_activos ?? 0), icon: UserCheck, color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
    { label: 'Ingresos Totales', value: fmtUSD(stats?.total_ingresos ?? 0), icon: DollarSign, color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
    { label: 'Ingresos del Mes', value: fmtUSD(stats?.ingresos_mes ?? 0), icon: TrendingUp, color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  ]

  // Escala compartida por las dos series para que las barras sean comparables
  // dentro de cada bloque. Se usa 1 como minimo para no dividir por cero cuando
  // todos los periodos vienen en 0 (rejilla rellena sin pagos).
  const maxSemana = Math.max(1, ...semanas.map(s => s.total))
  const maxMes = Math.max(1, ...meses.map(m => m.total))

  const Serie = ({
    titulo, datos, maximo, etiqueta,
  }: {
    titulo: string
    datos: { clave: string; total: number }[]
    maximo: number
    etiqueta: (v: string) => string
  }) => (
    <div className="rounded-xl overflow-hidden" style={CARD}>
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #2A2F3E' }}>
        <CalendarRange className="w-4 h-4" style={{ color: '#10B981' }} />
        <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>{titulo}</h3>
      </div>
      {datos.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
          Sin datos de ingresos para este periodo
        </div>
      ) : (
        <div className="px-5 py-5 space-y-2.5">
          {datos.map(d => (
            <div key={d.clave} className="flex items-center gap-3">
              <span className="text-xs w-16 flex-shrink-0 tabular-nums" style={{ color: '#94A3B8' }}>
                {etiqueta(d.clave)}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#2A2F3E' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(d.total / maximo) * 100}%`, background: '#10B981' }}
                />
              </div>
              <span className="text-xs font-semibold w-24 text-right tabular-nums" style={{ color: '#F1F5F9' }}>
                {fmtUSD(d.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Reportes y Estadísticas</h2>
          {/* En un showroom, que el espectador sepa que los datos son sembrados
              es una característica, no una fuga: evita que alguien tome estos
              importes por ventas reales. */}
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
          Resumen general de la plataforma · importes en USD
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl p-5 flex items-center gap-4" style={CARD}>
            <div className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate" style={{ color }}>{value}</p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Series de ingresos — agregadas en SQL (rejilla America/Mexico_City) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Serie
          titulo="Ingresos por Semana (8 semanas)"
          datos={semanas.map(s => ({ clave: s.semana_inicio, total: s.total }))}
          maximo={maxSemana}
          etiqueta={fmtSemana}
        />
        <Serie
          titulo="Ingresos por Mes (6 meses)"
          datos={meses.map(m => ({ clave: m.mes, total: m.total }))}
          maximo={maxMes}
          etiqueta={fmtMes}
        />
      </div>

      {/* Rendimiento por materia */}
      <div className="rounded-xl overflow-hidden" style={CARD}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <BookOpen className="w-4 h-4" style={{ color: '#5B6CFF' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Rendimiento por Materia</h3>
        </div>
        {rendimiento.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
            Sin datos de calificaciones registradas aún
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Código', 'Materia', 'Cursaron', 'Aprobados', 'Reprobados', '% Aprobación'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rendimiento.map(r => (
                  <tr
                    key={r.materia_id}
                    style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,108,255,0.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#7B8AFF' }}>{r.codigo}</td>
                    <td className="px-4 py-3 font-medium max-w-xs" style={{ color: '#F1F5F9' }}>
                      <span className="block truncate">{r.nombre}</span>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#F1F5F9' }}>{r.total_cursaron}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#10B981' }}>{r.aprobados}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#EF4444' }}>{r.reprobados}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[80px]" style={{ background: '#2A2F3E' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${r.porcentaje_aprobacion}%`,
                              background: r.porcentaje_aprobacion >= 60 ? '#10B981' : '#EF4444',
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold" style={{
                          color: r.porcentaje_aprobacion >= 60 ? '#10B981' : '#EF4444'
                        }}>
                          {r.porcentaje_aprobacion}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de ingresos */}
      <div className="rounded-xl overflow-hidden" style={CARD}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <Award className="w-4 h-4" style={{ color: '#F59E0B' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Historial de Ingresos Recientes</h3>
        </div>
        {pagos.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
            Sin pagos registrados aún
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Fecha', 'Alumno', 'Concepto', 'Monto', 'Método'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagos.map((p, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,108,255,0.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {/* fecha_pago (DATE, editable) y no created_at (momento de
                        captura): un pago retroactivo debe listarse por su fecha
                        real, que es además la que agrega la gráfica de arriba. */}
                    <td className="px-4 py-3" style={{ color: '#94A3B8' }}>
                      {fmtFecha(p.fecha_pago ?? p.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#F1F5F9' }}>{p.alumno}</td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <span className="block truncate" style={{ color: '#F1F5F9' }}>
                        {p.concepto ?? '—'}
                      </span>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: CATEGORIA_COLOR[p.categoria] ?? '#94A3B8' }}
                      >
                        {p.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: '#10B981' }}>{fmtUSD(p.monto)}</td>
                    <td className="px-4 py-3" style={{ color: '#94A3B8' }}>{metodoLabel(p.metodo_pago)}</td>
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
