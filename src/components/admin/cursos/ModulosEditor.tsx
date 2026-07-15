'use client'

import { useState } from 'react'
import {
  ArrowDown, ArrowUp, Check, FileText, Pencil, Play, Plus, Trash2, X,
} from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'
import { LeccionModal } from './LeccionModal'
import type { CursoLeccion, CursoModulo } from '@/types/cursos'

const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }

interface ModulosEditorProps {
  cursoId: string
  modulos: CursoModulo[]
  /** Refetch del detalle; se AWAITEA para no liberar la UI con lista stale. */
  onChanged: (mensaje?: string) => void | Promise<void>
  onError: (mensaje: string) => void
}

export function ModulosEditor({ cursoId, modulos, onChanged, onError }: ModulosEditorProps) {
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoNombreEn, setNuevoNombreEn] = useState('')
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoNombre, setEditandoNombre] = useState('')
  const [editandoNombreEn, setEditandoNombreEn] = useState('')
  const [moduloAEliminar, setModuloAEliminar] = useState<CursoModulo | null>(null)
  const [leccionAEliminar, setLeccionAEliminar] = useState<{ leccion: CursoLeccion; modulo: CursoModulo } | null>(null)
  const [modalLeccion, setModalLeccion] = useState<{ moduloId: string; leccion: CursoLeccion | null } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function api(path: string, init: RequestInit, okMsg?: string) {
    setOcupado(true)
    try {
      const res = await fetch(path, init)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Error en la operación')
      }
      // Esperar el refetch antes de liberar `ocupado`: si no, un segundo click
      // en ↑↓ opera sobre una lista vieja (respuestas fuera de orden)
      await onChanged(okMsg)
      return true
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error en la operación')
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function crearModulo(e: React.FormEvent) {
    e.preventDefault()
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    setCreando(true)
    const ok = await api(
      `/api/admin/cursos/${cursoId}/modulos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, nombre_en: nuevoNombreEn.trim() }),
      },
      'Módulo agregado'
    )
    if (ok) { setNuevoNombre(''); setNuevoNombreEn('') }
    setCreando(false)
  }

  async function renombrarModulo(moduloId: string) {
    const nombre = editandoNombre.trim()
    if (!nombre) return
    const ok = await api(
      `/api/admin/cursos/${cursoId}/modulos/${moduloId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, nombre_en: editandoNombreEn.trim() }),
      },
      'Módulo renombrado'
    )
    if (ok) setEditandoId(null)
  }

  function moverModulo(moduloId: string, move: 'up' | 'down') {
    api(
      `/api/admin/cursos/${cursoId}/modulos/${moduloId}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ move }) }
    )
  }

  function moverLeccion(leccionId: string, move: 'up' | 'down') {
    api(
      `/api/admin/cursos/${cursoId}/lecciones/${leccionId}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ move }) }
    )
  }

  const btnIcon = 'p-1.5 rounded-lg disabled:opacity-30 transition-colors'

  return (
    <div className="space-y-4">
      {/* Agregar módulo */}
      <form onSubmit={crearModulo} className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 flex flex-col gap-2">
          <input
            type="text"
            value={nuevoNombre}
            onChange={e => setNuevoNombre(e.target.value)}
            placeholder="Nombre del nuevo módulo…"
            maxLength={200}
            className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
            style={INPUT_STYLE}
            onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
            onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
            aria-label="Nombre del nuevo módulo"
          />
          <input
            type="text"
            value={nuevoNombreEn}
            onChange={e => setNuevoNombreEn(e.target.value)}
            placeholder="English (opcional)"
            maxLength={200}
            className="w-full rounded-lg px-3.5 py-2 text-sm outline-none"
            style={INPUT_STYLE}
            onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
            onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
            aria-label="Nombre del nuevo módulo en inglés (opcional)"
          />
        </div>
        <button
          type="submit"
          disabled={creando || !nuevoNombre.trim()}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold self-start disabled:opacity-50 transition-all"
          style={{ background: '#5B6CFF', color: '#fff' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#7B8AFF' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
        >
          <Plus className="w-4 h-4" />
          Agregar módulo
        </button>
      </form>

      {modulos.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={{ background: '#0D1017', border: '1px dashed #2A2F3E' }}>
          <p className="text-sm" style={{ color: '#94A3B8' }}>
            Este curso aún no tiene módulos. Agrega el primero arriba.
          </p>
        </div>
      )}

      {/* Lista de módulos */}
      {modulos.map((modulo, mi) => (
        <div
          key={modulo.id}
          className="rounded-xl overflow-hidden"
          style={{ background: '#181C26', border: '1px solid #2A2F3E' }}
        >
          {/* Encabezado del módulo */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid #2A2F3E' }}>
            <span
              className="flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold flex-shrink-0"
              style={{ background: '#5B6CFF', color: '#fff' }}
            >
              {mi + 1}
            </span>

            {editandoId === modulo.id ? (
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={editandoNombre}
                    onChange={e => setEditandoNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renombrarModulo(modulo.id); if (e.key === 'Escape') setEditandoId(null) }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none"
                    style={{ background: '#0B0D11', border: '1px solid #5B6CFF', color: '#F1F5F9' }}
                    autoFocus
                    aria-label="Nuevo nombre del módulo"
                  />
                  <input
                    type="text"
                    value={editandoNombreEn}
                    onChange={e => setEditandoNombreEn(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renombrarModulo(modulo.id); if (e.key === 'Escape') setEditandoId(null) }}
                    placeholder="English (opcional)"
                    className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none"
                    style={INPUT_STYLE}
                    aria-label="Nuevo nombre del módulo en inglés (opcional)"
                  />
                </div>
                <button onClick={() => renombrarModulo(modulo.id)} disabled={ocupado || !editandoNombre.trim()} className={btnIcon} style={{ color: '#34D399' }} aria-label="Guardar nombre">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditandoId(null)} className={btnIcon} style={{ color: '#64748B' }} aria-label="Cancelar edición">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h4 className="flex-1 text-sm font-bold truncate" style={{ color: '#F1F5F9' }}>
                  {modulo.nombre}
                </h4>
                <span className="text-xs flex-shrink-0" style={{ color: '#64748B' }}>
                  {modulo.lecciones.length} lección(es)
                </span>
                <button
                  onClick={() => moverModulo(modulo.id, 'up')}
                  disabled={ocupado || mi === 0}
                  className={btnIcon} style={{ color: '#94A3B8' }}
                  aria-label={`Subir módulo ${modulo.nombre}`} title="Subir"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moverModulo(modulo.id, 'down')}
                  disabled={ocupado || mi === modulos.length - 1}
                  className={btnIcon} style={{ color: '#94A3B8' }}
                  aria-label={`Bajar módulo ${modulo.nombre}`} title="Bajar"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setEditandoId(modulo.id); setEditandoNombre(modulo.nombre); setEditandoNombreEn(modulo.nombre_en ?? '') }}
                  disabled={ocupado}
                  className={btnIcon} style={{ color: '#7B8AFF' }}
                  aria-label={`Renombrar módulo ${modulo.nombre}`} title="Renombrar"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setModuloAEliminar(modulo)}
                  disabled={ocupado}
                  className={btnIcon} style={{ color: '#EF4444' }}
                  aria-label={`Eliminar módulo ${modulo.nombre}`} title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Lecciones */}
          <div className="px-4 py-3 space-y-2">
            {modulo.lecciones.length === 0 && (
              <p className="text-xs py-1" style={{ color: '#64748B' }}>Sin lecciones todavía.</p>
            )}
            {modulo.lecciones.map((leccion, li) => (
              <div
                key={leccion.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: '#0D1017', border: '1px solid #2A2F3E' }}
              >
                <span className="text-xs font-bold w-5 text-center flex-shrink-0" style={{ color: '#64748B' }}>
                  {li + 1}
                </span>
                <span className="flex-1 text-sm font-medium truncate" style={{ color: '#F1F5F9' }}>
                  {leccion.titulo}
                </span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  {leccion.video_url && <Play className="w-3.5 h-3.5" style={{ color: '#34D399' }} aria-label="Tiene video" />}
                  {leccion.material_path && <FileText className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} aria-label="Tiene PDF" />}
                </span>
                <button
                  onClick={() => moverLeccion(leccion.id, 'up')}
                  disabled={ocupado || li === 0}
                  className={btnIcon} style={{ color: '#94A3B8' }}
                  aria-label={`Subir lección ${leccion.titulo}`} title="Subir"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moverLeccion(leccion.id, 'down')}
                  disabled={ocupado || li === modulo.lecciones.length - 1}
                  className={btnIcon} style={{ color: '#94A3B8' }}
                  aria-label={`Bajar lección ${leccion.titulo}`} title="Bajar"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setModalLeccion({ moduloId: modulo.id, leccion })}
                  disabled={ocupado}
                  className={btnIcon} style={{ color: '#7B8AFF' }}
                  aria-label={`Editar lección ${leccion.titulo}`} title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setLeccionAEliminar({ leccion, modulo })}
                  disabled={ocupado}
                  className={btnIcon} style={{ color: '#EF4444' }}
                  aria-label={`Eliminar lección ${leccion.titulo}`} title="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <button
              onClick={() => setModalLeccion({ moduloId: modulo.id, leccion: null })}
              disabled={ocupado}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold mt-1 disabled:opacity-50 transition-colors"
              style={{ color: '#7B8AFF', border: '1px dashed rgba(91,108,255,0.35)', background: 'transparent' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(91,108,255,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar lección
            </button>
          </div>
        </div>
      ))}

      {/* Modal crear/editar lección */}
      {modalLeccion && (
        <LeccionModal
          open
          cursoId={cursoId}
          moduloId={modalLeccion.moduloId}
          leccion={modalLeccion.leccion}
          onClose={() => setModalLeccion(null)}
          onSaved={msg => { void onChanged(msg) }}
          onPartial={() => { void onChanged() }}
          onError={onError}
        />
      )}

      {/* Confirmar eliminar módulo */}
      <ConfirmDialog
        open={moduloAEliminar !== null}
        danger
        title="Eliminar módulo"
        message={
          <>
            Vas a eliminar el módulo <strong>{moduloAEliminar?.nombre}</strong> con sus{' '}
            {moduloAEliminar?.lecciones.length ?? 0} lección(es) y materiales. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar módulo"
        busy={ocupado}
        onConfirm={async () => {
          if (!moduloAEliminar) return
          const ok = await api(
            `/api/admin/cursos/${cursoId}/modulos/${moduloAEliminar.id}`,
            { method: 'DELETE' },
            'Módulo eliminado'
          )
          if (ok) setModuloAEliminar(null)
        }}
        onCancel={() => setModuloAEliminar(null)}
      />

      {/* Confirmar eliminar lección */}
      <ConfirmDialog
        open={leccionAEliminar !== null}
        danger
        title="Eliminar lección"
        message={
          <>
            Vas a eliminar la lección <strong>{leccionAEliminar?.leccion.titulo}</strong>
            {leccionAEliminar?.leccion.material_path ? ' y su PDF adjunto' : ''}. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar lección"
        busy={ocupado}
        onConfirm={async () => {
          if (!leccionAEliminar) return
          const ok = await api(
            `/api/admin/cursos/${cursoId}/lecciones/${leccionAEliminar.leccion.id}`,
            { method: 'DELETE' },
            'Lección eliminada'
          )
          if (ok) setLeccionAEliminar(null)
        }}
        onCancel={() => setLeccionAEliminar(null)}
      />
    </div>
  )
}
