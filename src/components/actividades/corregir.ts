// Corrección pura (sin React): la usan la pantalla y, por la pantalla, la prueba automática de autocorrección.
import type { Actividad, Completar, EjercicioNumerico, Ordenar, Relacionar } from "./tipos";

/** Comparación tolerante: sin mayúsculas, sin acentos, espacios colapsados y sin puntuación en los extremos. */
export function normalizarTexto(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’´`]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\s*([/:])\s*/g, "$1")
    .trim()
    .replace(/^[\s.,;:¡!¿?"'()«»]+|[\s.,;:¡!¿?"'()«»]+$/g, "");
}

/** Lee lo que captura un alumno: 12, -3.5, 3,5, 1,250.75, 3/4, -1 1/2, 25 %, 1.2e3. null si no es un número. */
export function leerNumero(entrada: string): number | null {
  let s = (entrada || "").trim().replace(/\s*%$/, "").replace(/[−–]/g, "-").replace(/\$/g, "").trim();
  if (!s) return null;
  const mixto = s.match(/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixto) {
    const den = Number(mixto[4]);
    if (!den) return null;
    const v = Number(mixto[2]) + Number(mixto[3]) / den;
    return mixto[1] ? -v : v;
  }
  const frac = s.match(/^(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)$/);
  if (frac) {
    const a = Number(frac[1].replace(",", ".")), b = Number(frac[2].replace(",", "."));
    return b ? a / b : null;
  }
  // En México el punto es decimal y la coma separa miles («0.125» es un octavo, no 125). Una sola coma con 1-2 o 4+
  // decimales («3,5») se acepta como coma decimal.
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");        // miles con coma
  else if (/^-?\d*,\d+$/.test(s)) s = s.replace(",", ".");                      // coma decimal
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function mcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Fracción simplificada exacta (denominador ≤ 1000) o null. */
export function aFraccion(x: number): [number, number] | null {
  for (let d = 1; d <= 1000; d++) {
    const n = Math.round(x * d);
    if (Math.abs(n / d - x) < 1e-9) return [n, d];
  }
  return null;
}

function decimalExacto(x: number): boolean {
  const f = aFraccion(x);
  if (!f) return false;
  let d = f[1];
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}

export function formatoRespuesta(n: number, formato?: string): string {
  const dec = (x: number) => x.toLocaleString("es-MX", { maximumFractionDigits: 3 });
  if (formato === "fraccion" && !Number.isInteger(n)) {
    const f = aFraccion(n);
    if (f) return `$\\frac{${f[0]}}{${f[1]}}$ (${decimalExacto(n) ? "" : "≈ "}${dec(n)})`;
  }
  if (Number.isInteger(n)) return n.toLocaleString("es-MX");
  return decimalExacto(n) ? n.toLocaleString("es-MX", { maximumFractionDigits: 6 }) : `≈ ${dec(n)}`;
}

export interface ResultadoNumero {
  ok: boolean;
  nota?: string;
}

/** Califica un ejercicio numérico respetando su formato. La nota explica el porqué cuando ayuda. */
export function calificarNumero(e: EjercicioNumerico, entrada: string): ResultadoNumero {
  const t = (entrada || "").trim();
  const v = leerNumero(t);
  if (v === null) return { ok: false, nota: t ? "No se reconoce como número." : undefined };
  const dentro = Math.abs(v - e.respuesta) <= e.tolerancia + 1e-9 * Math.max(1, Math.abs(e.respuesta));
  if (e.formato === "decimal" && t.includes("/")) {
    return { ok: false, nota: dentro ? "El valor es correcto, pero se pide escrito como decimal." : "Se pide escrito como decimal." };
  }
  if (dentro) {
    // formato fracción: lo que se evalúa es la fracción simplificada (un decimal o una fracción sin simplificar no cuentan)
    if (e.formato === "fraccion" && !Number.isInteger(e.respuesta)) {
      const f = aFraccion(e.respuesta);
      const m = t.replace(/\s/g, "").match(/^(-?\d+)\/(-?\d+)$/);
      if (!m) return { ok: false, nota: f ? `El valor es correcto, pero se pide como fracción: ${f[0]}/${f[1]}.` : "Se pide como fracción." };
      if (mcd(Number(m[1]), Number(m[2])) > 1) return { ok: false, nota: f ? `Equivale, pero falta simplificar: queda ${f[0]}/${f[1]}.` : "Equivale, pero falta simplificar." };
    }
    return { ok: true };
  }
  // el error típico se reconoce aunque el alumno lo redondee (16.67 o 17 por 16.666…)
  if (e.error_tipico !== undefined && e.error_tipico_msg && Math.abs(v - e.error_tipico) <= Math.max(e.tolerancia, 0.03 * Math.abs(e.error_tipico), 0.01)) {
    return { ok: false, nota: e.error_tipico_msg };
  }
  return { ok: false };
}

/** true si `texto` ya dice lo que diría la ayuda del sistema (para no repetir la misma indicación dos veces). */
export function yaLoDice(texto: string, ayuda: string): boolean {
  const n = (x: string) => normalizarTexto(x).replace(/[^a-z0-9 ]/g, "");
  return n(texto).includes(n(ayuda));
}

export function huecoCorrecto(aceptadas: string[], entrada: string): boolean {
  const n = normalizarTexto(entrada);
  return n.length > 0 && aceptadas.some((a) => normalizarTexto(a) === n);
}

/** Generador determinista (mulberry32) a partir de una cadena: el mismo revuelto en pantalla, en el PDF y en la prueba. */
export function semilla(texto: string): () => number {
  let h = 1779033703 ^ texto.length;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function revolver<T>(xs: T[], clave: string): T[] {
  const r = semilla(clave);
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Cuántos elementos quedaron en su lugar, o seguidos de su sucesor correcto (para evitar revueltos que delaten). */
function pistas(orden: number[]): number {
  let n = 0;
  orden.forEach((v, i) => {
    if (v === i) n++;
    if (i > 0 && orden[i - 1] + 1 === v) n++;
  });
  return n;
}

/** Orden inicial de "ordenar": revuelto, determinista y sin elementos en su lugar ni pares seguidos correctos. */
export function ordenInicial(a: Ordenar, unidadId: string): number[] {
  const idx = a.elementos.map((_, i) => i);
  let mejor = idx.slice().reverse(), puntos = Infinity;
  for (let k = 0; k < 200 && puntos > 0; k++) {
    const r = revolver(idx, `${unidadId}/${a.id}/${k}`);
    const p = pistas(r);
    if (p < puntos) [mejor, puntos] = [r, p];
  }
  return mejor;
}

/** Opciones de "relacionar" (derechas + distractores), revueltas sin que ninguna quede frente a su par
 *  (en el PDF la columna izquierda va en el orden de `pares`; alinearlas regalaba la actividad). */
export function opcionesRelacionar(a: Relacionar, unidadId: string): string[] {
  const base = [...a.pares.map((p) => p.derecha), ...(a.distractores || [])];
  let mejor = base, malos = Infinity;
  for (let k = 0; k < 200 && malos > 0; k++) {
    const r = revolver(base, k ? `${unidadId}/${a.id}/${k}` : `${unidadId}/${a.id}`);
    const m = a.pares.filter((p, i) => r[i] === p.derecha || r[i + 1] === a.pares[i + 1]?.derecha).length;
    if (m < malos) [mejor, malos] = [r, m];
  }
  return mejor;
}

export function cuentaHuecos(texto: string): number {
  return (texto.match(/___/g) || []).length;
}

/** Posiciones que ya están en buen orden RELATIVO entre sí (la subsecuencia creciente más larga; en empate, la que
 *  deja más elementos en su lugar exacto). Con menos de 2 elementos en orden no hay orden que reconocer: conjunto vacío
 *  (una lista al revés da 0 y ningún ✓; una lista con un solo elemento fuera de lugar da n-1). */
export function enOrden(orden: number[]): Set<number> {
  const n = orden.length;
  const largo: number[] = new Array(n).fill(1), exactos: number[] = orden.map((v, i) => (v === i ? 1 : 0)), prev: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++) {
      if (orden[j] >= orden[i]) continue;
      const l = largo[j] + 1, x = exactos[j] + (orden[i] === i ? 1 : 0);
      if (l > largo[i] || (l === largo[i] && x > exactos[i])) [largo[i], exactos[i], prev[i]] = [l, x, j];
    }
  let fin = 0;
  for (let i = 1; i < n; i++) if (largo[i] > largo[fin] || (largo[i] === largo[fin] && exactos[i] > exactos[fin])) fin = i;
  const out = new Set<number>();
  if (largo[fin] < 2) return out;
  for (let i = fin; i >= 0; i = prev[i]) out.add(i);
  return out;
}

/** Lo que el alumno lleva en una actividad (también es lo que se guarda en su navegador). */
export interface EstadoActividad {
  r: Record<string, string>;
  revisada: boolean;
  orden?: number[];
  modelo?: boolean;
  criterios?: Record<string, boolean>;
  soluciones?: Record<string, boolean>;
}

export interface Calificacion {
  correctas: number;
  total: number;
  porCampo: Record<string, boolean>;
  notas: Record<string, string>;
}

/** Califica una actividad. Las claves de porCampo son las mismas que las de `r` (y que data-campo en pantalla).
 *  Ordenar: cuenta como acierto cada elemento que quedó en buen orden relativo (ver enOrden). */
export function calificar(a: Actividad, e: EstadoActividad, unidadId: string): Calificacion {
  const porCampo: Record<string, boolean> = {};
  const notas: Record<string, string> = {};
  const r = e.r || {};
  switch (a.tipo) {
    case "opcion_multiple":
      a.items.forEach((it) => (porCampo[it.id] = r[it.id] === String(it.correcta)));
      break;
    case "verdadero_falso":
      a.items.forEach((it) => (porCampo[it.id] = r[it.id] === (it.respuesta ? "v" : "f")));
      break;
    case "relacionar":
      a.pares.forEach((p) => (porCampo[p.id] = (r[p.id] || "") === p.derecha));
      break;
    case "completar":
      a.items.forEach((it) => it.respuestas.forEach((acept, k) => (porCampo[`${it.id}/${k}`] = huecoCorrecto(acept, r[`${it.id}/${k}`] || ""))));
      break;
    case "ordenar": {
      const orden = e.orden && e.orden.length === a.elementos.length ? e.orden : ordenInicial(a, unidadId);
      // Orden RELATIVO (revisión adversarial 3: quien solo dejó un elemento fuera merece n-1), pero con la regla de
      // enOrden: al revés = 0 y sin ✓ (revisión adversarial 2: antes marcaba ✓ un elemento cualquiera).
      const bien = enOrden(orden);
      orden.forEach((original, pos) => (porCampo[`pos-${pos}`] = bien.has(pos) || original === pos));
      break;
    }
    case "numerico":
      a.ejercicios.forEach((ej) => {
        const res = calificarNumero(ej, r[ej.id] || "");
        porCampo[ej.id] = res.ok;
        if (res.nota) notas[ej.id] = res.nota;
      });
      break;
    case "abierta":
      break;
  }
  const vals = Object.values(porCampo);
  return { correctas: vals.filter(Boolean).length, total: vals.length, porCampo, notas };
}

/** Cuántas respuestas evalúa una actividad (abierta = 0: se compara con la respuesta modelo). */
export function totalEvaluable(a: Actividad): number {
  switch (a.tipo) {
    case "opcion_multiple":
    case "verdadero_falso":
      return a.items.length;
    case "relacionar":
      return a.pares.length;
    case "completar":
      return (a as Completar).items.reduce((n, it) => n + it.respuestas.length, 0);
    case "ordenar":
      return a.elementos.length;
    case "numerico":
      return a.ejercicios.length;
    case "abierta":
      return 0;
  }
}

/** Banco de palabras en orden alfabético: en el orden del JSON las respuestas iban en el orden de las frases. */
export function ordenAlfabetico(xs: string[]): string[] {
  return xs.slice().sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}
