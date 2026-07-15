'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Globe, PencilLine } from 'lucide-react'
import type { Curso } from '@/types/cursos'

interface PublicacionTabProps {
  curso: Curso
  numInscritos: number
  onChanged: (mensaje?: string) => void | Promise<void>
  onError: (mensaje: string) => void
}

export function PublicacionTab({ curso, numInscritos, onChanged, onError }: PublicacionTabProps) {
  const [cambiando, setCambiando] = useState(false)
  const publicado = curso.estado === 'publicado'

  async function toggleEstado() {
    setCambiando(true)
    try {
      const nuevo = publicado ? 'borrador' : 'publicado'
      const res = await fetch(`/api/admin/cursos/${curso.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevo }),
      })
      const json = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) throw new Error(json.error ?? 'Error al cambiar el estado')
      onChanged(nuevo === 'publicado' ? 'Curso publicado 🎉' : 'Curso pasado a borrador')
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error al cambiar el estado')
    } finally {
      setCambiando(false)
    }
  }

  return (
    <div
      className="rounded-xl p-6 space-y-6 max-w-2xl"
      style={{ background: '#181C26', border: '1px solid #2A2F3E' }}
    >
      <div>
        <h3 className="text-base font-bold mb-1" style={{ color: '#F1F5F9' }}>Publicación</h3>
        <p className="text-sm" style={{ color: '#94A3B8' }}>
          Tus alumnos asignados solo ven cursos <strong style={{ color: '#F1F5F9' }}>publicados</strong>. Mientras el curso
          esté en borrador, puedes editarlo con calma sin que nadie lo vea.
        </p>
      </div>

      {/* Toggle de estado */}
      <div
        className="flex items-center justify-between gap-4 rounded-xl px-4 py-4"
        style={{
          background: publicado ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
          border: `1px solid ${publicado ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
        }}
      >
        <div className="flex items-center gap-3">
          {publicado
            ? <Globe className="w-5 h-5 flex-shrink-0" style={{ color: '#34D399' }} />
            : <PencilLine className="w-5 h-5 flex-shrink-0" style={{ color: '#F59E0B' }} />}
          <div>
            <p className="text-sm font-bold" style={{ color: publicado ? '#34D399' : '#F59E0B' }}>
              {publicado ? 'Publicado' : 'Borrador'}
            </p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              {publicado
                ? `Visible para tus ${numInscritos} alumno(s) asignados.`
                : 'Oculto para los alumnos (aunque estén asignados).'}
            </p>
          </div>
        </div>

        <button
          onClick={toggleEstado}
          disabled={cambiando}
          role="switch"
          aria-checked={publicado}
          aria-label={publicado ? 'Pasar a borrador' : 'Publicar curso'}
          className="relative flex-shrink-0 rounded-full transition-colors disabled:opacity-50"
          style={{
            width: 52, height: 28,
            background: publicado ? '#10B981' : '#2A2F3E',
          }}
        >
          <span
            className="absolute top-1 rounded-full transition-all"
            style={{
              width: 20, height: 20, background: '#fff',
              left: publicado ? 28 : 4,
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}
          />
        </button>
      </div>

      {/* Ver como alumno — abre el visor en modo vista previa de admin */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/alumno/cursos/${curso.id}?from=admin`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{ border: '1px solid rgba(91,108,255,0.35)', color: '#7B8AFF', background: 'rgba(91,108,255,0.08)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.08)' }}
        >
          <Eye className="w-4 h-4" />
          Ver como alumno
        </Link>
        <span className="text-xs" style={{ color: '#64748B' }}>
          Se abre en modo vista previa{publicado ? '' : ' (incluso en borrador)'}.
        </span>
      </div>
    </div>
  )
}
