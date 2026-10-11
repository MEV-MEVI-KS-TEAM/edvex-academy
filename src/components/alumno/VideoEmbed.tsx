'use client'

import { useMemo } from 'react'
import { PlayCircle, ExternalLink, VideoOff } from 'lucide-react'
import {
  BUNNY_IFRAME_ALLOW, VIDEO_CADUCADO, VIDEO_NO_DISPONIBLE, bunnyCaducada, bunnyEmbedFirmado, esHostBunny, parseBunnyUrl,
} from '@/lib/video/bunny-url'

interface VideoEmbedProps {
  url: string
  titulo: string
  duracion?: string
  lang: string
}

function extractYouTubeId(url: string): string | null {
  // youtu.be/ID
  const shortMatch = url.match(/youtu\.be\/([^?&#]+)/)
  if (shortMatch) return shortMatch[1]

  // youtube.com/watch?v=ID
  const watchMatch = url.match(/[?&]v=([^?&#]+)/)
  if (watchMatch) return watchMatch[1]

  return null
}

export default function VideoEmbed({ url, titulo, duracion, lang }: VideoEmbedProps) {
  // La caducidad de Bunny se decide al MONTAR (por URL), no en cada render: un
  // re-render del padre cerca de las 6 h no debe desmontar un video que suena.
  const caducada = useMemo(() => {
    const b = parseBunnyUrl(url)
    return !!b?.token && bunnyCaducada(b)
  }, [url])

  // ── Bunny Stream (videos propios) ─────────────────────────────────────────
  // Va PRIMERO: una URL de mediadelivery.net no contiene "youtube" y caería en el
  // link externo de abajo. El servidor (api/alumno/materia) la firma después de
  // validar el acceso; sin firma Bunny respondería 403, así que en vez de un
  // iframe roto se pinta un aviso neutro.
  const bunny = parseBunnyUrl(url)
  if (bunny || esHostBunny(url)) {
    const src = bunny ? bunnyEmbedFirmado(bunny) : null
    if (!src || caducada) {
      const aviso = lang === 'en'
        ? (caducada ? 'This video link expired. Reload the page to watch it.' : 'Video not available right now')
        : (caducada ? VIDEO_CADUCADO : VIDEO_NO_DISPONIBLE)
      return (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: '#1E2330', border: '1px solid #2A2F3E', color: '#94A3B8' }}
          role="status"
        >
          <VideoOff className="w-4 h-4 shrink-0" />
          <p className="text-sm">{aviso}</p>
        </div>
      )
    }
    return (
      <div className="rounded-xl overflow-hidden" style={{ background: '#1E2330' }}>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
          <iframe
            src={src}
            title={titulo}
            loading="lazy"
            allow={BUNNY_IFRAME_ALLOW}
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
          />
        </div>
        <div className="px-4 py-3">
          <p className="text-sm font-medium" style={{ color: '#E2E8F0' }}>{titulo}</p>
          {duracion && (
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{duracion}</p>
          )}
        </div>
      </div>
    )
  }

  const isSearchUrl = url.includes('results?search_query')

  // Link externo (búsqueda o URL no embebible)
  if (isSearchUrl || !url.includes('youtube')) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
        style={{ background: '#1E2330', color: '#94A3B8' }}
      >
        <PlayCircle className="w-5 h-5 shrink-0" style={{ color: '#6366F1' }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" style={{ color: '#E2E8F0' }}>{titulo}</p>
          <p className="text-xs mt-0.5">{lang === 'en' ? 'External video' : 'Video externo'}</p>
        </div>
        {duracion && (
          <span className="text-xs shrink-0">{duracion}</span>
        )}
        <ExternalLink className="w-4 h-4 shrink-0" />
      </a>
    )
  }

  const videoId = extractYouTubeId(url)

  // Si no se pudo extraer el ID, fallback a link externo
  if (!videoId) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
        style={{ background: '#1E2330', color: '#94A3B8' }}
      >
        <PlayCircle className="w-5 h-5 shrink-0" style={{ color: '#6366F1' }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" style={{ color: '#E2E8F0' }}>{titulo}</p>
          <p className="text-xs mt-0.5">{lang === 'en' ? 'Watch on YouTube' : 'Ver en YouTube'}</p>
        </div>
        {duracion && <span className="text-xs shrink-0">{duracion}</span>}
        <ExternalLink className="w-4 h-4 shrink-0" />
      </a>
    )
  }

  // Embed iframe
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#1E2330' }}>
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
        <iframe
          src={embedUrl}
          title={titulo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
          }}
        />
      </div>
      <div className="px-4 py-3">
        <p className="text-sm font-medium" style={{ color: '#E2E8F0' }}>{titulo}</p>
        {duracion && (
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{duracion}</p>
        )}
      </div>
    </div>
  )
}
