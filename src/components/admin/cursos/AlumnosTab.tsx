'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, UserMinus, UserPlus, Users } from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'
import type { AlumnoAdminRow, CursoInscrito } from '@/types/cursos'

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }
const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }

interface AlumnosTabProps {
  cursoId: string
  inscritos: CursoInscrito[]
  onChanged: (mensaje?: string) => void | Promise<void>
  onError: (mensaje: string) => void
}

export function AlumnosTab({ cursoId, inscritos, onChanged, onError }: AlumnosTabProps) {
  const [alumnos, setAlumnos] = useState<AlumnoAdminRow[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const [confirmTodos, setConfirmTodos] = useState<0 | 1 | 2>(0) // doble confirmación
  const [asignandoTodos, setAsignandoTodos] = useState(false)

  // El buscador usa el endpoint admin existente (usuarios con rol alumno)
  useEffect(() => {
    let cancelled = false
    async function cargar() {
      try {
        const res = await fetch('/api/admin/alumnos')
        if (!res.ok) throw new Error()
        const json = await res.json()
        if (!cancelled) setAlumnos(Array.isArray(json) ? json : [])
      } catch {
        if (!cancelled) {
          setAlumnos([])
          onError('No se pudo cargar la lista de alumnos')
        }
      }
    }
    cargar()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inscritosIds = useMemo(() => new Set(inscritos.map(i => i.alumno_id)), [inscritos])

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return (alumnos ?? [])
      .filter(a =>
        !inscritosIds.has(a.id) &&
        (a.nombre_completo.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [busqueda, alumnos, inscritosIds])

  const totalActivos = useMemo(
    () => (alumnos ?? []).filter(a => a.activo).length,
    [alumnos]
  )

  async function asignar(alumnoId: string, nombre: string) {
    setOcupadoId(alumnoId)
    try {
      const res = await fetch(`/api/admin/cursos/${cursoId}/inscripciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumno_id: alumnoId }),
      })
      const json = await res.json().catch(() => ({} as { error?: string }))
      if (res.status === 409) {
        onError(json.error ?? 'Este alumno ya está asignado al curso')
        return
      }
      if (!res.ok) throw new Error(json.error ?? 'Error al asignar')
      onChanged(`${nombre} asignado al curso`)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error al asignar')
    } finally {
      setOcupadoId(null)
    }
  }

  async function quitar(alumnoId: string, nombre: string) {
    setOcupadoId(alumnoId)
    try {
      const res = await fetch(`/api/admin/cursos/${cursoId}/inscripciones/${alumnoId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Error al quitar')
      }
      onChanged(`${nombre} quitado del curso`)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error al quitar')
    } finally {
      setOcupadoId(null)
    }
  }

  async function asignarTodosActivos() {
    setAsignandoTodos(true)
    try {
      const res = await fetch(`/api/admin/cursos/${cursoId}/inscripciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todos_activos: true }),
      })
      const json = await res.json().catch(() => ({} as { agregados?: number; totalActivos?: number; error?: string }))
      if (!res.ok) throw new Error(json.error ?? 'Error en la asignación masiva')
      onChanged(`${json.agregados} alumno(s) nuevos asignados (de ${json.totalActivos} activos)`)
      setConfirmTodos(0)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error en la asignación masiva')
    } finally {
      setAsignandoTodos(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Buscador + asignación masiva */}
      <div className="rounded-xl p-5 space-y-3" style={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold" style={{ color: '#F1F5F9' }}>Asignar alumnos</h3>
          <button
            onClick={() => setConfirmTodos(1)}
            disabled={asignandoTodos || alumnos === null}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all"
            style={{ border: '1px solid rgba(91,108,255,0.35)', color: '#7B8AFF', background: 'rgba(91,108,255,0.08)' }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(91,108,255,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.08)' }}
          >
            <Users className="w-3.5 h-3.5" />
            Asignar a todos los alumnos activos ({totalActivos})
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder={alumnos === null ? 'Cargando alumnos…' : 'Buscar por nombre o email…'}
            disabled={alumnos === null}
            className="w-full rounded-lg pl-9 pr-3.5 py-2.5 text-sm outline-none disabled:opacity-60"
            style={INPUT_STYLE}
            onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
            onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
            aria-label="Buscar alumnos por nombre o email"
          />
        </div>

        {busqueda.trim() && (
          <div className="space-y-1.5">
            {resultados.length === 0 && (
              <p className="text-xs px-1" style={{ color: '#64748B' }}>
                Sin resultados (los ya asignados no aparecen aquí).
              </p>
            )}
            {resultados.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: '#0D1017', border: '1px solid #2A2F3E' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#F1F5F9' }}>{a.nombre_completo}</p>
                  <p className="text-xs truncate" style={{ color: '#94A3B8' }}>{a.email}</p>
                </div>
                {!a.activo && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                    style={{ background: 'rgba(148,163,184,0.15)', color: '#94A3B8' }}>
                    Inactivo
                  </span>
                )}
                <button
                  onClick={() => asignar(a.id, a.nombre_completo)}
                  disabled={ocupadoId === a.id}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 disabled:opacity-50 transition-all"
                  style={{ background: '#5B6CFF', color: '#fff' }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#7B8AFF' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Asignar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista de asignados */}
      <div className="rounded-xl p-5" style={CARD}>
        <h3 className="text-base font-bold mb-3" style={{ color: '#F1F5F9' }}>
          Alumnos asignados ({inscritos.length})
        </h3>
        {inscritos.length === 0 ? (
          <p className="text-sm" style={{ color: '#64748B' }}>
            Nadie asignado todavía. Usa el buscador de arriba.
          </p>
        ) : (
          <div className="space-y-1.5">
            {inscritos.map(i => (
              <div
                key={i.alumno_id}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: '#0D1017', border: '1px solid #2A2F3E' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#F1F5F9' }}>{i.nombre}</p>
                  <p className="text-xs truncate" style={{ color: '#94A3B8' }}>
                    {i.email}{i.matricula ? ` · ${i.matricula}` : ''}
                  </p>
                </div>
                {!i.activo && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                    style={{ background: 'rgba(148,163,184,0.15)', color: '#94A3B8' }}>
                    Inactivo
                  </span>
                )}
                <button
                  onClick={() => quitar(i.alumno_id, i.nombre)}
                  disabled={ocupadoId === i.alumno_id}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 disabled:opacity-50 transition-all"
                  style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', background: 'rgba(239,68,68,0.08)' }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(239,68,68,0.18)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Doble confirmación para asignación masiva */}
      <ConfirmDialog
        open={confirmTodos === 1}
        title="Asignar a todos los alumnos activos"
        message={
          <>
            Se asignará este curso a los <strong>{totalActivos}</strong> alumnos activos
            (los que ya están asignados no se duplican). ¿Continuar?
          </>
        }
        confirmLabel="Sí, continuar"
        onConfirm={() => setConfirmTodos(2)}
        onCancel={() => setConfirmTodos(0)}
      />
      <ConfirmDialog
        open={confirmTodos === 2}
        danger
        title="¿Seguro? Segunda confirmación"
        message={
          <>
            Esta es una asignación masiva a <strong>{totalActivos}</strong> alumnos activos.
            Confirma una vez más para ejecutarla.
          </>
        }
        confirmLabel="Asignar a todos"
        busy={asignandoTodos}
        onConfirm={asignarTodosActivos}
        onCancel={() => setConfirmTodos(0)}
      />
    </div>
  )
}
