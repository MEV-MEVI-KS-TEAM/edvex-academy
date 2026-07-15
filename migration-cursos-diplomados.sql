-- ============================================================================
-- MIGRACIÓN: Módulo "Cursos y Diplomados"  (portado desde IMFO → EDVEX)
-- ----------------------------------------------------------------------------
-- Crea 5 tablas nuevas, sus columnas bilingües `_en`, RLS basada en el helper
-- existente public.is_admin() (rol = 'ADMIN'), y el bucket privado 'cursos'.
--
-- Adaptaciones EDVEX respecto a la fuente IMFO:
--   • RLS admin: es_admin()  →  public.is_admin()  (ya existe en EDVEX).
--   • Identidad del alumno: en EDVEX alumnos.id es UUID aleatorio y el enlace
--     con auth es alumnos.usuario_id → usuarios.id → auth.users.id. Por eso las
--     policies comparan:
--         alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
--     (mismo patrón que intentos_evaluacion/calificaciones/pagos en EDVEX).
--   • Bilingüe: cada texto visible al alumno tiene gemelo `_en` NOT NULL DEFAULT ''
--     (patrón scripts/add-bilingual-columns.sql).
--   • Storage SELECT endurecido: solo admin o alumnos INSCRITOS en ese curso
--     pueden firmar/descargar (cierra la fuga documentada de IMFO).
--
-- Idempotente. Aplicar sobre la conexión directa (5432), no el pooler (6543).
-- NO se ejecuta automáticamente: revisar y correr aparte en el Supabase de EDVEX.
-- ============================================================================


-- ============================================================
-- 1. TABLAS
-- ============================================================

-- 1.1 cursos ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cursos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT        NOT NULL,
  nombre_en      TEXT        NOT NULL DEFAULT '',
  descripcion    TEXT,
  descripcion_en TEXT        NOT NULL DEFAULT '',
  tipo           TEXT        NOT NULL CHECK (tipo IN ('curso','diplomado')),
  portada_path   TEXT,
  estado         TEXT        NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicado')),
  orden          INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cursos_estado ON public.cursos (estado);
CREATE INDEX IF NOT EXISTS idx_cursos_orden  ON public.cursos (orden);

