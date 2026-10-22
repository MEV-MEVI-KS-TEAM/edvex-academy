// Tipos del esquema "actividades/1" (esquema/actividades.schema.json). Una sola fuente para la pantalla y el PDF.

export type Nivel = "preparatoria" | "secundaria" | "cursos-ingreso" | "licenciaturas";

export interface Unidad {
  id: string;
  nivel: Nivel;
  materia: string;
  slug: string;
  clave: string;
  rotulo: string;
  titulo: string;
  fuente_id: string;
  color: string;
  examen?: string;
}

export interface Esencial {
  intro: string;
  puntos: { titulo: string; texto: string }[];
  formulas?: string[];
  recuerda?: string;
}

export interface ReactivoOM {
  id: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  explicacion: string;
  verif?: string;
}

interface Base {
  id: string;
  titulo: string;
  instrucciones: string;
  reto?: boolean;
  idioma?: "es" | "en";
}

export interface OpcionMultiple extends Base {
  tipo: "opcion_multiple";
  items: ReactivoOM[];
}

export interface VerdaderoFalso extends Base {
  tipo: "verdadero_falso";
  items: { id: string; afirmacion: string; respuesta: boolean; explicacion: string }[];
}

export interface Relacionar extends Base {
  tipo: "relacionar";
  pares: { id: string; izquierda: string; derecha: string }[];
  distractores?: string[];
  explicacion: string;
}

export interface Completar extends Base {
  tipo: "completar";
  banco?: string[];
  items: { id: string; texto: string; respuestas: string[][]; explicacion: string; ayuda?: string }[];
}

export interface Ordenar extends Base {
  tipo: "ordenar";
  elementos: string[];
  explicacion: string;
}

export interface EjercicioNumerico {
  id: string;
  enunciado: string;
  respuesta: number;
  tolerancia: number;
  unidad?: string;
  formato?: "entero" | "decimal" | "fraccion";
  pasos: string[];
  verif: string;
  error_tipico?: number;
  /** Qué hizo mal quien llega a error_tipico (se muestra al revisar si su respuesta es esa). */
  error_tipico_msg?: string;
}

export interface Numerico extends Base {
  tipo: "numerico";
  ejemplo: { enunciado: string; pasos: string[]; resultado: string; valor?: number; verif: string };
  ejercicios: EjercicioNumerico[];
}

export interface Abierta extends Base {
  tipo: "abierta";
  consigna: string;
  preguntas?: string[];
  respuesta_modelo: string;
  criterios: string[];
  renglones?: number;
}

export type Actividad = OpcionMultiple | VerdaderoFalso | Relacionar | Completar | Ordenar | Numerico | Abierta;

export interface ActividadesUnidad {
  esquema: "actividades/1";
  unidad: Unidad;
  esencial: Esencial;
  actividades: Actividad[];
  autoevaluacion: { instrucciones?: string; reactivos: ReactivoOM[] };
  extras_pdf?: {
    crucigrama?: { palabras: { palabra: string; pista: string }[] };
    sopa?: { palabras: string[] };
  };
}

export const NOMBRE_TIPO: Record<Actividad["tipo"], string> = {
  opcion_multiple: "Opción múltiple",
  verdadero_falso: "Verdadero o falso",
  relacionar: "Relacionar",
  completar: "Completar",
  ordenar: "Ordenar",
  numerico: "Ejercicios",
  abierta: "Respuesta abierta",
};

/** Etiqueta corta para la tira de avance (cabe en un chip a 375 px). */
export const ETIQUETA_TIPO: Record<Actividad["tipo"], string> = {
  opcion_multiple: "Opción múltiple",
  verdadero_falso: "V o F",
  relacionar: "Relacionar",
  completar: "Completar",
  ordenar: "Ordenar",
  numerico: "Ejercicios",
  abierta: "Escritura",
};

/** Instrucción para PAPEL por tipo (la del JSON está pensada para la pantalla). */
export const INSTRUCCION_PAPEL: Partial<Record<Actividad["tipo"], string>> = {
  opcion_multiple: "Encierra la letra de la respuesta correcta.",
  verdadero_falso: "Encierra V si la afirmación es verdadera o F si es falsa.",
  relacionar: "Escribe en cada cuadro la letra de la descripción que le corresponde. Puede sobrar alguna.",
  ordenar: "Escribe en cada cuadro el número del lugar que le corresponde (1 es el primero).",
  completar: "Escribe en cada línea lo que falta.",
};