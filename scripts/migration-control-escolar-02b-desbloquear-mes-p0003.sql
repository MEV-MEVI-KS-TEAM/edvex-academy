-- ============================================================================
-- public.desbloquear_mes — v2b  (incremental sobre v2, que YA esta aplicado)
-- ============================================================================
-- POR QUE UN ARCHIVO APARTE: el 02 se aplico en produccion el 2026-07-21 SIN
-- este cambio. Reeditarlo habria dejado el repo diciendo una cosa y la BD otra.
-- Este 02b es el delta, y es re-ejecutable por si solo.
--
-- CAMBIO UNICO respecto a v2: distinguir "el alumno no existe" de "el alumno
-- existe pero no tiene plan de estudios". Decision del owner (opcion B):
-- un alumno sin plan NO debe poder tener meses abiertos — el comportamiento
-- de fondo se conserva — pero el motivo deja de ser mentira.
--
-- SE CONSERVAN sin tocar: firma, tipo de retorno, SECURITY DEFINER, owner,
-- proacl (el REVOKE de fix-execute-rpcs-edvex.sql sobrevive: CREATE OR REPLACE
-- reutiliza la misma fila de pg_proc), search_path, concepto 'Módulo N (manual)',
-- meses_cubiertos = 1, y los ERRCODE P0001 / P0002 con sus mensajes exactos.
--
-- ----------------------------------------------------------------------------
-- POR QUE DESAPARECE EL JOIN
-- ----------------------------------------------------------------------------
-- v2 hacia:   FROM alumnos a JOIN planes_estudio pe ON pe.id = a.plan_estudio_id
-- Con plan_estudio_id NULL el JOIN no produce filas, se dispara IF NOT FOUND y
-- la RPC responde 'Alumno no encontrado' (P0001) sobre un alumno que el admin
-- esta viendo en pantalla.
--
-- v2b separa las dos preguntas en dos consultas, porque son dos fallos distintos
-- y merecen dos respuestas distintas:
--   1. ¿existe el alumno?          -> alumnos, con FOR UPDATE
--   2. ¿tiene plan, y cual es?     -> planes_estudio, ya sin JOIN
--
-- El FOR UPDATE se mantiene sobre alumnos (que es la fila que se actualiza).
-- Antes era 'FOR UPDATE OF a' porque el JOIN obligaba a nombrar la tabla; sin
-- JOIN, 'FOR UPDATE' a secas bloquea exactamente lo mismo. La serializacion
-- entre dos admins simultaneos NO cambia.
--
-- ----------------------------------------------------------------------------
-- GUARDA NUEVA QUE NO ESTABA EN EL PLAN
-- ----------------------------------------------------------------------------
-- Si plan_estudio_id apunta a un plan inexistente (FK ausente o borrado con la
-- FK deshabilitada), v_duracion_meses queda NULL. Entonces:
--     IF v_meses_nuevos > v_duracion_meses   -->   IF <int> > NULL   -->   NULL
-- y un IF con condicion NULL NO entra: el tope se saltaria EN SILENCIO y el
-- alumno acumularia meses sin limite. En v2 este caso era inalcanzable porque
-- el JOIN interno ya lo filtraba (mal, pero lo filtraba). Al quitar el JOIN hay
-- que cubrirlo explicitamente, o el fix introduciria un agujero peor que el que
-- arregla. Se trata como plan invalido -> P0003.
--
-- ----------------------------------------------------------------------------
-- REQUISITO EN LA APP (PR 3)
-- ----------------------------------------------------------------------------
-- P0003 es un ERRCODE NUEVO. src/app/api/admin/alumnos/[id]/desbloquear-mes/
-- route.ts hoy solo distingue P0001/P0002; sin una rama para P0003 el admin
-- vera un 500 generico en vez de "asigna un plan primero". Mapearlo es trabajo
-- del PR 3, NO de este archivo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.desbloquear_mes(
  p_alumno_id      uuid,
  p_monto          numeric,
  p_metodo_pago    text,
  p_referencia     text,
  p_registrado_por uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_meses_nuevos    integer;
  v_duracion_meses  integer;
  v_plan_id         uuid;
BEGIN
  -- (1) ¿Existe el alumno? FOR UPDATE serializa a dos admins simultaneos.
  SELECT a.plan_estudio_id, a.meses_desbloqueados + 1
    INTO v_plan_id, v_meses_nuevos
    FROM alumnos a
   WHERE a.id = p_alumno_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumno no encontrado' USING ERRCODE = 'P0001';
  END IF;

  -- (2) ¿Tiene plan asignado? Motivo propio, no disfrazado de P0001.
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'El alumno no tiene plan de estudios asignado'
      USING ERRCODE = 'P0003';
  END IF;

  -- (3) El plan existe de verdad. Sin esta guarda, un plan colgado dejaria
  --     v_duracion_meses NULL y la comparacion del paso 4 nunca entraria.
  SELECT pe.duracion_meses
    INTO v_duracion_meses
    FROM planes_estudio pe
   WHERE pe.id = v_plan_id;

  IF NOT FOUND OR v_duracion_meses IS NULL THEN
    RAISE EXCEPTION 'El plan de estudios del alumno no es valido'
      USING ERRCODE = 'P0003';
  END IF;

  -- (4) Tope por duracion del plan. Identico a v2.
  IF v_meses_nuevos > v_duracion_meses THEN
    RAISE EXCEPTION 'El alumno ya tiene todos los meses desbloqueados' USING ERRCODE = 'P0002';
  END IF;

  UPDATE alumnos
     SET meses_desbloqueados = meses_desbloqueados + 1
   WHERE id = p_alumno_id;

  INSERT INTO pagos (
    alumno_id, monto, mes_desbloqueado, metodo_pago, referencia,
    registrado_por, meses_cubiertos, concepto
  )
  VALUES (
    p_alumno_id, p_monto, v_meses_nuevos, p_metodo_pago, p_referencia,
    p_registrado_por, 1,
    format('Módulo %s (manual)', v_meses_nuevos)
  );

  RETURN v_meses_nuevos;
END;
$function$;


-- ============================================================================
-- VERIFICACION
-- ============================================================================
-- V1 — La funcion conserva seguridad, owner y privilegios tras el REPLACE.
--      Esperado: prosecdef = true, owner = postgres,
--                proacl SIN anon ni authenticated.
--
-- SELECT p.proname, p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner) AS owner,
--        p.proacl, p.proconfig
--   FROM pg_catalog.pg_proc p
--   JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname='public' AND p.proname='desbloquear_mes';
--
-- V2 — P0003 con alumno sin plan. Como hoy sin_plan = 0, hay que fabricar el
--      caso EN UNA TRANSACCION QUE SE REVIERTE. No dejar esto commiteado.
--
-- BEGIN;
--   -- toma un alumno cualquiera y quitale el plan
--   UPDATE alumnos SET plan_estudio_id = NULL
--    WHERE id = (SELECT id FROM alumnos ORDER BY created_at LIMIT 1);
--   -- esperado: ERROR P0003 'El alumno no tiene plan de estudios asignado'
--   SELECT public.desbloquear_mes(
--            (SELECT id FROM alumnos WHERE plan_estudio_id IS NULL LIMIT 1),
--            100, 'EFECTIVO', 'prueba-p0003', NULL);
-- ROLLBACK;   -- <<< IMPRESCINDIBLE
--
-- V3 — P0001 sigue intacto para un alumno inexistente.
--      Esperado: ERROR P0001 'Alumno no encontrado'.
--
-- SELECT public.desbloquear_mes('00000000-0000-0000-0000-000000000000'::uuid,
--                               100, 'EFECTIVO', 'prueba-p0001', NULL);
--
-- V4 — El camino feliz sigue funcionando y escribe las 2 columnas nuevas.
--      Esperado: meses_cubiertos = 1 y concepto = 'Módulo N (manual)'.
--
-- BEGIN;
--   SELECT public.desbloquear_mes(
--            (SELECT id FROM alumnos WHERE plan_estudio_id IS NOT NULL
--               AND meses_desbloqueados = 0 LIMIT 1),
--            500, 'EFECTIVO', 'prueba-feliz', NULL);
--   SELECT mes_desbloqueado, meses_cubiertos, concepto, metodo_pago
--     FROM pagos WHERE referencia = 'prueba-feliz';
-- ROLLBACK;
--
-- V5 — P0002 (tope) sigue disparando. Alumno con meses_desbloqueados ya igual
--      a la duracion de su plan; si no hay ninguno, fabricarlo dentro de un
--      BEGIN/ROLLBACK como en V2.


-- ============================================================================
-- ROLLBACK — volver a v2 (con el JOIN interno y sin P0003)
-- ============================================================================
-- Reaplicar scripts/migration-control-escolar-02-desbloquear-mes-v2.sql.
-- No hay estado que deshacer: este cambio no toca datos ni esquema, solo el
-- cuerpo de la funcion.