-- 1.2 curso_modulos -------------------------------------------
CREATE TABLE IF NOT EXISTS public.curso_modulos (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id  UUID    NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  nombre    TEXT    NOT NULL,
  nombre_en TEXT    NOT NULL DEFAULT '',
  orden     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_curso_modulos_curso_id ON public.curso_modulos (curso_id);

-- 1.3 curso_lecciones -----------------------------------------
CREATE TABLE IF NOT EXISTS public.curso_lecciones (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id           UUID    NOT NULL REFERENCES public.curso_modulos(id) ON DELETE CASCADE,
  titulo              TEXT    NOT NULL,
  titulo_en           TEXT    NOT NULL DEFAULT '',
  video_url           TEXT,
  contenido_texto     TEXT,
  contenido_texto_en  TEXT    NOT NULL DEFAULT '',
  material_path       TEXT,
  orden               INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_curso_lecciones_modulo_id ON public.curso_lecciones (modulo_id);

-- 1.4 curso_inscripciones -------------------------------------
--     alumno_id → alumnos.id (UUID aleatorio en EDVEX, NO auth.uid()).
CREATE TABLE IF NOT EXISTS public.curso_inscripciones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id   UUID        NOT NULL REFERENCES public.cursos(id)   ON DELETE CASCADE,
  alumno_id  UUID        NOT NULL REFERENCES public.alumnos(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curso_id, alumno_id)
);

CREATE INDEX IF NOT EXISTS idx_curso_inscripciones_alumno_id ON public.curso_inscripciones (alumno_id);

-- 1.5 curso_progreso ------------------------------------------
CREATE TABLE IF NOT EXISTS public.curso_progreso (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  leccion_id   UUID        NOT NULL REFERENCES public.curso_lecciones(id) ON DELETE CASCADE,
  alumno_id    UUID        NOT NULL REFERENCES public.alumnos(id)         ON DELETE CASCADE,
  completada   BOOLEAN     NOT NULL DEFAULT TRUE,
  completada_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (leccion_id, alumno_id)
);

CREATE INDEX IF NOT EXISTS idx_curso_progreso_alumno_id ON public.curso_progreso (alumno_id);


-- ============================================================
-- 2. ROW LEVEL SECURITY
--    Service role omite RLS. is_admin() = EXISTS(usuarios donde id=auth.uid() y rol='ADMIN').
-- ============================================================
ALTER TABLE public.cursos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso_modulos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso_lecciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso_inscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso_progreso      ENABLE ROW LEVEL SECURITY;


-- ── cursos ────────────────────────────────────────────────────────────────────
-- El alumno ve solo cursos PUBLICADOS en los que está INSCRITO; el admin ve todo.
DROP POLICY IF EXISTS cursos_select ON public.cursos;
CREATE POLICY cursos_select ON public.cursos
  FOR SELECT TO authenticated
  USING (
    (
      estado = 'publicado'
      AND EXISTS (
        SELECT 1 FROM public.curso_inscripciones ci
        WHERE ci.curso_id  = cursos.id
          AND ci.alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
      )
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS cursos_write ON public.cursos;
CREATE POLICY cursos_write ON public.cursos
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── curso_modulos ─────────────────────────────────────────────────────────────
-- Visible si el curso padre es accesible para el alumno (publicado + inscrito) o admin.
DROP POLICY IF EXISTS curso_modulos_select ON public.curso_modulos;
CREATE POLICY curso_modulos_select ON public.curso_modulos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cursos c
      WHERE c.id = curso_modulos.curso_id
        AND c.estado = 'publicado'
        AND EXISTS (
          SELECT 1 FROM public.curso_inscripciones ci
          WHERE ci.curso_id  = c.id
            AND ci.alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
        )
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS curso_modulos_write ON public.curso_modulos;
CREATE POLICY curso_modulos_write ON public.curso_modulos
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── curso_lecciones ───────────────────────────────────────────────────────────
-- Protege video_url / contenido_texto / material_path detrás de la inscripción.
DROP POLICY IF EXISTS curso_lecciones_select ON public.curso_lecciones;
CREATE POLICY curso_lecciones_select ON public.curso_lecciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.curso_modulos m
      JOIN public.cursos c ON c.id = m.curso_id
      WHERE m.id = curso_lecciones.modulo_id
        AND c.estado = 'publicado'
        AND EXISTS (
          SELECT 1 FROM public.curso_inscripciones ci
          WHERE ci.curso_id  = c.id
            AND ci.alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
        )
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS curso_lecciones_write ON public.curso_lecciones;
CREATE POLICY curso_lecciones_write ON public.curso_lecciones
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── curso_inscripciones ───────────────────────────────────────────────────────
-- El alumno ve sus propias inscripciones; solo el admin las crea/borra (sin auto-enroll).
DROP POLICY IF EXISTS curso_inscripciones_select ON public.curso_inscripciones;
CREATE POLICY curso_inscripciones_select ON public.curso_inscripciones
  FOR SELECT TO authenticated
  USING (
    alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS curso_inscripciones_write ON public.curso_inscripciones;
CREATE POLICY curso_inscripciones_write ON public.curso_inscripciones
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── curso_progreso ────────────────────────────────────────────────────────────
-- El alumno lee y escribe SOLO su propio progreso. (El bloqueo de "preview de
-- admin" se refuerza en el código de la ruta /progreso, además de esta policy.)
DROP POLICY IF EXISTS curso_progreso_select ON public.curso_progreso;
CREATE POLICY curso_progreso_select ON public.curso_progreso
  FOR SELECT TO authenticated
  USING (
    alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS curso_progreso_insert ON public.curso_progreso;
CREATE POLICY curso_progreso_insert ON public.curso_progreso
  FOR INSERT TO authenticated
  WITH CHECK (
    alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
  );

DROP POLICY IF EXISTS curso_progreso_update ON public.curso_progreso;
CREATE POLICY curso_progreso_update ON public.curso_progreso
  FOR UPDATE TO authenticated
  USING (
    alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
  )
  WITH CHECK (
    alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
  );


-- ============================================================
-- 3. STORAGE — bucket privado 'cursos'
-- ------------------------------------------------------------
-- Rutas:  portadas/{cursoId}/{archivo}   y   {cursoId}/{leccionId}/{archivo}
-- Lectura endurecida: solo admin o alumnos INSCRITOS en ese curso.
-- Las subidas/lecturas de la app se hacen server-side con service_role (omite
-- estas policies); estas reglas son defensa-en-profundidad contra acceso directo.
--
-- NOTA: en proyectos Supabase gestionados, storage.objects pertenece a
-- supabase_storage_admin y el editor SQL puede fallar con "must be owner of
-- table objects". Si eso ocurre, crea las 4 policies desde el Dashboard
-- (Storage → Policies) o la Management API. El bucket sí se crea aquí.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('cursos', 'cursos', false, 10485760)   -- privado, 10 MB
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 10485760;

-- SELECT: admin o alumno inscrito en el curso al que pertenece el objeto.
--   cursoId se extrae del path: 'portadas' → segmento [2]; si no → segmento [1].
DROP POLICY IF EXISTS cursos_storage_select ON storage.objects;
CREATE POLICY cursos_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cursos'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.curso_inscripciones ci
        WHERE ci.alumno_id = (SELECT id FROM public.alumnos WHERE usuario_id = auth.uid())
          AND ci.curso_id::text = CASE
            WHEN (storage.foldername(name))[1] = 'portadas'
              THEN (storage.foldername(name))[2]
            ELSE (storage.foldername(name))[1]
          END
      )
    )
  );

DROP POLICY IF EXISTS cursos_storage_insert ON storage.objects;
CREATE POLICY cursos_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cursos' AND public.is_admin());

DROP POLICY IF EXISTS cursos_storage_update ON storage.objects;
CREATE POLICY cursos_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'cursos' AND public.is_admin())
  WITH CHECK (bucket_id = 'cursos' AND public.is_admin());

DROP POLICY IF EXISTS cursos_storage_delete ON storage.objects;
CREATE POLICY cursos_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cursos' AND public.is_admin());

-- ============================================================
-- FIN.  Verificar tras aplicar:
--   SELECT tablename FROM pg_tables WHERE tablename LIKE 'curso%';
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'cursos';
--   SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'cursos_%';
-- ============================================================
