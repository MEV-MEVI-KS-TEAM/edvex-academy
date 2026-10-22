'use client'

/**
 * «Mis materias» de un programa por área (Secundaria o licenciatura), como en
 * la plataforma que recibe un cliente nuevo: tarjetas por materia (plantilla PV
 * /alumno/materias) agrupadas por mes, con los colores de EDVEX.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, CheckCircle2, ChevronRight, Clock, LayoutGrid, Loader2 } from 'lucide-react'

interface MateriaPlan {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  color_hex: string | null
  total_semanas: number
  semanas_completadas: number
  calificacion: number | null
  aprobada: boolean
}

interface PlanResponse {
  area: 'secundaria' | 'licenciatura'
  programa: string
  total_materias: number
  meses: { numero: number; materias: MateriaPlan[] }[]
}

const CARD = { background: '#181C26', border: '1px solid #2A2F3E' }

export default function PlanAreaPage() {
  const router = useRouter()
  const [data, setData] = useState<PlanResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/alumno/plan')
      .then(async r => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((json: PlanResponse) => setData(json))
      .catch(() => setError('No se pudieron cargar tus materias'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#5B6CFF' }} />
    </div>
  )

  const meses = data?.meses ?? []

  return (
    <div className="space-y-6 w-full max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold" style={{ color: '#F1F5F9' }}>Mis materias</h2>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
            {data?.programa ?? 'Plan de estudios'}
            {meses.length > 0 && <> · {meses.length} {meses.length === 1 ? 'mes' : 'meses'}</>}
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
            style={{ background: 'rgba(91,108,255,0.12)', color: '#8D9AFF' }}>
            <LayoutGrid className="w-3.5 h-3.5" />
            {data.total_materias} {data.total_materias === 1 ? 'materia' : 'materias'}
          </div>
        )}
      </div>

      {error ? (
        <div className="flex items-center justify-center py-12 rounded-xl" style={CARD}>
          <p className="text-sm" style={{ color: '#EF4444' }}>{error}</p>
        </div>
      ) : meses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl" style={CARD}>
          <BookOpen className="w-10 h-10" style={{ color: '#2A2F3E' }} />
          <p className="text-sm" style={{ color: '#94A3B8' }}>Aún no hay materias en tu plan de estudios.</p>
        </div>
      ) : (
        meses.map(mes => (
          <section key={mes.numero} className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#CBD5E1' }}>Mes {mes.numero}</h3>
              <div className="flex-1 h-px" style={{ background: '#2A2F3E' }} />
              <span className="text-xs" style={{ color: '#94A3B8' }}>
                {mes.materias.length} {mes.materias.length === 1 ? 'materia' : 'materias'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mes.materias.map(mat => (
                <TarjetaMateria key={mat.id} materia={mat} onClick={() => router.push(`/alumno/plan/materia/${mat.id}`)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

// ─── Tarjeta (plantilla PV, MateriaCard) ──────────────────────────────────────
function TarjetaMateria({ materia, onClick }: { materia: MateriaPlan; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const accent = materia.color_hex || '#5B6CFF'
  const terminada = materia.total_semanas > 0 && materia.semanas_completadas === materia.total_semanas

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-200 text-left touch-manipulation active:opacity-90"
      style={{
        background: '#181C26',
        border: `1px solid ${hovered ? accent : '#2A2F3E'}`,
        boxShadow: hovered ? `0 8px 24px ${accent}25` : 'none',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Barra de color superior */}
      <div style={{ height: 5, background: accent }} />

      <div className="flex flex-col flex-1 p-4 gap-3 w-full">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(91,108,255,0.15)', color: '#8D9AFF' }}>
            {materia.codigo}
          </span>
          {materia.calificacion !== null ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={materia.aprobada
                ? { background: 'rgba(16,185,129,0.12)', color: '#34D399' }
                : { background: 'rgba(239,68,68,0.12)', color: '#FCA5A5' }}>
              Calificación {materia.calificacion.toFixed(1)}
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Disponible
            </span>
          )}
        </div>

        <div className="flex-1">
          <h4 className="font-bold text-sm leading-snug" style={{ color: '#F1F5F9' }}>{materia.nombre}</h4>
          {materia.descripcion && (
            <p className="text-xs mt-1 line-clamp-2" style={{ color: '#94A3B8' }}>{materia.descripcion}</p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid #2A2F3E' }}>
          <div className="flex items-center gap-1 text-xs" style={{ color: '#94A3B8' }}>
            {terminada ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#34D399' }} /> : <Clock className="w-3.5 h-3.5" />}
            <span>
              {materia.semanas_completadas}/{materia.total_semanas} {materia.total_semanas === 1 ? 'semana' : 'semanas'}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-0.5 text-xs font-semibold" style={{ color: '#8D9AFF' }}>
            Estudiar
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </button>
  )
}
