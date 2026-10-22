/**
 * Botones de descarga de PDF de las actividades: «Descargar PDF» (de una semana
 * o lección sin actividades interactivas) y «Descargar cuaderno completo» (de la
 * materia o del curso).
 *
 * Sin CSS module a propósito: van en pantallas con estilos en línea y se prueban
 * con renderToStaticMarkup en tests/unit/actividades.spec.ts. Si la URL no es
 * una https válida (urlPdf) NO se pinta nada.
 *
 * `tono`:
 *   - 'claro'  → sobre el papel de la página (cabecera de la materia / curso):
 *                colores de «Personalizar mi página» (--color-*).
 *   - 'oscuro' → dentro de las tarjetas oscuras de la semana / lección, con el
 *                mismo aspecto que «Material de la clase».
 */
import { Download, FileText } from 'lucide-react'
import { urlPdf } from './datos'

interface Props {
  url: unknown
  texto: string
  tono?: 'claro' | 'oscuro'
  /** Color del ícono en tono oscuro (el acento legible sobre la tarjeta). */
  acento?: string
  /** Para la E2E y para distinguir los dos botones. */
  marca?: 'pdf-unidad' | 'cuaderno'
}

export function BotonDescargaPdf({ url, texto, tono = 'claro', acento, marca }: Props) {
  const href = urlPdf(url)
  if (!href) return null
  if (tono === 'oscuro') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        data-descarga={marca}
        className="flex items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all"
        style={{ minHeight: 44, background: '#0D1017', border: '1px solid #2A2F3E', color: '#F1F5F9' }}
      >
        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: acento ?? '#94A3B8' }} aria-hidden="true" />
        <span className="flex-1 min-w-0">{texto}</span>
        <Download className="w-4 h-4 flex-shrink-0" style={{ color: '#94A3B8' }} aria-hidden="true" />
      </a>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      data-descarga={marca}
      className="inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all w-full sm:w-auto"
      style={{
        minHeight: 44,
        background: 'var(--color-superficie)',
        color: 'var(--color-acento-texto)',
        border: '1.5px solid currentColor',
      }}
    >
      <Download className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span>{texto}</span>
    </a>
  )
}
