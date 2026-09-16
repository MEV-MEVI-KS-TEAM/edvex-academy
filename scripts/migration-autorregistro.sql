-- EDVEX — columna `autorregistro` en alumnos (16-sep-2026)
-- Marca a los alumnos que entraron por /register (personas reales), para ocultarlos
-- del padrón que ven los administradores (Alumnos, Pagos, Documentos) sin borrarlos,
-- sin afectar su acceso y sin cambiar las cifras de Reportes (que cuentan a todos).
-- Aplicada en producción vía Management API el 16-sep-2026 (default false = no rompe
-- el código previo). El alta por /register la pone en true; el seed/cron la deja false.

ALTER TABLE public.alumnos
  ADD COLUMN IF NOT EXISTS autorregistro boolean NOT NULL DEFAULT false;
