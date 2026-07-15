'use client'

import { parseVideoUrl } from '@/lib/cursos/parse-video-url'

const PROVIDER_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  loom: 'Loom',
}

/**
 * Preview embebido instantáneo para el form de lección. Si la URL no se
 * reconoce, muestra el mensaje orientativo sin bloquear nada.
 *
 * ⚠️ SEGURIDAD: video_url SIEMPRE se renderiza a través de parseVideoUrl
 * (whitelist de hosts + IDs validados), nunca crudo en el iframe.
 */
export function VideoPreview({ url, titulo }: { url: string; titulo?: string }) {
  const trimmed = url.trim()
  if (!trimmed) return null

  const parsed = parseVideoUrl(trimmed)

  if (!parsed) {
    return (
      <p className="text-xs mt-2" style={{ color: '#F59E0B' }}>
        Pega un enlace de YouTube, Vimeo o Loom. (Puedes guardar la lección de todas formas.)
      </p>
    )
  }

  return (
    <div className="mt-2">
      <span
        className="inline-block mb-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
        style={{ background: 'rgba(91,108,255,0.12)', color: '#7B8AFF' }}
      >
        {PROVIDER_LABEL[parsed.provider]}
      </span>
      <div className="rounded-xl overflow-hidden" style={{ background: '#0B0D11', border: '1px solid #2A2F3E' }}>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
          <iframe
            src={parsed.embedUrl}
            title={titulo?.trim() ? `Video: ${titulo}` : 'Vista previa del video de la lección'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
