-- =============================================================================
-- EDVEX ACADEMY — PR 1: base de control escolar
-- Archivo: scripts/migration-control-escolar-01.sql
-- Fecha: 2026-07-20
-- DEPENDE DE: migration-control-escolar-00-aplicar-pago-stripe.sql
--
-- APLICAR: Supabase SQL Editor (o psql -f) como owner del proyecto.
--          FUERA de las ventanas 16:00 y 17:00 America/Mexico_City (los 2 jobs
--          pg_cron insertan en pagos y competirian por el lock).
-- Este archivo contiene SOLO DDL ejecutable; VERIFICACION y ROLLBACK van
-- integramente comentados al final, para que un batch en transaccion implicita
-- no pueda revertir la migracion.
--
-- ALCANCE: fecha_pago, meses_cubiertos (idempotente con PR 0), clasificador de
--          conceptos, marca de demo, vista clasificada, 2 reportes de ingresos
--          y estado de cuenta. TODO ADITIVO.
--
-- NO HACE (deliberadamente):
--  * NO toca el CHECK de monto — dueno unico es PR 0 (evita constraint duplicado
--    y rollback envenenado por 42710).
--  * NO crea is_staff() ni toca el CHECK de usuarios.rol — copiar el de
--    plantilla (minusculas) invalidaria todas las filas 'ADMIN'/'ALUMNO'.
--  * NO toca la RLS de pagos.
--  * NO anade columna GENERATED a pagos. Ver nota en el paso 3.
--  * NO hace SET NOT NULL sobre fecha_pago. Ver decision 1 en §2.2.
-- =============================================================================


-- =============================================================================
-- PASO 0 — PREFLIGHT. Aborta antes de tocar nada si el esquema no es el esperado.
-- =============================================================================
DO $preflight$
DECLARE v_falta text := '';
BEGIN
  IF to_regclass('public.pagos')          IS NULL THEN v_falta := v_falta || 'pagos '; END IF;
  IF to_regclass('public.alumnos')        IS NULL THEN v_falta := v_falta || 'alumnos '; END IF;
  IF to_regclass('public.usuarios')       IS NULL THEN v_falta := v_falta || 'usuarios '; END IF;
  IF to_regclass('public.planes_estudio') IS NULL THEN v_falta := v_falta || 'planes_estudio '; END IF;
  IF v_falta <> '' THEN
    RAISE EXCEPTION 'Faltan relaciones: %', v_falta;
  END IF;

  -- usuarios.activo es la columna AUTORITATIVA de baja logica en EDVEX:
  -- la escribe src/app/api/admin/alumnos/[id]/route.ts:205 y la lee
  -- src/app/api/admin/reportes/route.ts:24-30.
  -- NO se usa alumnos.activo: su existencia NO esta verificada (el brief dice
  -- que existe, EDVEX-SUPABASE-SETUP.sql:84-92 no la muestra, y ese archivo
  -- esta demostrablemente desactualizado). Filtrando solo por usuarios.activo
  -- la ambiguedad deja de importar.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='usuarios' AND column_name='activo') THEN
    RAISE EXCEPTION 'usuarios.activo no existe: es la columna autoritativa de baja logica';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='alumnos' AND column_name='usuario_id') THEN
    RAISE EXCEPTION 'alumnos.usuario_id no existe: es el puente de identidad hacia auth.uid()';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='usuarios' AND column_name='nombre_completo') THEN
    RAISE EXCEPTION 'usuarios.nombre_completo no existe (EDVEX no tiene nombre/apellidos)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='planes_estudio' AND column_name='duracion_meses') THEN
    RAISE EXCEPTION 'planes_estudio.duracion_meses no existe';
  END IF;

  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE WARNING 'PG < 15: security_invoker en vistas no esta disponible. '
                  'La proteccion real la da el REVOKE del paso 8.';
  END IF;
END
$preflight$;

SET lock_timeout = '3s';


-- =============================================================================
-- PASO 1 — pagos.fecha_pago
-- =============================================================================
-- Patron de plantilla (supabase/migrations/20260717120000_pagos_fecha_pago.sql),
-- con UNA desviacion deliberada: NO se hace SET NOT NULL. Ver decision 1 (§2.2).
--
-- El orden importa: si el ADD COLUMN llevara DEFAULT desde el inicio, las 470
-- filas historicas quedarian todas con la fecha de hoy y el backfill no las
-- tocaria (WHERE fecha_pago IS NULL no haria match). El historico se perderia.
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS fecha_pago DATE;

-- Backfill en hora civil mexicana (convencion confirmada de plantilla).
-- Re-ejecutable: solo toca filas NULL.
UPDATE public.pagos
   SET fecha_pago = (created_at AT TIME ZONE 'America/Mexico_City')::date
 WHERE fecha_pago IS NULL AND created_at IS NOT NULL;

