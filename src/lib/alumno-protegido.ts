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
const IDS_DEFAULT = ['50e1f467-766b-401d-8473-70e014873ec0']

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
