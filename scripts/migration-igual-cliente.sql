-- EDVEX — igual a lo que recibe el cliente (21-oct-2026)
-- Idempotente. Port de la plantilla PV ≥ 171f470 (#322) + programas por área.
--
-- 1. Actividades interactivas + PDF (plantilla 20261021120000_actividades_pdf.sql):
--    semanas.actividades / actividades_pdf_url, materias.cuaderno_pdf_url,
--    curso_lecciones.actividades / actividades_pdf_url, cursos.cuaderno_pdf_url.
--    Todas NULL, sin políticas nuevas (heredan el RLS de su tabla).
--
-- 2. Programas por ÁREA con plan de materias (Secundaria y licenciaturas): viven
--    en las MISMAS tablas que Preparatoria, marcadas con materias.area y SIN
--    mes_contenido_id. Las consultas de Preparatoria recorren
--    meses_contenido → materias, así que nunca las ven. El CHECK
--    materias_area_mes_check fija ese invariante: Preparatoria (area NULL)
--    SIEMPRE con mes_contenido_id, un área SIEMPRE sin él.
--    alumnos.carrera = slug de la licenciatura del alumno (NULL en las demás).

BEGIN;

-- 1. Actividades
ALTER TABLE public.semanas         ADD COLUMN IF NOT EXISTS actividades         JSONB;
ALTER TABLE public.semanas         ADD COLUMN IF NOT EXISTS actividades_pdf_url TEXT;
ALTER TABLE public.materias        ADD COLUMN IF NOT EXISTS cuaderno_pdf_url    TEXT;
ALTER TABLE public.curso_lecciones ADD COLUMN IF NOT EXISTS actividades         JSONB;
ALTER TABLE public.curso_lecciones ADD COLUMN IF NOT EXISTS actividades_pdf_url TEXT;
ALTER TABLE public.cursos          ADD COLUMN IF NOT EXISTS cuaderno_pdf_url    TEXT;

-- 2. Programas por área
ALTER TABLE public.materias ADD COLUMN IF NOT EXISTS area       TEXT;
ALTER TABLE public.materias ADD COLUMN IF NOT EXISTS carrera    TEXT;
ALTER TABLE public.materias ADD COLUMN IF NOT EXISTS numero_mes INTEGER;
ALTER TABLE public.materias ADD COLUMN IF NOT EXISTS orden      INTEGER;
ALTER TABLE public.materias ALTER COLUMN mes_contenido_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materias_area_check'
                 AND conrelid = 'public.materias'::regclass) THEN
    ALTER TABLE public.materias ADD CONSTRAINT materias_area_check
      CHECK (area IS NULL OR area IN ('secundaria', 'licenciatura'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materias_area_mes_check'
                 AND conrelid = 'public.materias'::regclass) THEN
    ALTER TABLE public.materias ADD CONSTRAINT materias_area_mes_check
      CHECK ((area IS NULL AND mes_contenido_id IS NOT NULL)
          OR (area IS NOT NULL AND mes_contenido_id IS NULL AND numero_mes IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS materias_area_carrera_idx
  ON public.materias (area, carrera, numero_mes, orden) WHERE area IS NOT NULL;

ALTER TABLE public.alumnos ADD COLUMN IF NOT EXISTS carrera TEXT;

COMMIT;

NOTIFY pgrst, 'reload schema';