-- Solo afecta a inserciones futuras; no reescribe filas existentes.
-- Los 4 escritores no nombran la columna ⇒ el DEFAULT los cubre sin cambios.
ALTER TABLE public.pagos ALTER COLUMN fecha_pago SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_pagos_fecha_pago ON public.pagos (fecha_pago DESC);

COMMENT ON COLUMN public.pagos.fecha_pago IS
  'Fecha real del pago (editable, puede ser retroactiva). DATE sin zona: los '
  'cortes de agregacion ya estan en hora civil America/Mexico_City, de modo que '
  'las funciones de reporte no necesitan AT TIME ZONE sobre el dato. '
  'NULLABLE a proposito: ver decision 1 de PR 1 (jobs pg_cron no verificados).';


-- =============================================================================
-- PASO 2 — pagos.meses_cubiertos  (idempotente; PR 0 ya la creo)
-- =============================================================================
-- Se repite con IF NOT EXISTS para que este archivo sea aplicable por separado.
-- NULLABLE y SIN DEFAULT: un DEFAULT 1 mentiria sobre inscripcion/certificacion
-- y dejaria los pagos ACELERADOS en 1 si algun escritor no la nombrara.
-- Escritores que la declaran: aplicar_pago_stripe (0|1|2) y desbloquear_mes (1).
-- Los 2 jobs pg_cron la dejan NULL ⇒ la heuristica del paso 5 decide por ellos.
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS meses_cubiertos INTEGER;

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_meses_cubiertos_check;
ALTER TABLE public.pagos
  ADD  CONSTRAINT pagos_meses_cubiertos_check
  CHECK (meses_cubiertos IS NULL OR meses_cubiertos >= 0);


