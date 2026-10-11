'use client'

import { useEffect, useState } from 'react'
import { Loader2, VideoOff } from 'lucide-react'
import { BUNNY_IFRAME_ALLOW, bunnyEmbedFirmado, parseBunnyUrl } from '@/lib/video/bunny-url'

/**
 * Vista previa de un video de Bunny Stream en el panel del admin. El navegador
 * no puede firmar (la llave vive solo en el servidor), así que pide la URL
 * firmada a /api/admin/video-firmado y monta el iframe con ella. La URL del
 * iframe se reconstruye desde lo que devuelve el servidor, igual que en el
 * visor del alumno.
 */
export function BunnyVistaPrevia({ url, titulo, oscuro = false }: { url: string; titulo?: string; oscuro?: boolean }) {
  const [estado, setEstado] = useState<{ src: string | null; error: string | null; cargando: boolean }>({
    src: null, error: null, cargando: true,
  })

  useEffect(() => {
    let vivo = true
    setEstado({ src: null, error: null, cargando: true })
    fetch('/api/admin/video-firmado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(async r => {
        const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
        const v = parseBunnyUrl(d.url)
        const src = v ? bunnyEmbedFirmado(v) : null
        if (vivo) setEstado({ src, error: src ? null : d.error ?? 'No se pudo cargar la vista previa', cargando: false })
      })
      .catch(() => { if (vivo) setEstado({ src: null, error: 'No se pudo cargar la vista previa', cargando: false }) })
    return () => { vivo = false }
  }, [url])

  const caja = oscuro
    ? { background: '#1A1F2E', border: '1px solid #2A2F3E', color: '#94A3B8' }
    : { background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#64748B' }

  if (estado.cargando) {
    return (
      <p className="flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={caja}>
        <Loader2 className="w-3 h-3 animate-spin" /> Cargando vista previa…
      </p>
    )
  }
  if (!estado.src) {
    return (
      <p className="flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={caja} role="status">
        <VideoOff className="w-3 h-3 flex-shrink-0" /> {estado.error}
      </p>
    )
  }
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: oscuro ? '#1A1F2E' : 'var(--color-primario)' }}>
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
        <iframe
          src={estado.src}
          title={titulo?.trim() ? `Video: ${titulo}` : 'Vista previa del video'}
          allow={BUNNY_IFRAME_ALLOW}
          allowFullScreen
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  )
}
