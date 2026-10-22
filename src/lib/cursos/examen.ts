/**
 * Examen Final de Curso — lógica compartida entre las rutas de API.
 * Port de la plantilla PV (src/lib/cursos/examen.ts) adaptado a EDVEX.
 *
 * SEGURIDAD (lo no negociable de esta feature):
 *   * curso_examen_preguntas tiene RLS SOLO-ADMIN. El alumno jamás la lee por
 *     PostgREST. Estas funciones la leen con el cliente admin desde el servidor
 *     y devuelven las preguntas SANITIZADAS.
 *   * La calificación ocurre aquí, en el servidor, comparando contra
 *     respuesta_correcta. El navegador nunca ve la clave antes de enviar.
 *   * La revisión posterior al envío solo trae la clave de las preguntas que el
 *     alumno CONTESTÓ y solo cuando el examen se cierra. Ver `calificar()`.
 *
 * ⚠️ IDENTITY BRIDGE (EDVEX): curso_inscripciones.alumno_id y
 * curso_examen_resultados.alumno_id son `alumnos.id` (UUID aleatorio), NO
 * `auth.uid()`. Se resuelve con `alumnoIdDe()`.
 *
 * Diferencias con la plantilla, a propósito: EDVEX no tiene ventana de pago por
 * curso ni las columnas cursos.intentos_permitidos / calificacion_minima. La
 * inscripción abre el curso completo, y los dos umbrales son las constantes de
 * la plantilla (sus mismos defaults).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DesgloseTema,
  Letra,
  PreguntaExamen,
  PreguntaSanitizada,
  RespuestaEnviada,
  RespuestaGuardada,
  RevisionPregunta,
} from '@/types/cursos-examen'

const LETRAS: Letra[] = ['a', 'b', 'c', 'd']

/** Intentos por alumno en el examen final de un curso (default de la plantilla). */
export const INTENTOS_PERMITIDOS_DEFAULT = 3

/** Porcentaje mínimo para aprobar (default de la plantilla). */
export const CALIFICACION_MINIMA_DEFAULT = 70

export const esLetra = (v: unknown): v is Letra =>
  typeof v === 'string' && (LETRAS as string[]).includes(v)

/**
 * ¿Este usuario puede abrir este curso? Mismo canon que el visor de lecciones:
 * se consulta `cursos` con la SESIÓN del usuario y la RLS decide (publicado +
 * inscripción, o is_admin()).
 */
export async function puedeVerCurso(
  supabase: SupabaseClient,
  cursoId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('cursos')
    .select('id')
    .eq('id', cursoId)
    .maybeSingle()
  return Boolean(data)
}

/** `alumnos.id` del usuario en sesión (identity bridge), o null si no es alumno. */
export async function alumnoIdDe(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('alumnos')
    .select('id')
    .eq('usuario_id', userId)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/**
 * ¿El alumno puede presentar el EXAMEN FINAL del curso? Obligatorio en código:
 * las rutas leen con service_role (bypasea RLS). En EDVEX basta la inscripción
 * (abre el curso completo). Falla cerrado: sin inscripción → false.
 */
export async function puedeExamenFinal(
  admin: SupabaseClient,
  cursoId: string,
  alumnoId: string | null
): Promise<boolean> {
  if (!alumnoId) return false
  const { data, error } = await admin
    .from('curso_inscripciones')
    .select('id')
    .eq('curso_id', cursoId)
    .eq('alumno_id', alumnoId)
    .maybeSingle()
  return !error && Boolean(data)
}

/** Quita clave y explicación. Es la única forma en que una pregunta sale al cliente. */
export const sanitizar = (p: PreguntaExamen): PreguntaSanitizada => ({
  id: p.id,
  orden: p.orden,
  tema: p.tema,
  enunciado: p.enunciado,
  opcion_a: p.opcion_a,
  opcion_b: p.opcion_b,
  opcion_c: p.opcion_c,
  opcion_d: p.opcion_d,
})

/** Lee el examen completo de un curso con el cliente admin, ordenado. */
export async function leerPreguntas(
  admin: SupabaseClient,
  cursoId: string
): Promise<PreguntaExamen[]> {
  const { data } = await admin
    .from('curso_examen_preguntas')
    .select('id, curso_id, orden, tema, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, explicacion')
    .eq('curso_id', cursoId)
    .order('orden', { ascending: true })
    .order('id', { ascending: true })
  return (data ?? []) as PreguntaExamen[]
}

/**
 * Califica un envío contra el banco real.
 *   * Sin contestar (o letra inválida) cuenta como INCORRECTA; el denominador es
 *     siempre el número de preguntas del examen.
 *   * Se ignoran respuestas a preguntas de otro curso o inexistentes.
 *   * El desglose agrupa por tema; sin tema → "General".
 *   * `revelarClaves`: la clave, la explicación y el ✓/✗ solo viajan cuando el
 *     alumno ya no puede volver a presentar (aprobó o gastó su último intento),
 *     y la clave solo de lo que contestó.
 */
export function calificar(
  preguntas: PreguntaExamen[],
  enviadas: RespuestaEnviada[],
  revelarClaves = false
): {
  aciertos: number
  total: number
  porcentaje: number
  desglose: DesgloseTema[]
  respuestas: RespuestaGuardada[]
  revision: RevisionPregunta[]
  contestadas: number
} {
  const porId = new Map<string, Letra | null>()
  for (const r of enviadas) {
    if (r && typeof r.pregunta_id === 'string') {
      porId.set(r.pregunta_id, esLetra(r.respuesta) ? r.respuesta : null)
    }
  }

  const respuestas: RespuestaGuardada[] = []
  const revision: RevisionPregunta[] = []
  const acum = new Map<string, { aciertos: number; total: number }>()
  let aciertos = 0
  let contestadas = 0

  for (const p of preguntas) {
    const dada = porId.get(p.id) ?? null
    const correcta = dada !== null && dada === p.respuesta_correcta
    if (correcta) aciertos++
    if (dada !== null) contestadas++

    respuestas.push(
      revelarClaves
        ? { pregunta_id: p.id, respuesta: dada, es_correcta: correcta }
        : { pregunta_id: p.id, respuesta: dada }
    )

    const base: RevisionPregunta = {
      pregunta_id: p.id,
      orden: p.orden,
      tema: p.tema,
      enunciado: p.enunciado,
      opciones: { a: p.opcion_a, b: p.opcion_b, c: p.opcion_c, d: p.opcion_d },
      tu_respuesta: dada,
    }
    revision.push(
      !revelarClaves
        ? base
        : dada === null
          ? { ...base, es_correcta: correcta }
          : { ...base, es_correcta: correcta, respuesta_correcta: p.respuesta_correcta, explicacion: p.explicacion }
    )

    const tema = p.tema?.trim() || 'General'
    const t = acum.get(tema) ?? { aciertos: 0, total: 0 }
    t.total++
    if (correcta) t.aciertos++
    acum.set(tema, t)
  }

  const total = preguntas.length
  // 2 decimales para que cuadre con NUMERIC(5,2) de la tabla.
  const porcentaje = total === 0 ? 0 : Math.round((aciertos / total) * 10000) / 100

  const desglose: DesgloseTema[] = [...acum.entries()].map(([tema, v]) => ({
    tema,
    aciertos: v.aciertos,
    total: v.total,
  }))

  return { aciertos, total, porcentaje, desglose, respuestas, revision, contestadas }
}