-- =============================================================================
-- PASO 3 — Marca de pago demo  (funcion + indice, NO columna generada)
-- =============================================================================
-- DECISION REVISADA: se DESCARTA la columna
--   es_demo BOOLEAN GENERATED ALWAYS AS (...) STORED.
-- Motivo: una columna GENERATED rechaza PERMANENTEMENTE cualquier INSERT que le
-- suministre valor (428C9), y revertirla exige DROP COLUMN + otra reescritura.
-- Una funcion IMMUTABLE + indice parcial da lo mismo (definicion unica,
-- indexable) con riesgo cero sobre los escritores. Se pierde la visibilidad en
-- SELECT *, que es un coste cosmetico; la vista del paso 6 la expone igual.
--
-- CONFIRMADO A POSTERIORI (volcado de generar_pagos_demo_diario, 2026-07-20):
-- el job inserta con LISTA EXPLICITA de columnas
--   (id, alumno_id, monto, mes_desbloqueado, metodo_pago, referencia,
--    created_at, stripe_session_id, concepto)
-- es decir, NO usa "INSERT ... SELECT *" ni "%ROWTYPE", que era el escenario
-- que habria roto la columna GENERATED. La decision resulto correcta por un
-- margen mas estrecho de lo que parecia: bastaba con que la funcion se hubiera
-- escrito de la otra forma para romper un job desatendido de forma permanente.
-- Se mantiene la funcion en vez de la columna generada porque el argumento de
-- fondo no ha cambiado: los jobs no son modificables desde el repo y pueden
-- reescribirse sin que nos enteremos.
--
-- Y CONFIRMADO tambien: el job NO nombra fecha_pago, luego el ADD COLUMN del
-- PASO 1 (nullable + DEFAULT) no lo afecta. Ver PASO 1 sobre por que aun asi
-- NO se pone SET NOT NULL.
--
-- PREFIJO REAL de referencia: 'pi_demo_auto_%' (volcado del job). El patron
-- 'pi\_demo%' de aqui lo cubre y ademas sigue cubriendo al job SEMANAL, cuyo
-- cuerpo NO se ha volcado y podria usar otro sufijo bajo el mismo prefijo.
-- Se deja deliberadamente en el prefijo corto: estrecharlo a 'pi\_demo\_auto\_%'
-- dejaria fuera al semanal y sus filas entrarian a los reportes como ingreso real.
--
-- El patron va con _ ESCAPADO: en LIKE, '_' es comodin de un caracter, asi que
-- 'pi_demo%' casaba en realidad 'pi?demo…'. Con 'pi\_demo%' es literal.
CREATE OR REPLACE FUNCTION public.pago_es_demo(p_referencia text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
AS $$
  SELECT p_referencia IS NOT NULL AND p_referencia LIKE 'pi\_demo%';
$$;

COMMENT ON FUNCTION public.pago_es_demo(text) IS
  'TRUE si la fila la sembro uno de los 2 jobs pg_cron (referencia LIKE pi\_demo%). '
  'Definicion UNICA de "demo", compartida por la vista y las 3 funciones. '
  'IMMUTABLE ⇒ usable en indices. NO devuelve NULL nunca (total). '
  'El job DIARIO esta verificado (prefijo real pi_demo_auto_). El job SEMANAL '
  'NO: su cuerpo no se ha volcado, y se asume que comparte el prefijo pi_demo. '
  'Si no lo comparte, sus filas entran a los reportes como ingreso real; la '
  'sonda V4b lo detecta.';

-- Indice parcial sobre los pagos REALES (los que alimentan reportes y cobranza).
CREATE INDEX IF NOT EXISTS idx_pagos_reales_fecha
  ON public.pagos (fecha_pago DESC)
  WHERE referencia IS NULL OR referencia NOT LIKE 'pi\_demo%';


-- =============================================================================
-- PASO 4 — public.pago_categoria(...) : clasificador de conceptos
-- =============================================================================
-- PROBLEMA: EDVEX tiene 4 escritores con 4 vocabularios distintos de `concepto`:
--   webhook Stripe : 'Inscripción' | 'Certificación' | 'Módulo N (estándar)'
--                    | 'Módulo N (acelerado)'
--   desbloquear_mes: NULL  (pero mes_desbloqueado IS NOT NULL)
--   cron diario    : 'Módulo Estándar' | 'Módulo Acelerado'
--   cron semanal   : 'Inscripción'
--   captura manual PR 3: texto libre
-- Dominio de salida CERRADO: INSCRIPCION | CERTIFICACION | MENSUALIDAD | OTRO.
--
-- Se normaliza con translate() (no unaccent(), que es STABLE e impediria marcar
-- la funcion IMMUTABLE). La tabla de translate tiene 42 caracteres origen y 42
-- destino, alineados 1:1: si la cadena destino fuera mas corta, translate
-- BORRARIA los sobrantes y 'Módulo' pasaria a 'mdulo' → OTRO.
--
-- CALLED ON NULL INPUT explicito: la funcion DEBE aceptar concepto NULL (es el
-- caso de desbloquear_mes). Con STRICT devolveria NULL y se perderia la
-- totalidad. Ese comportamiento es intencional, no un accidente del default.
--
-- p_stripe_session_id: discriminador FIABLE que antes se desperdiciaba. Una fila
-- con session_id es de Stripe y por tanto NO es 'OTRO'; sin el, un concepto no
-- reconocido caia en OTRO, salia del conteo de meses del estado de cuenta pero
-- SI sumaba en ingresos → moroso falso.
DROP FUNCTION IF EXISTS public.pago_categoria(text, integer);
DROP FUNCTION IF EXISTS public.pago_categoria(text, integer, text);

CREATE FUNCTION public.pago_categoria(
  p_concepto           text,
  p_mes                integer DEFAULT NULL,
  p_stripe_session_id  text    DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
CALLED ON NULL INPUT
AS $cat$
DECLARE v text;
BEGIN
  v := lower(translate(
         btrim(coalesce(p_concepto, '')),
         'ÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãåéèëêíìïîóòöôõúùüûñç',
         'AAAAAAEEEEIIIIOOOOOUUUUNCaaaaaaeeeeiiiiooooouuuunc'));

  -- (1) Sin concepto pero con mes declarado ⇒ desbloquear_mes / captura manual.
  --     mes_desbloqueado es EXCLUSIVO de esos dos escritores.
  IF v = '' AND p_mes IS NOT NULL THEN
    RETURN 'MENSUALIDAD';
  END IF;

  IF v = '' THEN
    RETURN 'OTRO';
  END IF;

  -- (2) GUARDA NEGATIVA, antes que cualquier regla positiva.
  --     Con CHECK (monto >= 0) ya es posible registrar asientos de ajuste. Sin
  --     esta guarda, 'Reembolso del mes de marzo' casaria '%mes de%' →
  --     MENSUALIDAD → sumaria un mes pagado FANTASMA y el admin dejaria de
  --     perseguir una deuda real.
  IF v LIKE '%reembols%' OR v LIKE '%devoluc%' OR v LIKE '%cancelac%'
     OR v LIKE '%ajuste%' OR v LIKE '%descuento%' OR v LIKE '%bonific%' THEN
    RETURN 'OTRO';
  END IF;

  -- (3) Inscripcion. Se ELIMINO '%matricula%': no aparece en ninguno de los 4
  --     vocabularios reales (era un sinonimo inventado) y capturaba frases
  --     legitimas —'Módulo 2 (estándar) — matrícula EDV-0031'— ANTES de llegar
  --     a la regla de modulo, convirtiendo una mensualidad en inscripcion.
  IF v LIKE '%inscripcion%' THEN
    RETURN 'INSCRIPCION';
  END IF;

  -- (4) Certificacion. Se ELIMINO '%diploma%': colisiona con la linea de
  --     producto Cursos y Diplomados, que en EDVEX es un producto SEPARADO
  --     (edvex/migration-cursos-diplomados.sql:36, CHECK tipo IN
  --     ('curso','diplomado')). Un cobro de 'Diplomado en Enfermería' se
  --     clasificaba como CERTIFICACION y contaminaba la unica categoria que
  --     representa la titulacion. '%titulacion%' SI se conserva: el commit
  --     c633456 confirma que titulacion era el mismo producto.
  IF v LIKE '%certificacion%' OR v LIKE '%titulacion%' THEN
    RETURN 'CERTIFICACION';
  END IF;

  -- (5) Mensualidad / modulo.
  IF v LIKE '%modulo%' OR v LIKE '%mensualidad%'
     OR v LIKE 'mes %' OR v LIKE '%mes de%' THEN
    RETURN 'MENSUALIDAD';
  END IF;

  -- (6) Discriminador de ultimo recurso: si viene de Stripe, es una venta, no
  --     un 'OTRO'. Se apoya en meses/mes para no inventar categoria.
  IF p_stripe_session_id IS NOT NULL THEN
    IF p_mes IS NOT NULL THEN RETURN 'MENSUALIDAD'; END IF;
  END IF;

  RETURN 'OTRO';
END;
$cat$;

COMMENT ON FUNCTION public.pago_categoria(text, integer, text) IS
  'Normaliza los 4+ vocabularios de pagos.concepto a un dominio cerrado: '
  'INSCRIPCION | CERTIFICACION | MENSUALIDAD | OTRO. Total por construccion '
  '(nunca devuelve NULL). IMMUTABLE y CALLED ON NULL INPUT (acepta concepto '
  'NULL: es el caso de desbloquear_mes, desempatado por mes_desbloqueado). '
  'ATENCION: "OTRO" es el catch-all — que la funcion sea total NO significa que '
  'clasifique bien; la verificacion V5 lista los conceptos que caen ahi.';


-- =============================================================================
-- PASO 5 — public.pago_meses_estimados(...)
-- =============================================================================
-- Sustituye al COUNT(DISTINCT mes_desbloqueado) de plantilla, que en EDVEX
-- daria 0 para TODOS los pagos de Stripe (solo desbloquear_mes llena esa
-- columna).
-- Prioridad: meses_cubiertos declarado > heuristica por concepto.
DROP FUNCTION IF EXISTS public.pago_meses_estimados(integer, text, integer);

CREATE FUNCTION public.pago_meses_estimados(
  p_meses_cubiertos integer,
  p_concepto        text,
  p_mes             integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
CALLED ON NULL INPUT
AS $mce$
DECLARE v text;
BEGIN
  -- (1) Si el escritor lo declaro, MANDA. Tras PR 0 esta rama cubre el 100% de
  --     los pagos de Stripe (aplicar_pago_stripe escribe 0|1|2) y de la captura
  --     manual (desbloquear_mes escribe 1). Solo los 2 jobs pg_cron caen en (2).
  IF p_meses_cubiertos IS NOT NULL THEN
    RETURN GREATEST(p_meses_cubiertos, 0);
  END IF;

  -- (2) Heuristica de respaldo, solo para los escritores que no declaran.
  v := lower(translate(
         btrim(coalesce(p_concepto, '')),
         'ÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãåéèëêíìïîóòöôõúùüûñç',
         'AAAAAAEEEEIIIIOOOOOUUUUNCaaaaaaeeeeiiiiooooouuuunc'));

  IF v LIKE '%acelerad%' THEN RETURN 2; END IF;

  IF public.pago_categoria(p_concepto, p_mes) = 'MENSUALIDAD' THEN RETURN 1; END IF;

  RETURN 0;   -- inscripcion, certificacion, otro
END;
$mce$;

COMMENT ON FUNCTION public.pago_meses_estimados(integer, text, integer) IS
  'Meses de plan que cubre un pago. meses_cubiertos manda si esta declarado; '
  'si no, heuristica: acelerado=2, mensualidad=1, resto=0. La rama heuristica '
  'solo deberia alcanzar a las filas de los 2 jobs pg_cron.';


-- =============================================================================
-- PASO 6 — Vista public.v_pagos_clasificados
-- =============================================================================
DROP VIEW IF EXISTS public.v_pagos_clasificados;

CREATE VIEW public.v_pagos_clasificados
WITH (security_invoker = true)   -- ignorado en PG<15; la proteccion real es el REVOKE
AS
SELECT p.id,
       p.alumno_id,
       p.monto,
       p.concepto,
       p.mes_desbloqueado,
       p.meses_cubiertos,
       p.metodo_pago,
       p.referencia,
       p.stripe_session_id,
       p.registrado_por,
       p.fecha_pago,
       p.created_at,
       public.pago_es_demo(p.referencia)                                    AS es_demo,
       public.pago_categoria(p.concepto, p.mes_desbloqueado, p.stripe_session_id) AS categoria,
       public.pago_meses_estimados(p.meses_cubiertos, p.concepto, p.mes_desbloqueado) AS meses_estimados
  FROM public.pagos p;

COMMENT ON VIEW public.v_pagos_clasificados IS
  'pagos + categoria normalizada, meses estimados y marca de demo. Fuente unica '
  'para reportes y estado de cuenta. Moneda: USD en todo (no hay columna de divisa).';


-- =============================================================================
-- PASO 7 — Reportes de ingresos
-- =============================================================================
-- Portados de plantilla (20260717120000_pagos_fecha_pago.sql:21-61) con dos
-- desviaciones EDVEX:
--  (a) se EXCLUYEN las filas demo (p.es_demo = false): 241 de 470 filas son de
--      los jobs de siembra; sin el filtro los ingresos mostrados incluirian
--      dinero ficticio. Plantilla no lo contempla porque alla no hay jobs demo.
--  (b) se clampan los parametros: generate_series con 0/negativo devuelve
--      rejilla vacia y con NULL devuelve 0 filas.
-- La rejilla usa America/Mexico_City; el dato ya es DATE sin zona, asi que no
-- lleva AT TIME ZONE. Esto sustituye a la agregacion en JavaScript de
-- reportes/route.ts:54-58, que usaba la TZ del servidor Node (UTC en Vercel).
CREATE OR REPLACE FUNCTION public.reporte_ingresos_semanales(num_semanas integer DEFAULT 8)
RETURNS TABLE (semana_inicio date, total numeric)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH n AS (SELECT LEAST(GREATEST(COALESCE(num_semanas, 8), 1), 520) AS k),
  semanas AS (
    SELECT generate_series(
      date_trunc('week', (now() AT TIME ZONE 'America/Mexico_City'))
        - make_interval(weeks => (SELECT k FROM n) - 1),
      date_trunc('week', (now() AT TIME ZONE 'America/Mexico_City')),
      interval '1 week'
    ) AS inicio
  )
  SELECT s.inicio::date AS semana_inicio,
         COALESCE(SUM(p.monto), 0)::numeric AS total
    FROM semanas s
    LEFT JOIN public.v_pagos_clasificados p
      ON date_trunc('week', p.fecha_pago) = s.inicio
     AND p.es_demo = false
   GROUP BY s.inicio
   ORDER BY s.inicio;
$$;

CREATE OR REPLACE FUNCTION public.reporte_ingresos_mensuales(num_meses integer DEFAULT 6)
RETURNS TABLE (mes text, total numeric)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH n AS (SELECT LEAST(GREATEST(COALESCE(num_meses, 6), 1), 240) AS k),
  meses AS (
    SELECT generate_series(
      date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))
        - make_interval(months => (SELECT k FROM n) - 1),
      date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City')),
      interval '1 month'
    ) AS inicio
  )
  SELECT to_char(m.inicio, 'YYYY-MM') AS mes,
         COALESCE(SUM(p.monto), 0)::numeric AS total
    FROM meses m
    LEFT JOIN public.v_pagos_clasificados p
      ON date_trunc('month', p.fecha_pago) = m.inicio
     AND p.es_demo = false
   GROUP BY m.inicio
   ORDER BY m.inicio;
$$;

-- NOTA: fecha_pago es NULLABLE (decision 1). Las filas con fecha_pago NULL no
-- casan con ningun date_trunc y quedan fuera de forma natural. V3 vigila que ese
-- contador siga en 0.


-- =============================================================================
-- PASO 8 — public.estado_cuenta_alumnos(p_incluir_inactivos boolean)
-- =============================================================================
-- Esta funcion NO se porta: se REDISENA. La de plantilla asume
-- alumnos.id = usuarios.id = auth.uid(), columnas nombre/apellidos/nivel/
-- modalidad que EDVEX no tiene, y filtra por concepto = 'mensualidad', valor que
-- en EDVEX no aparece jamas.
--
-- Cambios frente a plantilla:
--  * JOIN usuarios u ON u.id = a.usuario_id   (PUENTE DE IDENTIDAD de EDVEX)
--  * u.nombre_completo en vez de nombre/apellidos
--  * plan_nombre/plan_duracion_meses desde planes_estudio en vez de nivel/modalidad
--  * meses contados con pago_categoria/pago_meses_estimados, no con
--    concepto = 'mensualidad' ni COUNT(DISTINCT mes_desbloqueado)
--  * fecha_ultimo_pago como DATE (el cast a timestamptz de plantilla existia
--    para no romper un cliente TS que en EDVEX aun no existe)
--  * filtro por usuarios.activo unicamente (ver preflight)
--  * se excluyen los ALUMNOS demo, no solo sus pagos
DROP FUNCTION IF EXISTS public.estado_cuenta_alumnos();
DROP FUNCTION IF EXISTS public.estado_cuenta_alumnos(boolean);

CREATE FUNCTION public.estado_cuenta_alumnos(p_incluir_inactivos boolean DEFAULT false)
RETURNS TABLE (
  alumno_id                       uuid,
  usuario_id                      uuid,
  nombre_completo                 text,
  email                           text,
  matricula                       text,
  plan_nombre                     text,
  plan_duracion_meses             integer,
  meses_desbloqueados             integer,
  meses_con_pago                  integer,
  meses_sin_pago_registrado       integer,
  meses_pagados_de_mas            integer,
  inscripcion_pagada              boolean,
  inscripcion_con_pago_registrado boolean,
  certificacion_pagada            boolean,
  total_pagado                    numeric,
  fecha_ultimo_pago               date,
  activo                          boolean
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH pr AS (   -- pagos REALES (sin demo)
    SELECT v.alumno_id,
           v.categoria,
           v.meses_estimados,
           v.monto,
           v.fecha_pago
      FROM public.v_pagos_clasificados v
     WHERE v.es_demo = false
  ),
  agg AS (
    SELECT pr.alumno_id,
           SUM(pr.meses_estimados) FILTER (WHERE pr.categoria = 'MENSUALIDAD')::integer AS meses_con_pago,
           bool_or(pr.categoria = 'INSCRIPCION')                                        AS tiene_pago_inscripcion,
           SUM(pr.monto)::numeric                                                       AS total_pagado,
           MAX(pr.fecha_pago)                                                           AS fecha_ultimo_pago
      FROM pr
     GROUP BY pr.alumno_id
  ),
  demo AS (   -- alumnos sembrados por registrar_alumnos_demo_semanal()
    SELECT DISTINCT v.alumno_id
      FROM public.v_pagos_clasificados v
     WHERE v.es_demo = true
  )
  SELECT a.id,
         a.usuario_id,
         u.nombre_completo,
         u.email,
         a.matricula,
         pe.nombre,
         pe.duracion_meses,
         a.meses_desbloqueados,
         COALESCE(g.meses_con_pago, 0)::integer,
         GREATEST(a.meses_desbloqueados - COALESCE(g.meses_con_pago, 0), 0)::integer,
         GREATEST(COALESCE(g.meses_con_pago, 0) - a.meses_desbloqueados, 0)::integer,
         a.inscripcion_pagada,
         COALESCE(g.tiene_pago_inscripcion, false),
         a.certificacion_pagada,
         COALESCE(g.total_pagado, 0)::numeric,
         g.fecha_ultimo_pago,
         COALESCE(u.activo, true)
    FROM public.alumnos a
    JOIN public.usuarios u        ON u.id  = a.usuario_id
    JOIN public.planes_estudio pe ON pe.id = a.plan_estudio_id
    LEFT JOIN agg g               ON g.alumno_id = a.id
   WHERE (p_incluir_inactivos OR COALESCE(u.activo, true))
     -- Los alumnos demo se excluyen SIEMPRE: sus pagos quedan fuera del CTE pr,
     -- asi que apareceria uno por cada uno con inscripcion_pagada = true y
     -- inscripcion_con_pago_registrado = false, ahogando los descuadres reales
     -- (el hueco de inscripcion-pagada/route.ts:29-32) que es justo lo que esa
     -- columna existe para exponer.
     AND NOT EXISTS (SELECT 1 FROM demo d WHERE d.alumno_id = a.id)
   ORDER BY u.nombre_completo;
$$;

COMMENT ON FUNCTION public.estado_cuenta_alumnos(boolean) IS
  'Estado de cuenta por alumno. Identidad: usuarios via alumnos.usuario_id (NO '
  'alumnos.id). Excluye pagos Y alumnos sembrados por los jobs demo. '
  'inscripcion_pagada es el FLAG de alumnos (gobierna el acceso del alumno en la '
  'app); inscripcion_con_pago_registrado es informativo, y su discrepancia es '
  'exactamente lo que el admin necesita ver. meses_pagados_de_mas existe porque '
  'el modulo acelerado suma 2 meses con 1 pago: sin esa columna, todo alumno '
  'acelerado apareceria como moroso. Moneda: USD.';


-- =============================================================================
-- PASO 9 — PERMISOS
-- =============================================================================
-- En Supabase, ALTER DEFAULT PRIVILEGES otorga EXECUTE/SELECT NOMINAL a anon y
-- authenticated, ademas del PUBLIC implicito ⇒ "REVOKE ... FROM PUBLIC" a secas
-- NO cierra nada. Hay que nombrar los tres y re-otorgar a service_role.
REVOKE EXECUTE ON FUNCTION public.reporte_ingresos_semanales(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reporte_ingresos_mensuales(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estado_cuenta_alumnos(boolean)      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reporte_ingresos_semanales(integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.reporte_ingresos_mensuales(integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.estado_cuenta_alumnos(boolean)      TO service_role;

-- La vista tambien: en Supabase las vistas reciben ACL nominales igual que las
-- tablas, asi que "FROM PUBLIC" no cerraria nada.
REVOKE ALL    ON public.v_pagos_clasificados FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_pagos_clasificados TO service_role;

-- pago_categoria, pago_meses_estimados y pago_es_demo NO se revocan: son puras,
-- no leen ninguna tabla, y revocarlas romperia su uso sin ganar seguridad.

-- NOTA: el REVOKE de desbloquear_mes se aplico en PR 0 y NO se repite aqui.
-- Sobrevive al CREATE OR REPLACE de la SECCION 4 del entregable: CREATE OR
-- REPLACE reutiliza la misma fila de pg_proc y conserva owner y proacl.
-- (Si se quiere certeza absoluta, repetirlo es idempotente e inocuo.)

RESET lock_timeout;

-- =============================================================================
-- FIN DEL DDL EJECUTABLE. Todo lo que sigue esta COMENTADO a proposito.
-- =============================================================================


-- =============================================================================
-- VERIFICACION — sesion aparte, consulta por consulta
-- =============================================================================
--
-- V1 — Columnas nuevas.
--      Esperado: fecha_pago | date | YES | CURRENT_DATE
--                meses_cubiertos | integer | YES | (null)
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='pagos'
--    AND column_name IN ('fecha_pago','meses_cubiertos') ORDER BY 1;
--
-- V2 — Backfill completo. Esperado: total=470, sin_fecha=0
-- SELECT count(*) AS total, count(*) FILTER (WHERE fecha_pago IS NULL) AS sin_fecha
--   FROM public.pagos;
--
-- V3 — CONTADOR CONTINUO (revisar semanalmente hasta el PR 6). Cualquier valor
--      > 0 significa que un escritor NOMBRA fecha_pago pasando NULL explicito
--      (el DEFAULT no aplica si la columna se nombra) — casi seguro un job cron.
--      Es el prerequisito para poder hacer SET NOT NULL algun dia.
-- SELECT count(*) AS filas_nuevas_sin_fecha
--   FROM public.pagos WHERE fecha_pago IS NULL;
--
-- V4 — Marca de demo. Esperado: demo = 241, reales = 229 (ajustar si el volumen
--      cambio; ajustar el ESPERADO, nunca la logica).
-- SELECT count(*) FILTER (WHERE es_demo)     AS demo,
--        count(*) FILTER (WHERE NOT es_demo) AS reales
--   FROM public.v_pagos_clasificados;
--
-- V4b — SONDA INDEPENDIENTE de la expresion (la comprobacion ingenua
--       "(referencia LIKE 'pi\_demo%') IS DISTINCT FROM es_demo" es INUTIL: da
--       falso positivo para toda fila con referencia NULL —todo Stripe— porque
--       NULL IS DISTINCT FROM false es TRUE; y para referencia NOT NULL compara
--       la expresion consigo misma, luego no puede detectar nada).
--       Filas sin Stripe y sin actor humano solo pueden venir de los 2 crons:
--       si alguna NO esta marcada como demo, el prefijo 'pi_demo' no es la senal
--       completa. Esperado: 0
-- SELECT count(*) AS demo_probablemente_no_marcada
--   FROM public.v_pagos_clasificados
--  WHERE es_demo = false AND stripe_session_id IS NULL AND registrado_por IS NULL;
--
-- V5 — COBERTURA REAL DEL CLASIFICADOR. Esta es la asercion que importa.
--      NO se comprueba "todas las filas tienen una categoria del dominio": eso
--      es cierto por construccion (hay un RETURN 'OTRO' final) y pasaria en
--      verde aunque las 470 filas cayeran en el catch-all.
--      Esperado: 0 filas. Si aparece alguna, el vocabulario cambio y hay que
--      ajustar pago_categoria ANTES de fiarse del estado de cuenta.
--      Es RAISE WARNING, no EXCEPTION: una asercion de auditoria no puede
--      revertir la migracion.
-- DO $v5$
-- DECLARE v_lista text;
-- BEGIN
--   SELECT string_agg(DISTINCT COALESCE(concepto, '«NULL»'), ' | ')
--     INTO v_lista
--     FROM public.v_pagos_clasificados WHERE categoria = 'OTRO';
--   IF v_lista IS NOT NULL THEN
--     RAISE WARNING 'Conceptos que caen en OTRO: %', v_lista;
--   ELSE
--     RAISE NOTICE 'Clasificador OK: ninguna fila cae en el catch-all.';
--   END IF;
-- END $v5$;
--
-- V5b — Desglose para inspeccion manual. Incluye si la fila viene de Stripe,
--       que es el discriminador que antes no se mostraba.
-- SELECT categoria, concepto, (stripe_session_id IS NOT NULL) AS de_stripe,
--        (mes_desbloqueado IS NOT NULL) AS con_mes, es_demo, count(*)
--   FROM public.v_pagos_clasificados
--  GROUP BY 1,2,3,4,5 ORDER BY 1,6 DESC;
--
-- V6 — meses_estimados coherentes. Esperado: acelerados → 2, estandar → 1
-- SELECT concepto, meses_cubiertos, meses_estimados, count(*)
--   FROM public.v_pagos_clasificados
--  WHERE categoria='MENSUALIDAD' GROUP BY 1,2,3 ORDER BY 1;
--
-- V7 — Reportes ejecutan y no incluyen demo.
-- SELECT * FROM public.reporte_ingresos_mensuales(6);
-- SELECT * FROM public.reporte_ingresos_semanales(8);
-- SELECT * FROM public.reporte_ingresos_mensuales(0);     -- clamp: 1 fila, no vacio
-- SELECT * FROM public.reporte_ingresos_mensuales(NULL);  -- clamp: 6 filas
--
-- V8 — Estado de cuenta ejecuta y la identidad resuelve (si devuelve 0 filas,
--      el JOIN de identidad esta mal: revisar alumnos.usuario_id).
-- SELECT count(*) FROM public.estado_cuenta_alumnos();
-- SELECT * FROM public.estado_cuenta_alumnos() LIMIT 10;
--
-- V9 — DESCUADRES a revisar a mano (informativo, no un fallo de la migracion):
--      (a) flag de inscripcion sin pago registrado = el hueco de
--          inscripcion-pagada/route.ts:29-32, que PR 3 cierra;
--      (b) meses pagados de mas = doble incremento del webhook viejo.
-- SELECT nombre_completo, matricula, inscripcion_pagada, inscripcion_con_pago_registrado,
--        meses_desbloqueados, meses_con_pago, meses_sin_pago_registrado, meses_pagados_de_mas
--   FROM public.estado_cuenta_alumnos()
--  WHERE (inscripcion_pagada AND NOT inscripcion_con_pago_registrado)
--     OR meses_sin_pago_registrado > 0 OR meses_pagados_de_mas > 0
--  ORDER BY meses_sin_pago_registrado DESC;
--
-- V10 — Permisos. Esperado: f | f | t para las 3 funciones.
-- SELECT has_function_privilege('anon',         'public.estado_cuenta_alumnos(boolean)','EXECUTE') AS anon,
--        has_function_privilege('authenticated','public.estado_cuenta_alumnos(boolean)','EXECUTE') AS auth,
--        has_function_privilege('service_role', 'public.estado_cuenta_alumnos(boolean)','EXECUTE') AS srv;
-- SELECT has_table_privilege('authenticated','public.v_pagos_clasificados','SELECT') AS vista_auth; -- f
--
-- V11 — RLS de pagos INTACTA. Esperado: pagos_select y pagos_insert sin cambios.
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
--  WHERE schemaname='public' AND tablename='pagos' ORDER BY policyname;
--
-- V12 — NO VERIFICADO / PREREQUISITO DEL PR 6. Leer los cuerpos de los 2 jobs.
--       Confirma (a) que usan lista explicita de columnas en el INSERT,
--       (b) que no nombran fecha_pago, (c) el prefijo real de referencia.
--       Sin esto, el SET NOT NULL de fecha_pago NO se puede planificar.
-- SELECT p.proname, pg_get_functiondef(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public'
--    AND p.proname IN ('generar_pagos_demo_diario','registrar_alumnos_demo_semanal');
-- SELECT jobid, schedule, command FROM cron.job ORDER BY jobid;


-- =============================================================================
-- ROLLBACK — sesion aparte, en ORDEN INVERSO de dependencias (R9 → R1)
-- =============================================================================
-- R9 — permisos: se van solos al dropear los objetos.
-- R8 — estado de cuenta
-- DROP FUNCTION IF EXISTS public.estado_cuenta_alumnos(boolean);
-- R7 — reportes
-- DROP FUNCTION IF EXISTS public.reporte_ingresos_semanales(integer);
-- DROP FUNCTION IF EXISTS public.reporte_ingresos_mensuales(integer);
-- R6 — vista (ANTES que las funciones que usa)
-- DROP VIEW IF EXISTS public.v_pagos_clasificados;
-- R5/R4 — clasificadores
-- DROP FUNCTION IF EXISTS public.pago_meses_estimados(integer, text, integer);
-- DROP FUNCTION IF EXISTS public.pago_categoria(text, integer, text);
-- R3 — marca de demo
-- DROP INDEX IF EXISTS public.idx_pagos_reales_fecha;
-- DROP FUNCTION IF EXISTS public.pago_es_demo(text);
-- R2 — meses_cubiertos. ATENCION: si PR 0 esta desplegado, aplicar_pago_stripe
--      la NOMBRA en su INSERT ⇒ dropearla rompe TODOS los pagos de Stripe con
--      42703. Revertir PRIMERO el codigo y la RPC de PR 0, o dejar la columna
--      (es aditiva e inocua; lo normal es NO borrarla).
-- ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_meses_cubiertos_check;
-- ALTER TABLE public.pagos DROP COLUMN IF EXISTS meses_cubiertos;
-- R1 — fecha_pago. Solo si de verdad hay que volver atras: se pierde el dato
--      retroactivo capturado por PR 3.
-- DROP INDEX IF EXISTS public.idx_pagos_fecha_pago;
-- ALTER TABLE public.pagos DROP COLUMN IF EXISTS fecha_pago;
--
-- NO hay rollback del CHECK de monto en este archivo: su dueno es PR 0.
-- =============================================================================
