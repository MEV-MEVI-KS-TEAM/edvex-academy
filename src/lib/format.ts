/**
 * Formateo de moneda y fechas para el panel admin.
 *
 * MONEDA: EDVEX cobra en USD. Antes de este archivo el admin formateaba con
 * `Intl.NumberFormat('es-MX', { currency: 'MXN' })` sobre la MISMA columna
 * `pagos.monto` que el alumno paga en dolares (alumno/pagar/page.tsx), asi que
 * un cobro de 450 USD se mostraba como "$450.00 MXN". No era un problema de
 * redondeo: era la etiqueta equivocada sobre el numero correcto.
 */

/**
 * Importe en USD. Usar SIEMPRE esto en vez de `Intl.NumberFormat` suelto.
 *
 * `Number(valor)` no es defensivo por gusto: PostgREST serializa `NUMERIC` como
 * STRING para no perder precision, asi que `pagos.monto` llega como `"450.00"`.
 * `Intl.NumberFormat.format("450.00")` funciona por coercion implicita, pero
 * cualquier aritmetica previa (`a + b`) concatenaria en vez de sumar. Convertir
 * en el borde evita que ese bug aparezca mas adentro.
 */
export function fmtUSD(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0)
}

/** Variante sin decimales, para KPIs donde los centavos son ruido. */
export function fmtUSDCompacto(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0)
}

/**
 * Fecha en formato es-MX. El idioma de la fecha NO sigue a la moneda: el equipo
 * que lee el panel opera en Mexico aunque cobre en dolares.
 *
 * El ancla `T12:00:00` es imprescindible para las columnas DATE (`fecha_pago`).
 * `new Date('2026-03-01')` se interpreta como MEDIANOCHE UTC, que en UTC-6 es el
 * 28 de febrero a las 18:00: la fecha se muestra un dia antes. Anclando a
 * mediodia, ningun huso realista cruza la frontera del dia.
 *
 * Para columnas TIMESTAMPTZ (`created_at`) el valor ya trae zona y se usa tal
 * cual; el ancla solo se aplica a las fechas puras `YYYY-MM-DD`.
 */
export function fmtFecha(valor: string | null | undefined): string {
  if (!valor) return '—'
  const esFechaPura = /^\d{4}-\d{2}-\d{2}$/.test(valor)
  const d = new Date(esFechaPura ? `${valor}T12:00:00` : valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX')
}

/** Etiqueta de semana a partir de `semana_inicio` (DATE). Ej. "2 mar". */
export function fmtSemana(valor: string | null | undefined): string {
  if (!valor) return '—'
  const d = new Date(`${valor}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

/** Etiqueta de mes a partir de `'YYYY-MM'`. Ej. "mar 2026". */
export function fmtMes(valor: string | null | undefined): string {
  if (!valor) return '—'
  const d = new Date(`${valor}-01T12:00:00`)
  if (Number.isNaN(d.getTime())) return valor
  return d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
}

/**
 * Normaliza texto para búsquedas: quita acentos y pasa a minúsculas, para que
 * "jose" encuentre a "José" y "nunez" a "Núñez". Imprescindible con un padrón
 * mexicano.
 *
 * El rango de combinantes se construye con RegExp y no como literal: el target
 * del tsconfig no habilita el flag `u` (necesario para \p{Diacritic}), y
 * escribir los caracteres crudos en el fuente los deja a merced de la
 * codificación del archivo.
 */
const DIACRITICOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

export function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase()
}
