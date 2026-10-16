'use client'

import { useMemo } from 'react'
import { ExternalLink, VideoOff } from 'lucide-react'
import { parseVideoUrl } from '@/lib/cursos/parse-video-url'
import {
  BUNNY_IFRAME_ALLOW, VIDEO_CADUCADO, VIDEO_NO_DISPONIBLE, bunnyCaducada, esHostBunny, parseBunnyUrl,
} from '@/lib/video/bunny-url'
import { safeExternalUrl } from '@/lib/cursos/url-safe'
import { useLanguage } from '@/context/LanguageContext'

/**
 * Player embebido para el visor del alumno. Reutiliza parseVideoUrl (mismo
 * núcleo que la vista previa del admin). Iframe responsive 16:9 con title
 * accesible. Si la URL no se reconoce, cae a un enlace externo (nunca bloquea
 * la lección).
 *
 * ⚠️ SEGURIDAD: video_url viaja crudo desde la DB. Se renderiza SIEMPRE vía
 * parseVideoUrl (whitelist de hosts) o safeExternalUrl para el href (evita XSS
 * javascript:/data:). Nunca meter `url` directo a un iframe/href.
 *
 * `titulo` llega ya localizado por el padre (loc(titulo, titulo_en)).
 */
export function VideoPlayer({ url, titulo }: { url: string; titulo: string }) {
  const { t, lang } = useLanguage()
  const parsed = parseVideoUrl(url)
  // Caducidad decidida al montar (por URL): un re-render no desmonta un video que suena.
  const caducada = useMemo(() => {
    const b = parseBunnyUrl(url)
    return !!b?.token && bunnyCaducada(b)
  }, [url])

  // Video propio sin firma, con la firma vencida o con un host que no es un embed
  // válido: no hay iframe que montar (daría 403) → aviso neutro. Port plantilla #306.
  if ((parsed?.provider === 'bunny' && (!parsed.embedUrl || caducada)) || (!parsed && esHostBunny(url))) {
    return (
      <p
        className="flex items-center gap-2 text-sm rounded-xl px-4 py-3"
        style={{ background: '#181C26', border: '1px solid #2A2F3E', color: '#94A3B8' }}
        role="status"
      >
        <VideoOff className="w-4 h-4 flex-shrink-0" />
        {lang === 'en'
          ? (caducada ? 'This video link expired. Reload the page to watch it.' : 'Video not available right now')
          : (caducada ? VIDEO_CADUCADO : VIDEO_NO_DISPONIBLE)}
      </p>
    )
  }

  if (!parsed) {
    const href = safeExternalUrl(url)
    if (!href) {
      return (
        <p
          className="text-xs rounded-xl px-4 py-3"
          style={{ background: '#181C26', border: '1px solid #2A2F3E', color: '#94A3B8' }}
        >
          {t('courses.invalidVideo')}
        </p>
      )
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
        style={{ background: '#181C26', border: '1px solid #2A2F3E', color: '#7B8AFF' }}
      >
        <ExternalLink className="w-4 h-4 flex-shrink-0" />
        {t('courses.openVideoNewTab')}
      </a>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#000' }}>
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
        <iframe
          src={parsed.embedUrl ?? undefined}
          title={`${t('courses.videoLabel')}: ${titulo}`}
          allow={parsed.provider === 'bunny'
            ? BUNNY_IFRAME_ALLOW
            : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'}
          allowFullScreen
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  )
}
