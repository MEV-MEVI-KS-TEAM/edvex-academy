'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ESCUELA_CONFIG } from '@/lib/config'
import { fmtUSDCompacto } from '@/lib/format'

interface DashboardStats {
  total_alumnos: number
  alumnos_activos: number
  total_ingresos: number
  ingresos_mes: number
  promedio_meses: number
  pendientes_contactar: number
  alumnos_nuevos_semana: number
}

// EDVEX cobra en USD. Antes formateaba MXN sobre la misma columna `pagos.monto`
// que el alumno paga en dolares: la etiqueta equivocada sobre el numero correcto.
const formatCurrency = fmtUSDCompacto

function MetricCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
  icon: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ background: '#181C26', border: '1px solid #2A2F3E' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
          {label}
        </span>
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: accent ? `${accent}18` : '#2A2F3E', color: accent ?? '#94A3B8' }}
        >
          {icon}
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: '#F1F5F9' }}>
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-1" style={{ color: '#64748B' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/reportes')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setStats(data.stats)
      })
      .catch(() => setError('Error al cargar estadísticas'))
      .finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const mesNombre = now.toLocaleString('es-MX', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>
            {ESCUELA_CONFIG.nombre}
          </h2>
          <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
            Panel de administración
          </p>
        </div>
        <Link
          href="/admin/reportes"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: '#2A2F3E', color: '#94A3B8', border: '1px solid #3A4050' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Ver reportes completos
        </Link>
      </div>

      {/* Metrics grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-5 animate-pulse"
              style={{ background: '#181C26', border: '1px solid #2A2F3E', height: 112 }}
            />
          ))}
        </div>
      ) : error ? (
        <div
          className="rounded-xl p-6 text-sm"
          style={{ background: '#181C26', border: '1px solid #2A2F3E', color: '#F87171' }}
        >
          {error}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Alumnos activos"
            value={stats.alumnos_activos}
            sub={`${stats.total_alumnos} registrados en total`}
            accent="#3B82F6"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
          />
          <MetricCard
            label={`Ingresos — ${mesNombre}`}
            value={formatCurrency(stats.ingresos_mes)}
            sub={`${formatCurrency(stats.total_ingresos)} acumulado total`}
            accent="#10B981"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          />
          <MetricCard
            label="Pendientes de contactar"
            value={stats.pendientes_contactar}
            sub="Alumnos activos sin contacto WhatsApp"
            accent={stats.pendientes_contactar > 0 ? '#F59E0B' : '#10B981'}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.15h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.72a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z" />
              </svg>
            }
          />
          <MetricCard
            label="Nuevos esta semana"
            value={stats.alumnos_nuevos_semana}
            sub="Alumnos registrados en los últimos 7 días"
            accent="#8B5CF6"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            }
          />
        </div>
      ) : null}

      {/* Quick actions */}
      <div
        className="rounded-xl p-5"
        style={{ background: '#181C26', border: '1px solid #2A2F3E' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#F1F5F9' }}>
          Accesos rápidos
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: '/admin/alumnos', label: 'Gestionar alumnos', desc: 'Ver, crear y editar alumnos' },
            { href: '/admin/alumnos?tab=pendientes', label: 'Pendientes WhatsApp', desc: 'Contactar alumnos pendientes' },
            { href: '/admin/reportes', label: 'Reportes completos', desc: 'Ingresos, calificaciones y más' },
          ].map(({ href, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col gap-1 rounded-lg px-4 py-3 transition-colors"
              style={{ background: '#0F1117', border: '1px solid #2A2F3E' }}
            >
              <span className="text-sm font-medium" style={{ color: '#F1F5F9' }}>{label}</span>
              <span className="text-xs" style={{ color: '#64748B' }}>{desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
