/**
 * Cálculo de progreso de un curso — función pura, compartida entre el catálogo
 * y el visor del alumno. Sin dependencias (fácil de testear).
 */

/**
 * % entero (0–100) de lecciones completadas sobre el total. total<=0 → 0.
 * Nunca devuelve 100 si falta alguna lección: el redondeo de, p.ej., 199/200
 * daría 100 y marcaría "Completado" un curso incompleto (tope en 99).
 */
export function porcentajeProgreso(completadas: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const c = Math.max(0, Math.min(completadas, total))
  if (c >= total) return 100
  return Math.min(99, Math.round((c / total) * 100))
}

/** true solo si hay al menos una lección y todas están completadas. */
export function cursoCompletado(completadas: number, total: number): boolean {
  return total > 0 && completadas >= total
}
