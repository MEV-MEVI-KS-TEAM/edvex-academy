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
const IDS_PROTEGIDOS = (process.env.ALUMNOS_PROTEGIDOS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export function esAlumnoProtegido(userId: string | null | undefined): boolean {
  return !!userId && IDS_PROTEGIDOS.includes(userId)
}

/** Mensaje amable que devuelven las APIs cuando la cuenta está protegida. */
export const MENSAJE_ALUMNO_PROTEGIDO = 'Esta acción no está disponible en esta cuenta.'
