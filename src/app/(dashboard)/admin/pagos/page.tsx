'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, Receipt, Search, Info } from 'lucide-react'
import { fmtUSD, fmtFecha, norm } from '@/lib/format'

interface PagoAdmin {
  id: string
  alumno_id: string
  alumno_nombre: string
  alumno_matricula: string | null
  monto: number
  concepto: string | null
  categoria: string
  metodo_pago: string
  referencia: string | null
  mes_desbloqueado: number | null
  meses_cubiertos: number | null
  es_stripe: boolean
  es_manual: boolean
  fecha_pago: string
  created_at: string
  es_demo: boolean
}

type FiltroCategoria = 'todas' | 'INSCRIPCION' | 'MENSUALIDAD' | 'CERTIFICACION' | 'OTRO'

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }
const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }
const ACENTO = '#5B6CFF'

const CATEGORIA_COLOR: Record<string, string> = {
  INSCRIPCION: '#F59E0B',
  MENSUALIDAD: ACENTO,
  CERTIFICACION: '#A78BFA',
  OTRO: '#94A3B8',
}

/**
 * Etiqueta del método de pago, TOLERANTE a mayúsculas/minúsculas: el webhook de
 * Stripe escribe 'stripe' y los jobs pg_cron 'STRIPE' sobre la misma columna.
 * Un mapa indexado por la cadena literal dejaría media tabla con la celda vacía.
 */
const METODO_LABEL: Record<string, string> = {
  stripe: 'Stripe',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
}
const metodoLabel = (m: string | null | undefined) => !m ? '—' : (METODO_LABEL[m.toLowerCase()] ?? m)


