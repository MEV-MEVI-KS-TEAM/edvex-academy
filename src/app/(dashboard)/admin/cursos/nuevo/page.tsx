'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ImagePlus, X, Loader2 } from 'lucide-react'
import { ToastContainer, useToast } from '@/components/ui/toast'
import { validarPortada } from '@/lib/cursos/archivos'
import { subirArchivoCursos } from '@/lib/cursos/upload'

const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }

function focusAccent(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.border = '1px solid #5B6CFF'
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.border = '1px solid #2A2F3E'
}

export default function NuevoCursoPage() {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [nombre, setNombre] = useState('')
  const [nombreEn, setNombreEn] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [descripcionEn, setDescripcionEn] = useState('')
  const [tipo, setTipo] = useState<'curso' | 'diplomado'>('curso')
  const [portada, setPortada] = useState<File | null>(null)
  const [portadaPreview, setPortadaPreview] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Revocar el object URL vigente al desmontar (Cancelar o navegación)
  useEffect(() => {
    return () => {
      if (portadaPreview) URL.revokeObjectURL(portadaPreview)
    }
  }, [portadaPreview])

  function onPortadaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const valid = validarPortada(file)
    if (!valid.ok) {
      showToast(valid.error, 'error')
      e.target.value = ''
      return
    }
    setPortada(file)
    setPortadaPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  function quitarPortada() {
    setPortada(null)
    setPortadaPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) {
      showToast('El nombre es requerido', 'error')
      return
    }
    setGuardando(true)
    try {
      const res = await fetch('/api/admin/cursos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          nombre_en: nombreEn.trim() || null,
          descripcion: descripcion.trim() || null,
          descripcion_en: descripcionEn.trim() || null,
          tipo,
        }),
      })
      const json = await res.json().catch(() => ({} as { id?: string; error?: string }))
      if (!res.ok || !json.id) throw new Error(json.error ?? 'Error al crear el curso')

      // Portada opcional (signed URL directo a Storage). Un fallo aquí NO debe
      // dejar al usuario en este form (reintentar duplicaría el curso): se
      // navega SIEMPRE y el editor muestra el aviso vía ?portada=fallo.
      let portadaFallo = false
      if (portada) {
        try {
          const resultado = await subirArchivoCursos(`/api/admin/cursos/${json.id}/portada`, portada)
          if (!resultado.ok) portadaFallo = true
        } catch {
          portadaFallo = true
        }
      }

      router.push(`/admin/cursos/${json.id}${portadaFallo ? '?portada=fallo' : ''}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al crear el curso', 'error')
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div>
        <Link
          href="/admin/cursos"
          className="inline-flex items-center gap-1.5 text-sm font-medium mb-3 transition-colors"
          style={{ color: '#7B8AFF' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#5B6CFF' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#7B8AFF' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a cursos
        </Link>
        <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Nuevo curso</h2>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
          Se crea como borrador: podrás agregar módulos y lecciones antes de publicarlo.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl p-6 space-y-5"
        style={{ background: '#181C26', border: '1px solid #2A2F3E' }}
      >
        <div>
          <label htmlFor="nombre" className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
            Nombre <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            id="nombre"
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            required
            maxLength={200}
            placeholder="Ej. Diplomado en Ventas Digitales"
            className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
            style={INPUT_STYLE}
            onFocus={focusAccent}
            onBlur={blurBorder}
          />
          <label htmlFor="nombre-en" className="block text-xs font-medium mt-2 mb-1" style={{ color: '#64748B' }}>
            English (opcional)
          </label>
          <input
            id="nombre-en"
            type="text"
            value={nombreEn}
            onChange={e => setNombreEn(e.target.value)}
            maxLength={200}
            placeholder="Course name in English"
            className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
            style={INPUT_STYLE}
            onFocus={focusAccent}
            onBlur={blurBorder}
          />
        </div>

        <div>
          <label htmlFor="descripcion" className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
            Descripción
          </label>
          <textarea
            id="descripcion"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={4}
            placeholder="¿De qué trata este curso?"
            className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-y"
            style={INPUT_STYLE}
            onFocus={focusAccent}
            onBlur={blurBorder}
          />
          <label htmlFor="descripcion-en" className="block text-xs font-medium mt-2 mb-1" style={{ color: '#64748B' }}>
            English (opcional)
          </label>
          <textarea
            id="descripcion-en"
            value={descripcionEn}
            onChange={e => setDescripcionEn(e.target.value)}
            rows={4}
            placeholder="Description in English"
            className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-y"
            style={INPUT_STYLE}
            onFocus={focusAccent}
            onBlur={blurBorder}
          />
        </div>

        <div>
          <span className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
            Tipo <span style={{ color: '#EF4444' }}>*</span>
          </span>
          <div className="flex gap-2">
            {(['curso', 'diplomado'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className="px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
                style={tipo === t
                  ? { background: '#5B6CFF', color: '#fff', border: '1px solid #5B6CFF' }
                  : { background: 'rgba(255,255,255,0.03)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                aria-pressed={tipo === t}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
            Portada <span className="font-normal text-xs" style={{ color: '#64748B' }}>(opcional · JPG/PNG/WebP · máx 5MB)</span>
          </span>
          {portadaPreview ? (
            <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: '16/9', maxWidth: 420 }}>
              {/* preview local de un blob: URL.createObjectURL — <img> nativo a propósito */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portadaPreview} alt="Vista previa de la portada" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={quitarPortada}
                className="absolute top-2 right-2 p-1.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                aria-label="Quitar portada"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium w-full justify-center transition-all"
              style={{ border: '2px dashed #2A2F3E', color: '#94A3B8', background: 'rgba(255,255,255,0.02)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#5B6CFF' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A2F3E' }}
            >
              <ImagePlus className="w-4 h-4" />
              Seleccionar imagen
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPortadaChange}
            className="hidden"
            aria-label="Archivo de portada"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link
            href="/admin/cursos"
            className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ border: '1px solid #2A2F3E', color: '#94A3B8', background: 'rgba(255,255,255,0.03)' }}
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={guardando}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
            style={{ background: '#5B6CFF', color: '#fff' }}
          >
            {guardando ? <><Loader2 className="w-4 h-4 animate-spin" />Creando…</> : 'Crear curso'}
          </button>
        </div>
      </form>
    </div>
  )
}
