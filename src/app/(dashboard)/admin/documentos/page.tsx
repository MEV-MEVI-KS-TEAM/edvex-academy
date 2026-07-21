'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, FileCheck, Search, ExternalLink, Check, X } from 'lucide-react'
import { useToast, ToastContainer } from '@/components/ui/toast'
import { fmtFecha, norm } from '@/lib/format'
import { tipoLabel, type DocEstadoAdmin } from '@/lib/admin/documentos-admin'

interface DocumentoAdmin {
  id: string
  alumno_id: string
  tipo: string
  nombre_archivo: string
  estado: DocEstadoAdmin
  comentario_admin: string | null
  subido_en: string
  revisado_en: string | null
  signed_url: string | null
  alumno_nombre: string
  alumno_matricula: string | null
}

type FiltroEstado = 'todos' | DocEstadoAdmin

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }
const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }
const ACENTO = '#5B6CFF'

const ESTADO_CONFIG: Record<DocEstadoAdmin, { label: string; color: string; fondo: string }> = {
  pendiente: { label: 'Pendiente', color: '#F59E0B', fondo: 'rgba(245,158,11,0.15)' },
  aprobado:  { label: 'Aprobado',  color: '#10B981', fondo: 'rgba(16,185,129,0.15)' },
  rechazado: { label: 'Rechazado', color: '#EF4444', fondo: 'rgba(239,68,68,0.15)' },
}


