-- EDVEX — archivos de descarga por lección (21-nov-2026). Idempotente.
--
-- curso_lecciones.archivos (jsonb, NULL = sin archivos):
--   [{ "path": "{cursoId}/archivos/{leccionId}/Archivo.xlsx", "nombre": "Archivo.xlsx", "etiqueta": "Práctica" }]
-- Los archivos viven en el bucket privado 'cursos' (lectura: admin e inscritos)
-- y el aula los entrega con URL firmada de 1 h (src/lib/cursos/alumno-data.ts).
-- Solo se aceptan rutas dentro de {cursoId}/archivos/ con [A-Za-z0-9._/-]
-- (leerArchivosLeccion). NO usar {cursoId}/{leccionId}/: esa carpeta es la del
-- material PDF y el admin la vacía al reemplazarlo o quitarlo.
--
-- Columna nueva y opcional: no cambia ninguna fila existente, y el código lee
-- como antes si la base todavía no la tiene (42703).

ALTER TABLE public.curso_lecciones ADD COLUMN IF NOT EXISTS archivos jsonb;

COMMENT ON COLUMN public.curso_lecciones.archivos IS
  'Archivos de descarga de la lección: [{path, nombre, etiqueta}] en el bucket cursos, dentro de {curso_id}/archivos/.';
