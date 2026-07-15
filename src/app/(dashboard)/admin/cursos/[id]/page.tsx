'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, Globe, Loader2, Users } from 'lucide-react'
import { CursoDatosForm } from '@/components/admin/cursos/CursoDatosForm'
import { ModulosEditor } from '@/components/admin/cursos/ModulosEditor'
import { AlumnosTab } from '@/components/admin/cursos/AlumnosTab'
import { PublicacionTab } from '@/components/admin/cursos/PublicacionTab'
import { ToastContainer, useToast } from '@/components/ui/toast'
import type { CursoDetalle } from '@/types/cursos'

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

type Tab = 'contenido' | 'alumnos' | 'publicacion'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'contenido', label: 'Contenido', icon: BookOpen },
  { id: 'alumnos', label: 'Alumnos', icon: Users },
  { id: 'publicacion', label: 'Publicación', icon: Globe },
]

export default function EditorCursoPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const cursoId = params.id
  const { toasts, showToast, removeToast } = useToast()

  const [detalle, setDetalle] = useState<CursoDetalle | null>(null)
  const [noEncontrado, setNoEncontrado] = useState(false)
  const [tab, setTab] = useState<Tab>('contenido')
  // Secuencia de peticiones: descarta respuestas obsoletas (dos refetch en
  // vuelo pueden resolverse fuera de orden y dejar la UI con datos viejos)
  const seqRef = useRef(0)

  const cargar = useCallback(async () => {
    const seq = ++seqRef.current
    try {
      const res = await fetch(`/api/admin/cursos/${cursoId}`)
      if (seq !== seqRef.current) return // llegó tarde: la descarta
      if (res.status === 404) {
        setNoEncontrado(true)
        return
      }
      if (!res.ok) throw new Error()
      const json = await res.json()
      if (seq !== seqRef.current) return
      setDetalle(json)
    } catch {
      if (seq === seqRef.current) showToast('No se pudo cargar el curso', 'error')
    }
  }, [cursoId, showToast])

  useEffect(() => { cargar() }, [cargar])

  // Aviso de portada fallida desde /admin/cursos/nuevo (?portada=fallo)
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    if (qs.get('portada') === 'fallo') {
      showToast('El curso se creó, pero la portada no se pudo subir. Súbela desde la pestaña Contenido.', 'error', 8000)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [showToast])

  const onChanged = useCallback(async (mensaje?: string) => {
    if (mensaje) showToast(mensaje, 'success')
    await cargar()
  }, [cargar, showToast])

  const onError = useCallback((mensaje: string) => {
    showToast(mensaje, 'error')
  }, [showToast])

  if (noEncontrado) {
    return (
      <div className="space-y-6">
        <ToastContainer toasts={toasts} onClose={removeToast} />
        <div className="rounded-xl p-10 text-center" style={CARD}>
          <p className="text-base font-semibold mb-2" style={{ color: '#F1F5F9' }}>
            Curso no encontrado
          </p>
          <button
            onClick={() => router.push('/admin/cursos')}
            className="text-sm font-medium underline"
            style={{ color: '#7B8AFF' }}
          >
            Volver a la lista de cursos
          </button>
        </div>
      </div>
    )
  }

  if (!detalle) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
      </div>
    )
  }

  const { curso, modulos, inscritos } = detalle
  const publicado = curso.estado === 'publicado'

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Encabezado */}
      <div>
        <Link
          href="/admin/cursos"
          className="inline-flex items-center gap-1.5 text-sm font-medium mb-2 transition-colors"
          style={{ color: '#7B8AFF' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#9AA6FF' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#7B8AFF' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a cursos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>{curso.nombre}</h2>
          <span
            className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
            style={publicado
              ? { background: 'rgba(16,185,129,0.15)', color: '#34D399' }
              : { background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}
          >
            {publicado ? 'Publicado' : 'Borrador'}
          </span>
          <span
            className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
            style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF' }}
          >
            {curso.tipo}
          </span>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-2 flex-wrap" role="tablist">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              role="tab"
              aria-selected={active}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? 'rgba(91,108,255,0.15)' : 'transparent',
                color: active ? '#7B8AFF' : '#94A3B8',
                border: active ? '1px solid rgba(91,108,255,0.35)' : '1px solid #2A2F3E',
              }}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.id === 'alumnos' && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    background: active ? 'rgba(91,108,255,0.25)' : 'rgba(255,255,255,0.07)',
                    color: active ? '#7B8AFF' : '#64748B',
                  }}
                >
                  {inscritos.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Contenido de pestañas */}
      {tab === 'contenido' && (
        <div className="space-y-6">
          <CursoDatosForm curso={curso} onChanged={onChanged} onError={onError} />
          <div>
            <h3 className="text-base font-bold mb-3" style={{ color: '#F1F5F9' }}>
              Módulos y lecciones
            </h3>
            <ModulosEditor cursoId={curso.id} modulos={modulos} onChanged={onChanged} onError={onError} />
          </div>
        </div>
      )}

      {tab === 'alumnos' && (
        <AlumnosTab cursoId={curso.id} inscritos={inscritos} onChanged={onChanged} onError={onError} />
      )}

      {tab === 'publicacion' && (
        <PublicacionTab curso={curso} numInscritos={inscritos.length} onChanged={onChanged} onError={onError} />
      )}
    </div>
  )
}
