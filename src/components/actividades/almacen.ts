// Avance del alumno SOLO en su navegador (nada va al servidor). Si el almacenamiento falla, la página funciona igual.
import type { EstadoActividad } from "./corregir";

export interface EstadoUnidad {
  act: Record<string, EstadoActividad>;
  auto: { r: Record<string, string>; calificada: boolean };
}

export const VACIO: EstadoUnidad = { act: {}, auto: { r: {}, calificada: false } };

const clave = (unidadId: string) => `actividades:v1:${unidadId}`;

export function cargar(unidadId: string): EstadoUnidad {
  try {
    const t = window.localStorage.getItem(clave(unidadId));
    if (!t) return VACIO;
    const d = JSON.parse(t);
    if (d && typeof d === "object" && d.act && d.auto) return d as EstadoUnidad;
  } catch {
    /* modo privado o datos dañados: se empieza en blanco */
  }
  return VACIO;
}

export function guardar(unidadId: string, e: EstadoUnidad): void {
  try {
    window.localStorage.setItem(clave(unidadId), JSON.stringify(e));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export function borrar(unidadId: string): void {
  try {
    window.localStorage.removeItem(clave(unidadId));
  } catch {
    /* nada */
  }
}

/** Preferencias pequeñas de la vista (p. ej. «Lo esencial» plegado). null si no hay o no se puede leer. */
export function leerPreferencia(clave: string): string | null {
  try {
    return window.localStorage.getItem(`actividades:pref:${clave}`);
  } catch {
    return null;
  }
}

export function guardarPreferencia(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(`actividades:pref:${clave}`, valor);
  } catch {
    /* nada */
  }
}
