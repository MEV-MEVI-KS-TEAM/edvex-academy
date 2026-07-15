'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { GraduationCap, Layers, FileText, Users, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/admin/cursos/ConfirmDialog'
import { ToastContainer, useToast } from '@/components/ui/toast'
import type { CursoListItem } from '@/types/cursos'

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

function EstadoBadge({ estado }: { estado: string }) {
  const publicado = estado === 'publicado'
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{
        background: publicado ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
        color: publicado ? '#34D399' : '#F59E0B',
      }}
    >
      {publicado ? 'Publicado' : 'Borrador'}
    </span>
  )
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF' }}
    >
      {tipo === 'diplomado' ? 'Diplomado' : 'Curso'}
    </span>
  )
}

export default function AdminCursosPage() {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  const [cursos, setCursos] = useState<CursoListItem[] | null>(null)
  const [aEliminar, setAEliminar] = useState<CursoListItem | null>(null)
  const [borrando, setBorrando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cursos')
      if (!res.ok) throw new Error()
      setCursos(await res.json())
    } catch {
      setCursos([])
      showToast('No se pudieron cargar los cursos', 'error')
    }
  }, [showToast])

  useEffect(() => { cargar() }, [cargar])

  async function eliminarCurso() {
    if (!aEliminar) return
    setBorrando(true)
    try {
      const res = await fetch(`/api/admin/cursos/${aEliminar.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Error al eliminar')
      }
      showToast(`Curso "${aEliminar.nombre}" eliminado`, 'success')
      setAEliminar(null)
      await cargar()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al eliminar', 'error')
    } finally {
      setBorrando(false)
    }
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Cursos y Diplomados</h2>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
            Crea cursos con módulos y lecciones, y asígnalos a tus alumnos.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/cursos/nuevo')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
          style={{ background: '#5B6CFF', color: '#fff' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#7B8AFF' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
        >
          <Plus className="w-4 h-4" />
          Nuevo curso
        </button>
      </div>

      {/* Estado de carga */}
      {cursos === null && (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
        </div>
      )}

      {/* Vacío */}
      {cursos !== null && cursos.length === 0 && (
        <div className="rounded-xl p-10 text-center" style={CARD}>
          <GraduationCap className="w-10 h-10 mx-auto mb-3" style={{ color: '#5B6CFF', opacity: 0.5 }} />
          <p className="text-base font-semibold mb-1" style={{ color: '#F1F5F9' }}>
            Aún no hay cursos
          </p>
          <p className="text-sm mb-4" style={{ color: '#94A3B8' }}>
            Crea tu primer curso o diplomado para empezar.
          </p>
          <Link
            href="/admin/cursos/nuevo"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
            style={{ background: '#5B6CFF', color: '#fff' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#7B8AFF' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
          >
            <Plus className="w-4 h-4" />
            Nuevo curso
          </Link>
        </div>
      )}

      {/* Grid de cursos */}
      {cursos !== null && cursos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cursos.map(curso => (
            <div
              key={curso.id}
              className="rounded-xl overflow-hidden flex flex-col"
              style={CARD}
            >
              {/* Portada */}
              <div className="relative w-full" style={{ aspectRatio: '16/9', background: 'linear-gradient(135deg, #1E2233 0%, #12141C 100%)' }}>
                {curso.portadaUrl ? (
                  <Image
                    src={curso.portadaUrl}
                    alt={`Portada de ${curso.nombre}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <GraduationCap className="w-10 h-10" style={{ color: 'rgba(91,108,255,0.35)' }} />
                  </div>
                )}
              </div>

              {/* Cuerpo */}
              <div className="p-4 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold leading-snug" style={{ color: '#F1F5F9' }}>
                    {curso.nombre}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <TipoBadge tipo={curso.tipo} />
                  <EstadoBadge estado={curso.estado} />
                </div>

                <div className="flex items-center gap-4 text-xs" style={{ color: '#94A3B8' }}>
                  <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{curso.numModulos} módulos</span>
                  <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{curso.numLecciones} lecciones</span>
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{curso.numAlumnos} alumnos</span>
                </div>

                <div className="flex gap-2 mt-auto pt-2">
                  <Link
                    href={`/admin/cursos/${curso.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
                    style={{ background: '#5B6CFF', color: '#fff' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#7B8AFF' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </Link>
                  <button
                    onClick={() => setAEliminar(curso)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                    aria-label={`Eliminar ${curso.nombre}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de eliminación (escribir el nombre para confirmar) */}
      <ConfirmDialog
        open={aEliminar !== null}
        danger
        title="Eliminar curso"
        message={
          <>
            Vas a eliminar <strong style={{ color: '#F1F5F9' }}>{aEliminar?.nombre}</strong> con sus módulos, lecciones,
            materiales y las asignaciones de {aEliminar?.numAlumnos ?? 0} alumno(s).
            <br />Esta acción no se puede deshacer.
          </>
        }
        requireText={aEliminar?.nombre}
        confirmLabel="Eliminar definitivamente"
        busy={borrando}
        onConfirm={eliminarCurso}
        onCancel={() => setAEliminar(null)}
      />
    </div>
  )
}
