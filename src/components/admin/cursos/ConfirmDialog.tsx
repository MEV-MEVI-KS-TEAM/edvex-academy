'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** Si se define, el usuario debe escribir este texto exacto para confirmar. */
  requireText?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  danger = false, requireText, busy = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  if (!open) return null

  const textOk = !requireText || typed.trim() === requireText

  function handleCancel() {
    setTyped('')
    onCancel()
  }
  function handleConfirm() {
    if (!textOk || busy) return
    setTyped('')
    onConfirm()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={busy ? undefined : handleCancel} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: '#181C26', border: '1px solid #2A2F3E' }}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            {danger && <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#EF4444' }} />}
            <h3 className="text-lg font-bold" style={{ color: '#F1F5F9' }}>{title}</h3>
          </div>
          <button
            onClick={handleCancel}
            disabled={busy}
            className="p-1 rounded-lg disabled:opacity-40"
            style={{ color: '#94A3B8' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-sm mb-4 leading-relaxed" style={{ color: '#94A3B8' }}>
          {message}
        </div>

        {requireText && (
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#94A3B8' }}>
              Escribe <span className="font-bold" style={{ color: '#EF4444' }}>{requireText}</span> para confirmar:
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={INPUT_STYLE}
              onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
              onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
              placeholder={requireText}
              autoFocus
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
            style={{ border: '1px solid #2A2F3E', color: '#94A3B8', background: 'rgba(255,255,255,0.03)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!textOk || busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: danger ? '#EF4444' : '#5B6CFF',
              color: '#fff',
            }}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
