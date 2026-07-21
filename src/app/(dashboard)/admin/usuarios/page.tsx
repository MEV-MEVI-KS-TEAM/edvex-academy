'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X, UserPlus, Shield, ClipboardCopy, Eye, EyeOff } from 'lucide-react'
import { useToast, ToastContainer } from '@/components/ui/toast'
import { fmtFecha } from '@/lib/format'

interface CuentaStaff {
  id: string
  nombre_completo: string | null
  email: string
  rol: string
  created_at: string
}

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }
const INPUT_STYLE = { background: '#0B0D11', border: '1px solid #2A2F3E', color: '#F1F5F9' }
const ACENTO = '#5B6CFF'

// Indexado en MAYÚSCULA: es como EDVEX guarda el rol. El fallback cubre
// cualquier valor inesperado sin dejar la celda vacía.
const ROL_BADGE: Record<string, { label: string; color: string; fondo: string }> = {
  ADMIN:      { label: 'Administrador', color: ACENTO,    fondo: 'rgba(91,108,255,0.15)' },
  SECRETARIO: { label: 'Secretario',    color: '#F59E0B', fondo: 'rgba(245,158,11,0.15)' },
}

export default function UsuariosPage() {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()

  const [cuentas, setCuentas] = useState<CuentaStaff[]>([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  const [modalNueva, setModalNueva] = useState(false)
  const [creando, setCreando] = useState(false)
  const [crearError, setCrearError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  // Un solo campo de nombre: EDVEX guarda nombre_completo, no nombre+apellidos.
  // Pedir dos campos para concatenarlos obligaría a partirlos al editar.
  const [form, setForm] = useState({ nombre_completo: '', email: '', password: '', rol: 'ADMIN' })
  const [passwordTemporal, setPasswordTemporal] = useState<string | null>(null)
  const [cuentaCreada, setCuentaCreada] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/usuarios')
      if (res.status === 403) { setAccessDenied(true); return }
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Error al cargar las cuentas', 'error'); return }
      setCuentas(data.usuarios ?? [])
    } catch {
      showToast('Error al cargar las cuentas', 'error')
    } finally {
      setLoading(false)
    }
    // showToast es estable; incluirlo re-dispararía la carga en cada toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /**
   * Limpia TODO, incluidos `form` y `showPassword`. Antes el reset vivía solo en
   * la rama de éxito: tras un alta fallida y un "Cancelar", el modal se reabría
   * con el email y la contraseña anteriores ya escritos —y visibles en claro si
   * se había pulsado el ojo—, con riesgo de crear a la persona equivocada de un
   * clic y de dejar una credencial en pantalla sin que nadie la pidiera.
   */
  function cerrarModal() {
    setModalNueva(false)
    setCrearError(null)
    setPasswordTemporal(null)
    setCuentaCreada(null)
    setShowPassword(false)
    setForm({ nombre_completo: '', email: '', password: '', rol: 'ADMIN' })
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault()
    setCrearError(null)
    if (form.password && form.password.length < 8) {
      setCrearError('La contraseña debe tener al menos 8 caracteres (o déjala vacía para generar una temporal).')
      return
    }
    setCreando(true)
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_completo: form.nombre_completo,
          email: form.email,
          password: form.password || undefined,
          rol: form.rol,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setCrearError(data.error ?? 'Error al crear la cuenta'); return }

      setCuentaCreada(data.usuario?.email ?? form.email)
      setPasswordTemporal(data.password_temporal ?? null)
      setForm({ nombre_completo: '', email: '', password: '', rol: 'ADMIN' })
      // Si hubo password temporal, el modal se queda abierto para mostrarla:
      // se devuelve una sola vez y cerrarlo la perdería para siempre.
      if (!data.password_temporal) {
        setModalNueva(false)
        showToast(`Cuenta ${data.usuario?.email} creada`, 'success')
      }
      await cargar()
    } catch {
      setCrearError('Error inesperado. Intenta de nuevo.')
    } finally {
      setCreando(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: ACENTO }} />
    </div>
  )

  if (accessDenied) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
      <Shield className="w-8 h-8" style={{ color: '#EF4444' }} />
      <p className="text-sm" style={{ color: '#EF4444' }}>
        Acceso denegado. Esta sección es solo para administradores.
      </p>
      <button onClick={() => router.push('/admin/alumnos')} className="text-sm" style={{ color: ACENTO }}>
        Ir a Alumnos
      </button>
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Usuarios del Sistema</h2>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
            Cuentas de administración y secretaría — los alumnos se gestionan en Alumnos
          </p>
        </div>
        <button
          onClick={() => { cerrarModal(); setModalNueva(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ background: ACENTO, color: '#FFFFFF' }}
        >
          <UserPlus className="w-4 h-4" />
          Nueva cuenta
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={CARD}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #2A2F3E' }}>
          <Shield className="w-4 h-4" style={{ color: ACENTO }} />
          <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
            {cuentas.length} cuenta{cuentas.length !== 1 ? 's' : ''} de staff
          </h3>
        </div>
        {cuentas.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
            Sin cuentas de staff registradas
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3E' }}>
                  {['Nombre', 'Email', 'Rol', 'Fecha de alta'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuentas.map(c => {
                  const badge = ROL_BADGE[c.rol?.toUpperCase()] ?? {
                    label: c.rol, color: '#94A3B8', fondo: 'rgba(148,163,184,0.15)',
                  }
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(42,47,62,0.5)' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: '#F1F5F9' }}>
                        {c.nombre_completo || '—'}
                      </td>
                      <td className="px-4 py-3" style={{ color: '#94A3B8' }}>{c.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                          style={{ background: badge.fondo, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#94A3B8' }}>
                        {fmtFecha(c.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nueva Cuenta */}
      {modalNueva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={CARD}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold" style={{ color: '#F1F5F9' }}>Nueva cuenta de staff</h3>
              <button
                onClick={cerrarModal}
                className="p-1.5 rounded-lg"
                style={{ color: '#94A3B8' }}
                aria-label="Cerrar"
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordTemporal ? (
              <div className="space-y-4">
                <div
                  className="rounded-xl p-4 space-y-2"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: '#10B981' }}>Cuenta {cuentaCreada} creada</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>
                    Contraseña temporal — se muestra UNA sola vez, cópiala ahora:
                  </p>
                  <div
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg font-mono text-sm"
                    style={{ background: '#0D1017', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981' }}
                  >
                    <span className="truncate">{passwordTemporal}</span>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(passwordTemporal); showToast('Contraseña copiada', 'info') }}
                      className="p-1 rounded flex-shrink-0"
                      style={{ color: '#94A3B8' }}
                      title="Copiar"
                    >
                      <ClipboardCopy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: '#64748B' }}>
                    Compártela por un canal seguro y pídele cambiarla al entrar.
                  </p>
                </div>
                <button
                  onClick={cerrarModal}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                  style={{ background: ACENTO, color: '#FFFFFF' }}
                >
                  Listo, la copié
                </button>
              </div>
            ) : (
              <form onSubmit={handleCrear} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="u-nombre" className="block text-sm font-medium" style={{ color: '#94A3B8' }}>
                    Nombre completo
                  </label>
                  <input
                    id="u-nombre" type="text" required value={form.nombre_completo}
                    onChange={e => setForm(f => ({ ...f, nombre_completo: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                    onFocus={e => { e.currentTarget.style.border = `1px solid ${ACENTO}` }}
                    onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="u-email" className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Email</label>
                  <input
                    id="u-email" type="email" required value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                    onFocus={e => { e.currentTarget.style.border = `1px solid ${ACENTO}` }}
                    onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="u-pass" className="block text-sm font-medium" style={{ color: '#94A3B8' }}>
                    Contraseña <span style={{ color: '#475569' }}>(vacía = generar temporal)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="u-pass"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 8 caracteres"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full pl-3 pr-10 py-2.5 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                      onFocus={e => { e.currentTarget.style.border = `1px solid ${ACENTO}` }}
                      onBlur={e => { e.currentTarget.style.border = '1px solid #2A2F3E' }}
                    />
                    <button
                      type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#64748B' }}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="u-rol" className="block text-sm font-medium" style={{ color: '#94A3B8' }}>Rol</label>
                  <select
                    id="u-rol"
                    value={form.rol}
                    onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                  >
                    {/* Valores en MAYÚSCULA: es lo que espera el CHECK de la BD. */}
                    <option value="ADMIN">Administrador — acceso total</option>
                    <option value="SECRETARIO">Secretario — requiere ampliar el CHECK de la BD</option>
                  </select>
                  {form.rol === 'SECRETARIO' && (
                    <p className="text-xs" style={{ color: '#F59E0B' }}>
                      El rol SECRETARIO todavía no está habilitado en la base de datos; la creación fallará
                      hasta que se amplíe el CHECK de usuarios.rol.
                    </p>
                  )}
                </div>

                {crearError && (
                  <div
                    className="rounded-lg px-3 py-2.5 text-sm"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}
                  >
                    {crearError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={cerrarModal}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid #2A2F3E' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creando}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                    style={{ background: ACENTO, color: '#FFFFFF' }}
                  >
                    {creando
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Creando...</>
                      : <><UserPlus className="w-4 h-4" />Crear cuenta</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