export default function DocumentosPage() {
  const { toasts, showToast, removeToast } = useToast()

  const [docs, setDocs] = useState<DocumentoAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroEstado>('pendiente')
  // Set y no un solo id: los botones de las OTRAS filas no se deshabilitan, así
  // que dos resoluciones en vuelo son normales. Con una sola ranura, la segunda
  // pisaba a la primera: su spinner desaparecía y su botón se rehabilitaba con
  // la petición aún viva.
  const [procesando, setProcesando] = useState<Set<string>>(new Set())

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/documentos')
      if (res.status === 401) { setError('Tu sesión expiró. Vuelve a iniciar sesión.'); return }
      if (res.status === 403) { setError('Acceso denegado. Esta sección es solo para administradores.'); return }
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al cargar los documentos'); return }
      setDocs(data.documentos ?? [])
      setError(null)
    } catch {
      setError('Error al cargar los documentos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const { porBusqueda, conteos } = useMemo(() => {
    const q = norm(busqueda.trim())
    const lista = q
      ? docs.filter(d =>
          norm(d.alumno_nombre).includes(q)
          || norm(d.alumno_matricula ?? '').includes(q)
          || norm(d.nombre_archivo).includes(q)
          || norm(tipoLabel(d.tipo)).includes(q))
      : docs
    return {
      porBusqueda: lista,
      conteos: {
        pendiente: lista.filter(d => d.estado === 'pendiente').length,
        aprobado:  lista.filter(d => d.estado === 'aprobado').length,
        rechazado: lista.filter(d => d.estado === 'rechazado').length,
      },
    }
  }, [docs, busqueda])

  const filas = useMemo(() => {
    const lista = filtro === 'todos' ? porBusqueda : porBusqueda.filter(d => d.estado === filtro)
    // Pendientes primero y, dentro de cada grupo, lo más reciente arriba: es el
    // orden en que se trabaja una bandeja de revisión.
    return [...lista].sort((a, b) => {
      if (a.estado !== b.estado) {
        if (a.estado === 'pendiente') return -1
        if (b.estado === 'pendiente') return 1
      }
      return (b.subido_en ?? '').localeCompare(a.subido_en ?? '')
    })
  }, [porBusqueda, filtro])

  /**
   * Escribe por la ruta por alumno, que es el ÚNICO camino de escritura de
   * documentos en EDVEX. La bandeja global no tiene endpoint propio a
   * propósito: dos rutas que resuelven documentos acabarían divergiendo en qué
   * significa "revisado".
   */
  async function resolver(doc: DocumentoAdmin, estado: DocEstadoAdmin) {
    let comentario: string | null = null
    if (estado === 'rechazado') {
      const motivo = window.prompt(`Motivo del rechazo de "${tipoLabel(doc.tipo)}" de ${doc.alumno_nombre}:`)
      // null = canceló el diálogo; cadena vacía = aceptó sin escribir nada.
      if (motivo === null) return
      if (!motivo.trim()) { showToast('El rechazo necesita un motivo', 'error'); return }
      comentario = motivo.trim()
    }

    setProcesando(p => new Set(p).add(doc.id))
    try {
      const res = await fetch(`/api/admin/documentos/${doc.alumno_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoId: doc.id, estado, comentario }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'No se pudo actualizar', 'error'); return }

      // Actualización local en vez de recargar todo: la lista trae URLs firmadas
      // y volver a pedirlas por un cambio de estado es trabajo desperdiciado.
      setDocs(prev => prev.map(d =>
        d.id === doc.id
          ? { ...d, estado, comentario_admin: comentario, revisado_en: new Date().toISOString() }
          : d))
      showToast(estado === 'aprobado' ? 'Documento aprobado' : 'Documento rechazado', 'success')
    } catch {
      showToast('Error inesperado', 'error')
    } finally {
      setProcesando(p => { const n = new Set(p); n.delete(doc.id); return n })
    }
  }

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
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div>
        <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Documentos</h2>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
          Revisión de la documentación entregada por los alumnos
        </p>
      </div>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#64748B' }} />
          <input
            type="text"
            placeholder="Buscar por alumno, matrícula, tipo o archivo..."
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
          aria-label="Filtrar por estado del documento"
          onChange={e => setFiltro(e.target.value as FiltroEstado)}
          className="px-3 py-2.5 rounded-xl text-sm outline-none"
          style={INPUT_STYLE}
        >
          {/* Pendientes por defecto: es la bandeja de trabajo, no un archivo. */}
          <option value="pendiente">Pendientes ({conteos.pendiente})</option>
          <option value="aprobado">Aprobados ({conteos.aprobado})</option>
          <option value="rechazado">Rechazados ({conteos.rechazado})</option>
          <option value="todos">Todos ({porBusqueda.length})</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="rounded-xl overflow-hidden" style={CARD}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <FileCheck className="w-4 h-4" style={{ color: ACENTO }} />
          <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
            {filas.length} documento{filas.length !== 1 ? 's' : ''}
          </h3>
        </div>
        {filas.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
            {docs.length === 0
              ? 'Aún no hay documentos entregados'
              : 'Sin documentos que coincidan con la búsqueda o el filtro'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Alumno', 'Tipo', 'Archivo', 'Subido', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map(d => {
                  const cfg = ESTADO_CONFIG[d.estado]
                  const ocupado = procesando.has(d.id)
                  return (
                    <tr
                      key={d.id}
                      style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,108,255,0.04)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/admin/alumnos/${d.alumno_id}`} className="block group">
                          <span className="font-medium group-hover:underline" style={{ color: '#F1F5F9' }}>{d.alumno_nombre}</span>
                          {d.alumno_matricula && (
                            <span className="block font-mono text-xs mt-0.5" style={{ color: '#64748B' }}>{d.alumno_matricula}</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3" style={{ color: '#F1F5F9' }}>{tipoLabel(d.tipo)}</td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="block truncate text-xs" style={{ color: '#94A3B8' }}>{d.nombre_archivo}</span>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#94A3B8' }}>
                        {fmtFecha(d.subido_en)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                          style={{ background: cfg.fondo, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        {d.comentario_admin && (
                          <span className="block text-[10px] mt-1 max-w-[180px] truncate" style={{ color: '#64748B' }} title={d.comentario_admin}>
                            {d.comentario_admin}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {d.signed_url ? (
                            <a
                              href={d.signed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg"
                              style={{ color: ACENTO, background: 'rgba(91,108,255,0.12)' }}
                              title="Ver documento"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            // El archivo no está en Storage con ninguna de las
                            // extensiones esperadas. Decirlo es mejor que un
                            // botón que no hace nada al pulsarlo.
                            <span className="text-[10px]" style={{ color: '#64748B' }} title="No se encontró el archivo en el almacenamiento">
                              sin archivo
                            </span>
                          )}
                          {d.estado !== 'aprobado' && (
                            <button
                              onClick={() => resolver(d, 'aprobado')}
                              disabled={ocupado}
                              className="p-1.5 rounded-lg disabled:opacity-50"
                              style={{ color: '#10B981', background: 'rgba(16,185,129,0.12)' }}
                              title="Aprobar"
                            >
                              {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {d.estado !== 'rechazado' && (
                            <button
                              onClick={() => resolver(d, 'rechazado')}
                              disabled={ocupado}
                              className="p-1.5 rounded-lg disabled:opacity-50"
                              style={{ color: '#EF4444', background: 'rgba(239,68,68,0.12)' }}
                              title="Rechazar"
                            >
                              {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
