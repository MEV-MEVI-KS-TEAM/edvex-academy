'use client'

/** Barra de progreso del curso (0–100). Reutilizada en catálogo y visor.
 *  EDVEX dark (inline-hex): pista #2A2F3E, avance acento #5B6CFF, completo #10B981. */
export function ProgressBar({
  porcentaje,
  size = 'md',
  showLabel = true,
}: {
  porcentaje: number
  size?: 'sm' | 'md'
  showLabel?: boolean
}) {
  const pct = Math.max(0, Math.min(100, Math.round(porcentaje)))
  const completo = pct >= 100
  const h = size === 'sm' ? 6 : 8

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-full overflow-hidden" style={{ height: h, background: '#2A2F3E' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: completo ? '#10B981' : '#5B6CFF',
            }}
          />
        </div>
        {showLabel && (
          <span
            className="text-xs font-bold tabular-nums flex-shrink-0"
            style={{ color: completo ? '#34D399' : '#F1F5F9', minWidth: 34, textAlign: 'right' }}
          >
            {pct}%
          </span>
        )}
      </div>
    </div>
  )
}