export default function PagosPage() {
  const [pagos, setPagos] = useState<PagoAdmin[]>([])
  const [esShowroom, setEsShowroom] = useState(false)
  const [total, setTotal] = useState(0)
  const [truncado, setTruncado] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroCategoria>('todas')

  useEffect(() => {
    fetch('/api/admin/pagos')
      .then(async r => {
        if (r.status === 401) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
        if (r.status === 403) throw new Error('Acceso denegado. Esta sección es solo para administradores.')
        return r.json()
      })
      .then(data => {
        if (data.error) { setError(data.error); return }
        setPagos(data.pagos ?? [])
        setEsShowroom(Boolean(data.es_showroom))
        setTotal(Number(data.total ?? 0))
        setTruncado(Boolean(data.truncado))
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar el historial de pagos'))
      .finally(() => setLoading(false))
  }, [])

  const { porBusqueda, conteos } = useMemo(() => {
    const q = norm(busqueda.trim())
    const lista = q
      ? pagos.filter(p =>
          norm(p.alumno_nombre).includes(q)
          || norm(p.alumno_matricula ?? '').includes(q)
          || norm(p.concepto ?? '').includes(q)
          || norm(p.referencia ?? '').includes(q))
      : pagos
    return {
      porBusqueda: lista,
      conteos: {
        INSCRIPCION: lista.filter(p => p.categoria === 'INSCRIPCION').length,
        MENSUALIDAD: lista.filter(p => p.categoria === 'MENSUALIDAD').length,
        CERTIFICACION: lista.filter(p => p.categoria === 'CERTIFICACION').length,
        OTRO: lista.filter(p => p.categoria === 'OTRO').length,
      },
    }
  }, [pagos, busqueda])

  const filas = useMemo(
    () => filtro === 'todas' ? porBusqueda : porBusqueda.filter(p => p.categoria === filtro),
    [porBusqueda, filtro],
  )

  // Total de lo que se está viendo, no del padrón: si el admin filtra, el número
  // que acompaña a la tabla debe describir la tabla.
  const totalMostrado = useMemo(() => filas.reduce((s, p) => s + p.monto, 0), [filas])

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
          <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Pagos</h2>
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
          Historial de pagos · importes en USD
        </p>
      </div>

      {/* Que la pantalla diga dónde se captura evita que alguien busque aquí un
          botón que no existe, y explica por qué no existe. */}
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ background: 'rgba(91,108,255,0.08)', border: '1px solid rgba(91,108,255,0.25)' }}
      >
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ACENTO }} />
        <p className="text-sm" style={{ color: '#C7D2FE' }}>
          Esta vista es solo de consulta. Los pagos manuales se registran desde la ficha del alumno,
          que es donde se abre el mes correspondiente.
        </p>
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#64748B' }} />
          <input
            type="text"
            placeholder="Buscar por alumno, matrícula, concepto o referencia..."
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
          aria-label="Filtrar por concepto"
          onChange={e => setFiltro(e.target.value as FiltroCategoria)}
          className="px-3 py-2.5 rounded-xl text-sm outline-none"
          style={INPUT_STYLE}
        >
          <option value="todas">Todos los conceptos ({porBusqueda.length})</option>
          <option value="MENSUALIDAD">Mensualidades ({conteos.MENSUALIDAD})</option>
          <option value="INSCRIPCION">Inscripciones ({conteos.INSCRIPCION})</option>
          <option value="CERTIFICACION">Certificaciones ({conteos.CERTIFICACION})</option>
          <option value="OTRO">Otros ({conteos.OTRO})</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-xl overflow-hidden" style={CARD}>
        <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <div className="flex items-center gap-3">
            <Receipt className="w-4 h-4" style={{ color: ACENTO }} />
            <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
              {/* Decir "N pagos" a secas sobre una consulta topada convertiría un
                  recorte técnico en una afirmación falsa sobre la caja. */}
              {filas.length} pago{filas.length !== 1 ? 's' : ''}
              {truncado && total > 0 && (
                <span className="font-normal" style={{ color: '#94A3B8' }}> · mostrando los {pagos.length} más recientes de {total}</span>
              )}
            </h3>
          </div>
          <span className="text-sm font-semibold tabular-nums" style={{ color: '#10B981' }}>
            {fmtUSD(totalMostrado)}
          </span>
        </div>
        {filas.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
            {pagos.length === 0
              ? 'Aún no hay pagos registrados'
              : 'Sin pagos que coincidan con la búsqueda o el filtro'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Fecha', 'Alumno', 'Concepto', 'Monto', 'Método', 'Origen', 'Referencia'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(p => (
                  <tr
                    key={p.id}
                    style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,108,255,0.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {/* fecha_pago (editable, retroactiva) y no created_at: es la
                        fecha contable, y la misma que agregan los reportes. */}
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#94A3B8' }}>
                      {fmtFecha(p.fecha_pago ?? p.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/alumnos/${p.alumno_id}`} className="block group">
                        <span className="font-medium group-hover:underline" style={{ color: '#F1F5F9' }}>{p.alumno_nombre}</span>
                        {p.alumno_matricula && (
                          <span className="block font-mono text-xs mt-0.5" style={{ color: '#64748B' }}>{p.alumno_matricula}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <span className="block truncate" style={{ color: '#F1F5F9' }}>{p.concepto ?? '—'}</span>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: CATEGORIA_COLOR[p.categoria] ?? '#94A3B8' }}
                      >
                        {p.categoria}
                        {p.mes_desbloqueado != null ? ` · mes ${p.mes_desbloqueado}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums whitespace-nowrap" style={{ color: '#10B981' }}>
                      {fmtUSD(p.monto)}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{metodoLabel(p.metodo_pago)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
                        style={p.es_stripe
                          ? { background: 'rgba(91,108,255,0.15)', color: ACENTO }
                          : p.es_manual
                            ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                            : { background: 'rgba(148,163,184,0.15)', color: '#94A3B8' }}
                      >
                        {p.es_stripe ? 'En línea' : p.es_manual ? 'Capturado' : 'Automático'}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      <span className="block truncate font-mono text-[11px]" style={{ color: '#64748B' }}>
                        {p.referencia ?? '—'}
                      </span>
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
