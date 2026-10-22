/**
 * Cuentas de alumno "protegidas": la cuenta demo de ALUMNO que se comparte con
 * los prospectos (varios la usan a la vez). No deben poder ejecutar acciones que
 * muten estado compartido —cambiar contraseña, foto, documentos o plan— porque
 * afectarían a todos los demás visitantes (p. ej. cambiar la contraseña dejaría
 * fuera a todos).
 *
 * La lista son user ids (auth.users.id) separados por coma en la variable de
 * entorno `ALUMNOS_PROTEGIDOS`. Los alumnos normales NO están en la lista y no se
 * ven afectados en nada. Si la variable está vacía o ausente, no hay ninguna
 * cuenta protegida (comportamiento previo).
 */
/**
 * Default en código: la cuenta demo de ALUMNO que se comparte con los prospectos
 * (serranomas@outlook.com). No es un secreto —es un user id— y va aquí para que la
 * protección funcione aunque no se configure la env en el hosting. La env
 * `ALUMNOS_PROTEGIDOS` (si existe) SE SUMA a esta lista, no la reemplaza.
 */
// ⚠️ La limpieza nocturna (pg_cron «limpieza-cuentas-protegidas», función
// public.limpiar_cuentas_protegidas, scripts/migration-limpieza-protegidos.sql)
// usa ESTOS MISMOS ids: si agregas o quitas una cuenta aquí, cámbiala también allá.
const IDS_DEFAULT = [
  '50e1f467-766b-401d-8473-70e014873ec0', // serranomas@outlook.com — Preparatoria
  // Cuentas por área que los vendedores muestran en videollamada (21-oct-2026):
  '0e691441-d632-41a3-a7c6-0ce954356b46', // sofia.ramirez — Secundaria
  '9ea910aa-a3be-47cc-b7b0-8619cfc13483', // emiliano.vargas — Cursos de ingreso
  'ff53509a-0dec-4ef8-946a-728aea32a39f', // andrea.morales — Administración
  'cc2fa082-b767-4a68-8970-fff6e2bd32a1', // rodrigo.castaneda — Derecho
  '02982a8d-f3e8-42d1-ac5f-d3e1bfc6032d', // fernanda.ortiz — Psicología
]

const IDS_ENV = (process.env.ALUMNOS_PROTEGIDOS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const IDS_PROTEGIDOS = [...new Set([...IDS_DEFAULT, ...IDS_ENV])]

export function esAlumnoProtegido(userId: string | null | undefined): boolean {
  return !!userId && IDS_PROTEGIDOS.includes(userId)
}

/** Mensaje amable que devuelven las APIs cuando la cuenta está protegida. */
export const MENSAJE_ALUMNO_PROTEGIDO = 'Esta acción no está disponible en esta cuenta.'

/**
 * Meses de contenido con acceso. Las cuentas protegidas (las que los vendedores
 * muestran) ven TODO su programa, sin depender de pagos ni de datos guardados
 * (la limpieza nocturna borra su avance): para ellas no hay tope. Los demás
 * alumnos: exactamente sus `meses_desbloqueados`, como siempre.
 */
export function mesesConAcceso(userId: string | null | undefined, mesesDesbloqueados: number): number {
  return esAlumnoProtegido(userId) ? Number.MAX_SAFE_INTEGER : mesesDesbloqueados
}

/** ¿Las semanas de cada materia se abren libres (sin completar la anterior)? Solo cuentas protegidas. */
export function semanasLibres(userId: string | null | undefined): boolean {
  return esAlumnoProtegido(userId)
}
