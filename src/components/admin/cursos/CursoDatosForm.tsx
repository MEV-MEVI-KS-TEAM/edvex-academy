'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ImagePlus, Trash2, Loader2 } from 'lucide-react'
import { validarPortada } from '@/lib/cursos/archivos'
import { subirArchivoCursos } from '@/lib/cursos/upload'
import type { Curso } from '@/types/cursos'

interface CursoDatosFormProps {
  curso: Curso & { portadaUrl: string | null }
  onChanged: (mensaje?: string) => void | Promise<void>
  onError: (mensaje: string) => void
}

const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }

function focusAccent(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.border = '1px solid #5B6CFF'
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.border = '1px solid #2A2F3E'
}

export function CursoDatosForm({ curso, onChanged, onError }: CursoDatosFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [nombre, setNombre] = useState(curso.nombre)
  const [nombreEn, setNombreEn] = useState(curso.nombre_en ?? '')
  const [descripcion, setDescripcion] = useState(curso.descripcion ?? '')
  const [descripcionEn, setDescripcionEn] = useState(curso.descripcion_en ?? '')
  const [tipo, setTipo] = useState(curso.tipo)
  const [guardando, setGuardando] = useState(false)
  const [subiendoPortada, setSubiendoPortada] = useState(false)

  const hayCambios =
    nombre.trim() !== curso.nombre ||
    (nombreEn.trim() || '') !== (curso.nombre_en ?? '') ||
    (descripcion.trim() || null) !== (curso.descripcion ?? null) ||
    (descripcionEn.trim() || '') !== (curso.descripcion_en ?? '') ||
    tipo !== curso.tipo

  // Sincronizar con el refetch del padre SOLO si no hay edición local sin
  // guardar (cada mutación en el editor re-crea el objeto curso, y un reset
  // incondicional borraría lo que el admin está escribiendo).
  useEffect(() => {
    if (!hayCambios) {
      setNombre(curso.nombre)
      setNombreEn(curso.nombre_en ?? '')
      setDescripcion(curso.descripcion ?? '')
      setDescripcionEn(curso.descripcion_en ?? '')
      setTipo(curso.tipo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curso])

  async function guardarDatos(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) {
      onError('El nombre no puede estar vacío')
      return
    }
    setGuardando(true)
    try {
      const res = await fetch(`/api/admin/cursos/${curso.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          nombre_en: nombreEn.trim() || null,
          descripcion: descripcion.trim() || null,
          descripcion_en: descripcionEn.trim() || null,
          tipo,
        }),
      })
      const json = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')
      onChanged('Datos del curso guardados')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function onPortadaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const valid = validarPortada(file)
    if (!valid.ok) {
      onError(valid.error)
      e.target.value = ''
      return
    }
    setSubiendoPortada(true)
    try {
      // Subida directa a Storage (evita el límite de 4.5MB de Vercel)
      const resultado = await subirArchivoCursos(`/api/admin/cursos/${curso.id}/portada`, file)
      if (!resultado.ok) throw new Error(resultado.error)
      onChanged('Portada actualizada')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al subir la portada')
    } finally {
      setSubiendoPortada(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function quitarPortada() {
    setSubiendoPortada(true)
    try {
      const res = await fetch(`/api/admin/cursos/${curso.id}/portada`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Error al quitar la portada')
      }
      onChanged('Portada eliminada')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al quitar la portada')
    } finally {
      setSubiendoPortada(false)
    }
  }

  return (
    <form
      onSubmit={guardarDatos}
      className="rounded-xl p-6 space-y-5"
      style={{ background: '#181C26', border: '1px solid #2A2F3E' }}
    >
      <h3 className="text-base font-bold" style={{ color: '#F1F5F9' }}>Datos del curso</h3>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="curso-nombre" className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
              Nombre <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              id="curso-nombre"
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              maxLength={200}
              className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
              style={INPUT_STYLE}
              onFocus={focusAccent}
              onBlur={blurBorder}
            />
            <label htmlFor="curso-nombre-en" className="block text-xs font-medium mt-2 mb-1" style={{ color: '#64748B' }}>
              English (opcional)
            </label>
            <input
              id="curso-nombre-en"
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
            <label htmlFor="curso-descripcion" className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
              Descripción
            </label>
            <textarea
              id="curso-descripcion"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={4}
              className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-y"
              style={INPUT_STYLE}
              onFocus={focusAccent}
              onBlur={blurBorder}
            />
            <label htmlFor="curso-descripcion-en" className="block text-xs font-medium mt-2 mb-1" style={{ color: '#64748B' }}>
              English (opcional)
            </label>
            <textarea
              id="curso-descripcion-en"
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
            <span className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>Tipo</span>
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
        </div>

        {/* Portada */}
        <div>
          <span className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
            Portada <span className="font-normal text-xs" style={{ color: '#64748B' }}>(JPG/PNG/WebP · máx 5MB)</span>
          </span>
          <div className="relative rounded-xl overflow-hidden mb-2" style={{ aspectRatio: '16/9', background: 'linear-gradient(135deg, #1E2233 0%, #12141C 100%)' }}>
            {curso.portadaUrl && (
              <Image
                src={curso.portadaUrl}
                alt={`Portada de ${curso.nombre}`}
                fill
                sizes="280px"
                className="object-cover"
              />
            )}
            {!curso.portadaUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs" style={{ color: '#64748B' }}>Sin portada</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={subiendoPortada}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all"
              style={{ border: '1px solid rgba(91,108,255,0.25)', color: '#7B8AFF', background: 'rgba(91,108,255,0.08)' }}
            >
              {subiendoPortada
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ImagePlus className="w-3.5 h-3.5" />}
              {subiendoPortada ? 'Subiendo…' : curso.portadaUrl ? 'Reemplazar' : 'Subir portada'}
            </button>
            {curso.portadaUrl && (
              <button
                type="button"
                onClick={quitarPortada}
                disabled={subiendoPortada}
                className="flex items-center justify-center px-3 py-2 rounded-lg disabled:opacity-50 transition-all"
                style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}
                aria-label="Quitar portada"
                title="Quitar portada"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPortadaChange}
            className="hidden"
            aria-label="Archivo de portada"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={guardando || !hayCambios || !nombre.trim()}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
          style={{ background: '#5B6CFF', color: '#fff' }}
        >
          {guardando ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando…</> : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
