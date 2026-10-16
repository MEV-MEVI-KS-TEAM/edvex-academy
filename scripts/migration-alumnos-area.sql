-- ============================================================
-- MIGRACIÓN: área del alumno (secundaria, cursos de ingreso, licenciatura)
--
-- EDVEX nació con un solo programa (Preparatoria, materias por mes). Un alumno de
-- otra área estudia su programa como CURSOS (módulo Cursos y Diplomados, por
-- inscripción). Con `area` puesta, el menú solo muestra Mis cursos, documentos y
-- perfil, y el middleware lo regresa a /alumno/cursos desde las páginas de
-- Preparatoria. NULL = Preparatoria, exactamente como antes (no cambia ninguna fila).
--
-- Idempotente. Se aplica ANTES de desplegar el código que la lee (si falta, el
-- código hace como si fuera NULL).
-- Rollback: ALTER TABLE public.alumnos DROP COLUMN IF EXISTS area;
-- ============================================================
ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE public.alumnos DROP CONSTRAINT IF EXISTS alumnos_area_check;
ALTER TABLE public.alumnos ADD  CONSTRAINT alumnos_area_check
  CHECK (area IS NULL OR area IN ('secundaria', 'cursos-ingreso', 'licenciatura'));
