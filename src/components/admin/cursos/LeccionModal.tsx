'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Trash2, Upload, X } from 'lucide-react'
import { VideoPreview } from './VideoPreview'
import { validarMaterial } from '@/lib/cursos/archivos'
import { subirArchivoCursos } from '@/lib/cursos/upload'
import type { CursoLeccion } from '@/types/cursos'

const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }

interface LeccionModalProps {
  open: boolean
  cursoId: string
  moduloId: string
  /** null → crear; con valor → editar */
  leccion: CursoLeccion | null
  onClose: () => void
  /** Se llama tras guardar con éxito para refrescar el detalle. */
  onSaved: (mensaje: string) => void
  /** Refetch silencioso: para fallos parciales (lección guardada, archivo no). */
  onPartial: () => void
  onError: (mensaje: string) => void
}

export function LeccionModal({ open, cursoId, moduloId, leccion, onClose, onSaved, onPartial, onError }: LeccionModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [titulo, setTitulo] = useState('')
  const [tituloEn, setTituloEn] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [texto, setTexto] = useState('')
  const [textoEn, setTextoEn] = useState('')
  const [material, setMaterial] = useState<File | null>(null)
  const [quitarMaterialActual, setQuitarMaterialActual] = useState(false)
  const [guardando, setGuardando] = useState(false)
  // Si el POST de creación tuvo éxito pero el PDF falló, aquí queda el id
  // real: el reintento hace PATCH sobre esta lección (evita duplicados).
  const [leccionIdGuardada, setLeccionIdGuardada] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitulo(leccion?.titulo ?? '')
      setTituloEn(leccion?.titulo_en ?? '')
      setVideoUrl(leccion?.video_url ?? '')
      setTexto(leccion?.contenido_texto ?? '')
      setTextoEn(leccion?.contenido_texto_en ?? '')
      setMaterial(null)
      setQuitarMaterialActual(false)
      setGuardando(false)
      setLeccionIdGuardada(null)
    }
  }, [open, leccion])

  if (!open) return null

  function onMaterialChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const valid = validarMaterial(file)
    if (!valid.ok) {
      onError(valid.error)
      e.target.value = ''
      return
    }
    setMaterial(file)
    setQuitarMaterialActual(false)
  }

  async function handleGuardar() {
    const t = titulo.trim()
    if (!t) {
      onError('El título es requerido')
      return
    }
    setGuardando(true)
    try {
      // El id puede venir del prop (editar) o de un intento anterior que creó
      // la lección pero falló en el archivo (evita POST duplicado al reintentar)
      let leccionId = leccion?.id ?? leccionIdGuardada

      if (!leccionId) {
        // Crear
        const res = await fetch(`/api/admin/cursos/${cursoId}/lecciones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modulo_id: moduloId,
            titulo: t,
            titulo_en: tituloEn.trim(),
            video_url: videoUrl.trim() || null,
            contenido_texto: texto.trim() || null,
            contenido_texto_en: textoEn.trim(),
          }),
        })
        const json = await res.json().catch(() => ({} as { id?: string; error?: string }))
        if (!res.ok) throw new Error(json.error ?? 'Error al crear la lección')
        leccionId = json.id as string
        setLeccionIdGuardada(leccionId)
      } else {
        // Editar (o reintento tras creación parcial)
        const res = await fetch(`/api/admin/cursos/${cursoId}/lecciones/${leccionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titulo: t,
            titulo_en: tituloEn.trim(),
            video_url: videoUrl.trim() || null,
            contenido_texto: texto.trim() || null,
            contenido_texto_en: textoEn.trim(),
          }),
        })
        const json = await res.json().catch(() => ({} as { error?: string }))
        if (!res.ok) throw new Error(json.error ?? 'Error al guardar la lección')
      }

      // Material: subir nuevo (reemplaza el anterior) o quitar el actual.
      // La subida va directa a Storage con signed URL (límite Vercel 4.5MB).
      if (material && leccionId) {
        const resultado = await subirArchivoCursos(
          `/api/admin/cursos/${cursoId}/lecciones/${leccionId}/material`,
          material
        )
        if (!resultado.ok) {
          // Fallo PARCIAL: la lección sí quedó guardada → refetch silencioso
          // para que aparezca en la lista, y el modal queda abierto para
          // reintentar el PDF (leccionIdGuardada evita duplicarla).
          onPartial()
          throw new Error(`La lección se guardó, pero el PDF falló: ${resultado.error}. Reintenta la subida.`)
        }
      } else if (quitarMaterialActual && leccionId && leccion?.material_path) {
        const rmRes = await fetch(`/api/admin/cursos/${cursoId}/lecciones/${leccionId}/material`, { method: 'DELETE' })
        if (!rmRes.ok) {
          const rmJson = await rmRes.json().catch(() => ({} as { error?: string }))
          onPartial()
          throw new Error(`La lección se guardó, pero no se pudo quitar el PDF: ${rmJson.error ?? 'error'}`)
        }
      }

      onSaved(leccion ? 'Lección actualizada' : 'Lección creada')
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const materialActualVisible = Boolean(leccion?.material_path) && !material && !quitarMaterialActual

  const focusAccent = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.border = '1px solid #5B6CFF' }
  const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.border = '1px solid #2A2F3E' }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={leccion ? 'Editar lección' : 'Nueva lección'}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={guardando ? undefined : onClose} />
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: '#181C26', border: '1px solid #2A2F3E', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: '#F1F5F9' }}>
            {leccion ? 'Editar lección' : 'Nueva lección'}
          </h3>
          <button
            onClick={onClose}
            disabled={guardando}
            className="p-1.5 rounded-lg disabled:opacity-40"
            style={{ color: '#94A3B8' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="leccion-titulo" className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
              Título <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              id="leccion-titulo"
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              maxLength={200}
              placeholder="Ej. Introducción al módulo"
              className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
              style={INPUT_STYLE}
              onFocus={focusAccent}
              onBlur={blurBorder}
            />
            <input
              id="leccion-titulo-en"
              type="text"
              value={tituloEn}
              onChange={e => setTituloEn(e.target.value)}
              maxLength={200}
              placeholder="English (opcional)"
              className="w-full rounded-lg px-3.5 py-2 text-sm outline-none mt-2"
              style={INPUT_STYLE}
              onFocus={focusAccent}
              onBlur={blurBorder}
              aria-label="Título en inglés (opcional)"
            />
          </div>

          <div>
            <label htmlFor="leccion-video" className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
              URL de video <span className="font-normal text-xs" style={{ color: '#94A3B8' }}>(YouTube, Vimeo o Loom)</span>
            </label>
            <input
              id="leccion-video"
              type="url"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
              style={INPUT_STYLE}
              onFocus={focusAccent}
              onBlur={blurBorder}
            />
            <VideoPreview url={videoUrl} titulo={titulo} />
          </div>

          <div>
            <label htmlFor="leccion-texto" className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
              Texto de la lección
            </label>
            <textarea
              id="leccion-texto"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={5}
              placeholder="Contenido en texto plano. Los saltos de línea se respetan al mostrarse."
              className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-y"
              style={INPUT_STYLE}
              onFocus={focusAccent}
              onBlur={blurBorder}
            />
            <label htmlFor="leccion-texto-en" className="block text-xs font-medium mt-2 mb-1" style={{ color: '#94A3B8' }}>
              English (opcional)
            </label>
            <textarea
              id="leccion-texto-en"
              value={textoEn}
              onChange={e => setTextoEn(e.target.value)}
              rows={4}
              placeholder="Lesson text in English (optional)."
              className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-y"
              style={INPUT_STYLE}
              onFocus={focusAccent}
              onBlur={blurBorder}
            />
          </div>

          <div>
            <span className="block text-sm font-semibold mb-1.5" style={{ color: '#F1F5F9' }}>
              Material PDF <span className="font-normal text-xs" style={{ color: '#94A3B8' }}>(opcional · máx 10MB)</span>
            </span>

            {materialActualVisible && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-2" style={{ background: '#0D1017', border: '1px solid #2A2F3E' }}>
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#7B8AFF' }} />
                {leccion?.materialUrl ? (
                  <a
                    href={leccion.materialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium truncate flex-1 hover:underline"
                    style={{ color: '#7B8AFF' }}
                  >
                    {leccion.material_path?.split('/').pop()}
                  </a>
                ) : (
                  <span className="text-sm truncate flex-1" style={{ color: '#94A3B8' }}>
                    {leccion?.material_path?.split('/').pop()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setQuitarMaterialActual(true)}
                  className="p-1 rounded"
                  style={{ color: '#EF4444' }}
                  aria-label="Quitar PDF actual"
                  title="Quitar PDF"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {quitarMaterialActual && (
              <p className="text-xs mb-2" style={{ color: '#F59E0B' }}>
                El PDF actual se eliminará al guardar.{' '}
                <button type="button" onClick={() => setQuitarMaterialActual(false)} className="underline font-medium">
                  Deshacer
                </button>
              </p>
            )}

            {material ? (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#34D399' }} />
                <span className="text-sm font-medium truncate flex-1" style={{ color: '#34D399' }}>{material.name}</span>
                <button
                  type="button"
                  onClick={() => { setMaterial(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="p-1 rounded"
                  style={{ color: '#EF4444' }}
                  aria-label="Quitar PDF seleccionado"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium w-full justify-center transition-colors"
                style={{ border: '2px dashed #2A2F3E', color: '#94A3B8', background: '#0D1017' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#5B6CFF' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A2F3E' }}
              >
                <Upload className="w-4 h-4" />
                {leccion?.material_path && !quitarMaterialActual ? 'Reemplazar PDF' : 'Seleccionar PDF'}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={onMaterialChange}
              className="hidden"
              aria-label="Archivo PDF de material"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={guardando || !titulo.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all"
            style={{ background: '#5B6CFF', color: '#fff' }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#7B8AFF' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
          >
            {guardando ? 'Guardando…' : 'Guardar lección'}
          </button>
        </div>
      </div>
    </div>
  )
}
