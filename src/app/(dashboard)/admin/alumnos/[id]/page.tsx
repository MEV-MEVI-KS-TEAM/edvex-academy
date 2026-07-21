'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, X, Loader2, CreditCard, Key, Eye, EyeOff, Download, FileText, Pencil, MessageCircle } from 'lucide-react'
import { useToast, ToastContainer } from '@/components/ui/toast'

interface AlumnoDetalle {
  id: string
  matricula: string
  telefono: string | null
  contactado_whatsapp: boolean
  meses_desbloqueados: number
  inscripcion_pagada: boolean
  created_at: string
  usuario: { id: string; nombre_completo: string; email: string; activo: boolean }
  plan: { id: string; nombre: string; duracion_meses: number; precio_mensual: number }
  pagos: { id: string; monto: number; mes_desbloqueado: number; metodo_pago: string; referencia: string | null; created_at: string }[]
  calificaciones: { id: string; calificacion_final: number; aprobada: boolean; materias: { nombre: string; codigo: string } }[]
}

type DocTipo =
  | 'acta_nacimiento' | 'curp' | 'certificado_primaria'
  | 'certificado_secundaria' | 'identificacion_oficial' | 'foto_perfil_doc'

type DocEstado = 'pendiente' | 'aprobado' | 'rechazado'

interface DocumentoAdmin {
  id: string
  tipo: DocTipo
  nombre_archivo: string
  estado: DocEstado
  comentario_admin?: string | null
  signed_url?: string | null
  subido_en: string
}

const DOC_TIPOS: DocTipo[] = [
  'acta_nacimiento', 'curp', 'certificado_primaria',
  'certificado_secundaria', 'identificacion_oficial', 'foto_perfil_doc',
]

const DOC_LABELS: Record<DocTipo, string> = {
  acta_nacimiento:        'Acta de Nacimiento',
  curp:                   'CURP',
  certificado_primaria:   'Certificado de Primaria',
  certificado_secundaria: 'Certificado de Secundaria',
  identificacion_oficial: 'Identificación Oficial',
  foto_perfil_doc:        'Foto (fondo blanco)',
}

const CARD_STYLE = { background: '#181C26', border: '1px solid #2A2F3E' }
const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }

export default function AlumnoDetallePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const { toasts, showToast, removeToast } = useToast()

  const [alumno, setAlumno] = useState<AlumnoDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalPago, setModalPago] = useState(false)
  const [modalReset, setModalReset] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resettingPass, setResettingPass] = useState(false)
  const [togglingActivo, setTogglingActivo] = useState(false)
  const [modalConfirmToggle, setModalConfirmToggle] = useState(false)
  const [modalEditar, setModalEditar] = useState(false)
  const [planes, setPlanes] = useState<{ id: string; nombre: string; duracion_meses: number }[]>([])
  const [markingInscripcion, setMarkingInscripcion] = useState(false)
  const [editForm, setEditForm] = useState({ nombre_completo: '', plan_estudio_id: '', matricula: '', telefono: '' })
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [pagoError, setPagoError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)
  const [resetPass, setResetPass] = useState({ password: '', confirm: '' })
  const [showResetPass, setShowResetPass] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [pago, setPago] = useState({ monto: '', metodo_pago: 'Efectivo', referencia: '' })

  // Documentos
  const [documentos, setDocumentos] = useState<DocumentoAdmin[]>([])
  const [docEdits, setDocEdits] = useState<Record<string, { estado: DocEstado; comentario: string }>>({})
  const [savingDoc, setSavingDoc] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [alumnoRes, docsRes] = await Promise.all([
        fetch(`/api/admin/alumnos/${id}`),
        fetch(`/api/admin/documentos/${id}`),
      ])
      if (!alumnoRes.ok) throw new Error('Alumno no encontrado')
      const alumnoData = await alumnoRes.json()
      setAlumno(alumnoData)
      const docsData: DocumentoAdmin[] = docsRes.ok ? await docsRes.json() : []
      setDocumentos(docsData)
      // Inicializar edits con valores actuales
      const edits: Record<string, { estado: DocEstado; comentario: string }> = {}
      for (const d of docsData) {
        edits[d.id] = { estado: d.estado, comentario: d.comentario_admin ?? '' }
      }
      setDocEdits(edits)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el alumno')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  async function handleDesbloquear(e: React.FormEvent) {
    e.preventDefault()
    setPagoError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/desbloquear-mes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pago, monto: Number(pago.monto) }),
      })
      const data = await res.json()
      if (!res.ok) { setPagoError(data.error ?? 'Error al registrar pago'); return }
      setModalPago(false)
      setPago({ monto: '', metodo_pago: 'Efectivo', referencia: '' })
      await cargar()
      if (alumno) {
        showToast(`✓ Mes desbloqueado para ${alumno.usuario.nombre_completo}`, 'success')
      }
    } catch {
      setPagoError('Error inesperado. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetError(null)
    setResetSuccess(null)
    if (resetPass.password.length < 6) {
      setResetError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (resetPass.password !== resetPass.confirm) {
      setResetError('Las contraseñas no coinciden.')
      return
    }
    setResettingPass(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPass.password }),
      })
      const data = await res.json()
      if (!res.ok) { setResetError(data.error ?? 'Error al cambiar contraseña'); return }
      setResetSuccess(resetPass.password)
      setResetPass({ password: '', confirm: '' })
      showToast('✓ Contraseña actualizada correctamente', 'success')
    } catch {
      setResetError('Error inesperado. Intenta de nuevo.')
    } finally {
      setResettingPass(false)
    }
  }

  async function handleMarcarInscripcionPagada() {
    if (!alumno || alumno.inscripcion_pagada) return
    setMarkingInscripcion(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}/inscripcion-pagada`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscripcion_pagada: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? 'Error al marcar inscripción pagada', 'error')
        return
      }
      await cargar()
      showToast(`✓ Inscripción marcada como pagada para ${alumno.usuario.nombre_completo}`, 'success')
    } catch {
      showToast('Error inesperado. Intenta de nuevo.', 'error')
    } finally {
      setMarkingInscripcion(false)
    }
  }

  async function handleAbrirEditar() {
    if (!alumno) return
    setEditForm({
      nombre_completo: alumno.usuario.nombre_completo,
      plan_estudio_id: alumno.plan.id,
      matricula: alumno.matricula,
      telefono: alumno.telefono ?? '',
    })
    setEditError(null)
    setModalEditar(true)
    if (planes.length === 0) {
      const res = await fetch('/api/admin/planes')
      if (res.ok) setPlanes(await res.json())
    }
  }

  async function handleGuardarEditar(e: React.FormEvent) {
    e.preventDefault()
    setEditError(null)
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_completo: editForm.nombre_completo.trim(),
          plan_estudio_id: editForm.plan_estudio_id,
          matricula: editForm.matricula.trim(),
          telefono: editForm.telefono.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setEditError(data.error || 'Error al guardar cambios')
        return
      }
      setModalEditar(false)
      await cargar()
      showToast('✓ Datos del alumno actualizados', 'success')
    } catch {
      setEditError('Error inesperado. Intenta de nuevo.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleToggleActivo() {
    if (!alumno) return
    setModalConfirmToggle(false)
    const nuevoEstado = !alumno.usuario.activo
    setTogglingActivo(true)
    try {
      const res = await fetch(`/api/admin/alumnos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: nuevoEstado }),
      })
      if (!res.ok) {
        const data = await res.json()
        showToast(data.error || 'Error al cambiar estado del alumno', 'error')
        return
      }
      await cargar()
      showToast(
        nuevoEstado
          ? `✓ Alumno ${alumno.usuario.nombre_completo} activado`
          : `Alumno ${alumno.usuario.nombre_completo} desactivado`,
        nuevoEstado ? 'success' : 'info'
      )
    } finally {
      setTogglingActivo(false)
    }
  }

  async function handleGuardarDoc(docId: string) {
    const edit = docEdits[docId]
    if (!edit) return
    // Validación en cliente equivalente a la del PATCH: avisar antes de gastar
    // un viaje al servidor, y con un mensaje que señala el campo concreto.
    if (edit.estado === 'rechazado' && !edit.comentario?.trim()) {
      showToast('Indica el motivo del rechazo para que el alumno sepa qué corregir', 'error')
      return
    }
    setSavingDoc(docId)
    try {
      const res = await fetch(`/api/admin/documentos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentoId: docId, estado: edit.estado, comentario: edit.comentario }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Error al guardar', 'error'); return }
      showToast('✓ Cambios guardados', 'success')
      await cargar()
    } catch {
      showToast('Error inesperado', 'error')
    } finally {
      setSavingDoc(null)
    }
  }

  async function handleWhatsApp() {
    if (!alumno) return
    const tel = alumno.telefono?.replace(/\D/g, '') ?? ''
    if (tel) {
      window.open(`https://wa.me/52${tel}`, '_blank')
    }
    // Marcar como contactado
    if (!alumno.contactado_whatsapp) {
      try {
        await fetch(`/api/admin/alumnos/${id}/contactar`, { method: 'PATCH' })
        setAlumno(prev => prev ? { ...prev, contactado_whatsapp: true } : prev)
      } catch { /* silent */ }
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  if (error || !alumno) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <p className="text-sm" style={{ color: '#EF4444' }}>{error ?? 'Error al cargar el alumno'}</p>
      <button onClick={() => router.push('/admin/alumnos')} className="text-sm" style={{ color: '#5B6CFF' }}>
        Regresar
      </button>
    </div>
  )

  const todosBloqueados = alumno.meses_desbloqueados >= alumno.plan.duracion_meses

  return (
    <div className="space-y-6 max-w-4xl">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/admin/alumnos')}
            className="mt-1 p-2 rounded-lg flex-shrink-0 transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>{alumno.usuario.nombre_completo}</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(91,108,255,0.15)', color: '#7B8AFF' }}>
                {alumno.matricula}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={alumno.usuario.activo
                  ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                  : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                }
              >
                {alumno.usuario.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>{alumno.usuario.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={handleAbrirEditar}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(91,108,255,0.1)', color: '#7B8AFF', border: '1px solid rgba(91,108,255,0.2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(91,108,255,0.1)' }}
          >
            <Pencil className="w-4 h-4" />
            Editar
          </button>
          <button
            onClick={() => { setModalReset(true); setResetError(null); setResetSuccess(null) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)' }}
          >
            <Key className="w-4 h-4" />
            Resetear contraseña
          </button>
          <button
            onClick={() => setModalConfirmToggle(true)}
            disabled={togglingActivo}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-60"
            style={alumno.usuario.activo
              ? { background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }
              : { background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }
            }
          >
            {togglingActivo ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (alumno.usuario.activo ? 'Desactivar alumno' : 'Activar alumno')}
          </button>
        </div>
      </div>

      {/* Info General */}
      <div className="rounded-xl p-5 space-y-3" style={CARD_STYLE}>
        <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Información General</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div><p style={{ color: '#94A3B8' }}>Plan de estudio</p><p className="mt-0.5 font-medium" style={{ color: alumno.plan.nombre ? '#F1F5F9' : '#64748B' }}>{alumno.plan.nombre || 'Sin plan asignado'}</p></div>
          <div><p style={{ color: '#94A3B8' }}>Duración total</p><p className="mt-0.5 font-medium" style={{ color: '#F1F5F9' }}>{alumno.plan.duracion_meses ? `${alumno.plan.duracion_meses} meses` : '—'}</p></div>
          <div><p style={{ color: '#94A3B8' }}>Fecha de registro</p><p className="mt-0.5 font-medium" style={{ color: '#F1F5F9' }}>{new Date(alumno.created_at).toLocaleDateString('es-MX')}</p></div>
          <div>
            <p style={{ color: '#94A3B8' }}>Teléfono / WhatsApp</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="font-medium" style={{ color: alumno.telefono ? '#F1F5F9' : '#475569' }}>{alumno.telefono || '—'}</p>
              <button
                onClick={handleWhatsApp}
                disabled={!alumno.telefono}
                title={alumno.telefono ? 'Abrir WhatsApp' : 'Sin número registrado'}
                className="p-1 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: alumno.telefono ? 'rgba(37,211,102,0.15)' : 'transparent', color: '#25D366' }}
              >
                <MessageCircle className="w-4 h-4" />
              </button>
              {alumno.contactado_whatsapp && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
                  Contactado
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progreso de meses */}
      <div className="rounded-xl p-5 space-y-4" style={CARD_STYLE}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Progreso de Meses</h3>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
              {alumno.meses_desbloqueados} de {alumno.plan.duracion_meses} meses desbloqueados
            </p>
            {!alumno.inscripcion_pagada && (
              <p className="text-xs mt-1" style={{ color: '#F59E0B' }}>
                Inscripción pendiente
              </p>
            )}
          </div>
          {!alumno.inscripcion_pagada && (
            <button
              onClick={handleMarcarInscripcionPagada}
              disabled={markingInscripcion}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: '#10B981', color: '#fff' }}
            >
              {markingInscripcion ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {markingInscripcion ? 'Marcando...' : 'Marcar inscripción pagada'}
            </button>
          )}
          <button
            onClick={() => setModalPago(true)}
            disabled={todosBloqueados}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: todosBloqueados ? 'rgba(91,108,255,0.1)' : '#5B6CFF', color: todosBloqueados ? '#7B8AFF' : '#fff' }}
            onMouseEnter={e => { if (!todosBloqueados) e.currentTarget.style.background = '#7B8AFF' }}
            onMouseLeave={e => { if (!todosBloqueados) e.currentTarget.style.background = '#5B6CFF' }}
          >
            <CreditCard className="w-4 h-4" />
            {todosBloqueados ? 'Todos los meses desbloqueados' : 'Registrar Pago y Abrir Siguiente Mes'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: alumno.plan.duracion_meses }, (_, i) => {
            const mes = i + 1
            const desbloqueado = mes <= alumno.meses_desbloqueados
            return (
              <div
                key={mes}
                className="flex items-center justify-center w-10 h-10 rounded-lg text-xs font-bold transition-all"
                style={desbloqueado
                  ? { background: 'rgba(16,185,129,0.2)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#475569', border: '1px solid #2A2F3E' }
                }
              >
                {mes}
              </div>
            )
          })}
        </div>
      </div>

      {/* Historial de Pagos */}
      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Historial de Pagos</h3>
        </div>
        {alumno.pagos.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>Sin pagos registrados</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Fecha', 'Mes', 'Monto', 'Método', 'Referencia'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alumno.pagos.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}>
                    <td className="px-4 py-3" style={{ color: '#94A3B8' }}>{new Date(p.created_at).toLocaleDateString('es-MX')}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#F1F5F9' }}>Mes {p.mes_desbloqueado}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#10B981' }}>${p.monto.toLocaleString('es-MX')}</td>
                    <td className="px-4 py-3" style={{ color: '#94A3B8' }}>{p.metodo_pago}</td>
                    <td className="px-4 py-3" style={{ color: '#94A3B8' }}>{p.referencia ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calificaciones */}
      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Calificaciones</h3>
        </div>
        {alumno.calificaciones.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: '#94A3B8' }}>Sin calificaciones registradas</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Código', 'Materia', 'Calificación', 'Estado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alumno.calificaciones.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94A3B8' }}>{c.materias.codigo}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#F1F5F9' }}>{c.materias.nombre}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: '#F1F5F9' }}>{c.calificacion_final}</td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={c.aprobada
                          ? { background: 'rgba(16,185,129,0.15)', color: '#10B981' }
                          : { background: 'rgba(239,68,68,0.15)', color: '#EF4444' }
                        }
                      >
                        {c.aprobada ? 'Aprobada' : 'Reprobada'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Documentos */}
      <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4" style={{ color: '#7B8AFF' }} />
            <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Documentos del Alumno</h3>
          </div>
          <button
            onClick={cargar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            title="Regenerar links de descarga"
          >
            <Download className="w-3.5 h-3.5" />
            Refrescar links
          </button>
        </div>
        <div className="divide-y" style={{ borderColor: '#2A2F3E' }}>
          {DOC_TIPOS.map(tipo => {
            const doc = documentos.find(d => d.tipo === tipo)
            const edit = doc ? docEdits[doc.id] : null
            const isSaving = doc ? savingDoc === doc.id : false

            return (
              <div key={tipo} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-4">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#F1F5F9' }}>{DOC_LABELS[tipo]}</p>
                  {doc ? (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs" style={{ color: '#64748B' }}>{doc.nombre_archivo}</span>
                      <span className="text-xs" style={{ color: '#475569' }}>·</span>
                      <span className="text-xs" style={{ color: '#64748B' }}>
                        {new Date(doc.subido_en).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs mt-1" style={{ color: '#475569' }}>Sin documento</p>
                  )}
                </div>

                {/* Controles admin */}
                {doc && edit ? (
                  <div className="flex flex-col gap-2 w-full sm:w-72 flex-shrink-0">
                    <div className="flex gap-2">
                      {/* Descargar */}
                      {doc.signed_url && (
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0"
                          style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Descargar
                        </a>
                      )}
                      {/* Estado dropdown */}
                      <select
                        value={edit.estado}
                        onChange={e => setDocEdits(prev => ({ ...prev, [doc.id]: { ...prev[doc.id], estado: e.target.value as DocEstado } }))}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                        style={INPUT_STYLE}
                      >
                        <option value="pendiente">⏳ Pendiente</option>
                        <option value="aprobado">✅ Aprobado</option>
                        <option value="rechazado">❌ Rechazado</option>
                      </select>
                    </div>
                    {/* Comentario */}
                    <input
                      type="text"
                      // El PATCH exige motivo al rechazar. Sin reflejarlo aquí,
                      // el admin dejaba el campo vacío fiándose de "(opcional)"
                      // y recibía un 400 sin saber qué faltaba.
                      placeholder={edit.estado === 'rechazado'
                        ? 'Motivo del rechazo (obligatorio)'
                        : 'Comentario (opcional)'}
                      value={edit.comentario}
                      onChange={e => setDocEdits(prev => ({ ...prev, [doc.id]: { ...prev[doc.id], comentario: e.target.value } }))}
                      className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                      style={INPUT_STYLE}
                      onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                      onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                    />
                    {/* Guardar */}
                    <button
                      onClick={() => handleGuardarDoc(doc.id)}
                      disabled={isSaving}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                      style={{ background: '#5B6CFF', color: '#fff' }}
                      onMouseEnter={e => { if (!isSaving) e.currentTarget.style.background = '#7B8AFF' }}
                      onMouseLeave={e => { if (!isSaving) e.currentTarget.style.background = '#5B6CFF' }}
                    >
                      {isSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Guardando...</> : 'Guardar cambios'}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs flex-shrink-0" style={{ color: '#475569' }}>—</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal Editar Alumno */}
      {modalEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold" style={{ color: '#F1F5F9' }}>Editar alumno</h3>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{alumno.matricula}</p>
              </div>
              <button
                onClick={() => setModalEditar(false)}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarEditar} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Nombre completo</label>
                <input
                  type="text"
                  required
                  value={editForm.nombre_completo}
                  onChange={e => setEditForm(f => ({ ...f, nombre_completo: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                  onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Matrícula</label>
                <input
                  type="text"
                  required
                  value={editForm.matricula}
                  onChange={e => setEditForm(f => ({ ...f, matricula: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-mono outline-none"
                  style={INPUT_STYLE}
                  onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Plan de estudio</label>
                <select
                  required
                  value={editForm.plan_estudio_id}
                  onChange={e => setEditForm(f => ({ ...f, plan_estudio_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                >
                  {planes.length === 0 && (
                    <option value={editForm.plan_estudio_id}>{alumno.plan.nombre}</option>
                  )}
                  {planes.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.duracion_meses} meses)</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>
                  Teléfono / WhatsApp <span style={{ color: '#475569' }}>(opcional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="+52 55 1234 5678"
                  value={editForm.telefono}
                  onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                  onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                />
              </div>

              {editError && (
                <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
                  {editError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalEditar(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                  style={{ background: '#5B6CFF', color: '#fff' }}
                  onMouseEnter={e => { if (!savingEdit) e.currentTarget.style.background = '#7B8AFF' }}
                  onMouseLeave={e => { if (!savingEdit) e.currentTarget.style.background = '#5B6CFF' }}
                >
                  {savingEdit ? <><Loader2 className="w-4 h-4 animate-spin" />Guardando...</> : <><Pencil className="w-4 h-4" />Guardar cambios</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Activar/Desactivar */}
      {modalConfirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: '#F1F5F9' }}>
                {alumno.usuario.activo ? 'Desactivar alumno' : 'Activar alumno'}
              </h3>
              <button
                onClick={() => setModalConfirmToggle(false)}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm mb-6" style={{ color: '#94A3B8' }}>
              {alumno.usuario.activo
                ? <>¿Desactivar a <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{alumno.usuario.nombre_completo}</span>? Perderá acceso inmediatamente.</>
                : <>¿Activar a <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{alumno.usuario.nombre_completo}</span>? Recuperará acceso a la plataforma.</>
              }
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setModalConfirmToggle(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleToggleActivo}
                disabled={togglingActivo}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={alumno.usuario.activo
                  ? { background: '#EF4444', color: '#fff' }
                  : { background: '#10B981', color: '#fff' }
                }
              >
                {togglingActivo
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Procesando...</>
                  : 'Confirmar'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Resetear Contraseña */}
      {modalReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold" style={{ color: '#F1F5F9' }}>Resetear Contraseña</h3>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                  Alumno: {alumno.usuario.nombre_completo}
                </p>
              </div>
              <button
                onClick={() => { setModalReset(false); setResetError(null); setResetSuccess(null); setResetPass({ password: '', confirm: '' }) }}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {resetSuccess ? (
              <div className="space-y-4">
                <div
                  className="rounded-xl p-4 space-y-2"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: '#10B981' }}>✓ Contraseña actualizada</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>
                    La nueva contraseña del alumno es:
                  </p>
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg font-mono text-sm"
                    style={{ background: '#0D1017', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981' }}
                  >
                    <span>{resetSuccess}</span>
                  </div>
                  <p className="text-xs" style={{ color: '#64748B' }}>
                    Comunícale esta contraseña al alumno por teléfono o mensaje.
                  </p>
                </div>
                <button
                  onClick={() => { setModalReset(false); setResetSuccess(null) }}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{ background: '#5B6CFF', color: '#fff' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#7B8AFF' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#5B6CFF' }}
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Nueva contraseña</label>
                  <div className="relative">
                    <input
                      type={showResetPass ? 'text' : 'password'}
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={resetPass.password}
                      onChange={e => setResetPass(p => ({ ...p, password: e.target.value }))}
                      className="w-full pl-3 pr-10 py-2.5 rounded-lg text-sm outline-none"
                      style={INPUT_STYLE}
                      onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                      onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: '#64748B' }}
                      tabIndex={-1}
                    >
                      {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Confirmar contraseña</label>
                  <div className="relative">
                    <input
                      type={showResetConfirm ? 'text' : 'password'}
                      required
                      placeholder="Repite la contraseña"
                      value={resetPass.confirm}
                      onChange={e => setResetPass(p => ({ ...p, confirm: e.target.value }))}
                      className="w-full pl-3 pr-10 py-2.5 rounded-lg text-sm outline-none"
                      style={INPUT_STYLE}
                      onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                      onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: '#64748B' }}
                      tabIndex={-1}
                    >
                      {showResetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {resetPass.confirm.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: resetPass.password === resetPass.confirm ? '#10B981' : '#EF4444' }}>
                      {resetPass.password === resetPass.confirm ? '✓ Coinciden' : '✗ No coinciden'}
                    </p>
                  )}
                </div>

                {resetError && (
                  <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
                    {resetError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setModalReset(false); setResetError(null); setResetPass({ password: '', confirm: '' }) }}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={resettingPass}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                    style={{ background: '#F59E0B', color: '#000' }}
                    onMouseEnter={e => { if (!resettingPass) e.currentTarget.style.background = '#FBB740' }}
                    onMouseLeave={e => { if (!resettingPass) e.currentTarget.style.background = '#F59E0B' }}
                  >
                    {resettingPass ? <><Loader2 className="w-4 h-4 animate-spin" />Cambiando...</> : <><Key className="w-4 h-4" />Cambiar contraseña</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Registrar Pago */}
      {modalPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={CARD_STYLE}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold" style={{ color: '#F1F5F9' }}>Registrar Pago</h3>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                  Abrirá el mes {alumno.meses_desbloqueados + 1} de {alumno.plan.duracion_meses}
                </p>
              </div>
              <button
                onClick={() => { setModalPago(false); setPagoError(null) }}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDesbloquear} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Monto ($)</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder={String(alumno.plan.precio_mensual)}
                  value={pago.monto}
                  onChange={e => setPago(p => ({ ...p, monto: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                  onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Método de pago</label>
                <select
                  required
                  value={pago.metodo_pago}
                  onChange={e => setPago(p => ({ ...p, metodo_pago: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                >
                  {['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Referencia <span style={{ color: '#475569' }}>(opcional)</span></label>
                <input
                  type="text"
                  placeholder="Número de transacción, folio..."
                  value={pago.referencia}
                  onChange={e => setPago(p => ({ ...p, referencia: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={INPUT_STYLE}
                  onFocus={e => { e.currentTarget.style.border = '1px solid #5B6CFF' }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                />
              </div>

              {pagoError && (
                <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
                  {pagoError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setModalPago(false); setPagoError(null) }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                  style={{ background: '#5B6CFF', color: '#fff' }}
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Registrando...</> : 'Confirmar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
