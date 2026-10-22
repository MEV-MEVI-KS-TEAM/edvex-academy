-- EDVEX — limpieza nocturna de las cuentas protegidas (21-oct-2026). Idempotente.
--
-- Las cuentas protegidas (IDS_DEFAULT en src/lib/alumno-protegido.ts) las comparten
-- los vendedores con los prospectos. Todos los días a las 3:00 am de CDMX
-- (09:00 UTC; México ya no cambia de horario) se borra SOLO su avance y sus
-- respuestas guardadas: semanas y lecciones completadas, notas personales,
-- respuestas de quiz, intentos y resultados de examen, calificaciones y logros
-- (y su promedio queda vacío).
--
-- NO toca: la cuenta ni su contraseña, sus sesiones, su plan, meses
-- desbloqueados, inscripciones, pagos ni documentos. NUNCA toca otras cuentas:
-- la lista de ids va fija aquí y es la MISMA que IDS_DEFAULT (si cambias una,
-- cambia la otra).
--
-- La función es SECURITY DEFINER y nadie más que postgres (pg_cron) puede
-- ejecutarla: se le quita EXECUTE a PUBLIC, anon y authenticated, así que no se
-- puede llamar por /rest/v1/rpc.
--
-- Fuera de alcance, a propósito: ids agregados solo por la env ALUMNOS_PROTEGIDOS
-- (quedan protegidos pero no se limpian) y el avance de actividades, que vive en
-- el navegador (localStorage), no en la base.

BEGIN;

CREATE OR REPLACE FUNCTION public.limpiar_cuentas_protegidas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- auth.users.id — la MISMA lista que IDS_DEFAULT (src/lib/alumno-protegido.ts)
  v_usuarios uuid[] := ARRAY[
    '50e1f467-766b-401d-8473-70e014873ec0',  -- serranomas@outlook.com — Preparatoria
    '0e691441-d632-41a3-a7c6-0ce954356b46',  -- sofia.ramirez — Secundaria
    '9ea910aa-a3be-47cc-b7b0-8619cfc13483',  -- emiliano.vargas — Cursos de ingreso
    'ff53509a-0dec-4ef8-946a-728aea32a39f',  -- andrea.morales — Administración
    'cc2fa082-b767-4a68-8970-fff6e2bd32a1',  -- rodrigo.castaneda — Derecho
    '02982a8d-f3e8-42d1-ac5f-d3e1bfc6032d'   -- fernanda.ortiz — Psicología
  ]::uuid[];
  v_alumnos uuid[];
  n int;
  r jsonb := '{}'::jsonb;
BEGIN
  SELECT array_agg(a.id) INTO v_alumnos FROM public.alumnos a WHERE a.usuario_id = ANY(v_usuarios);
  -- Falla cerrado: sin alumnos, o con más filas de alumno que cuentas, no borra nada.
  IF v_alumnos IS NULL OR cardinality(v_alumnos) > cardinality(v_usuarios) THEN
    RAISE EXCEPTION 'limpiar_cuentas_protegidas: % alumnos para % cuentas', cardinality(v_alumnos), cardinality(v_usuarios);
  END IF;

  DELETE FROM public.progreso_semanas        WHERE alumno_id = ANY(v_alumnos); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('progreso_semanas', n);
  DELETE FROM public.curso_progreso          WHERE alumno_id = ANY(v_alumnos); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('curso_progreso', n);
  DELETE FROM public.notas_alumno            WHERE alumno_id = ANY(v_alumnos); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('notas_alumno', n);
  DELETE FROM public.quiz_respuestas         WHERE alumno_id = ANY(v_alumnos); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('quiz_respuestas', n);
  DELETE FROM public.intentos_evaluacion     WHERE alumno_id = ANY(v_alumnos); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('intentos_evaluacion', n);
  DELETE FROM public.curso_examen_resultados WHERE alumno_id = ANY(v_alumnos); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('curso_examen_resultados', n);
  DELETE FROM public.calificaciones          WHERE alumno_id = ANY(v_alumnos); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('calificaciones', n);
  DELETE FROM public.logros_alumno           WHERE alumno_id = ANY(v_alumnos); GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('logros_alumno', n);
  UPDATE public.alumnos SET calificacion_promedio = NULL
   WHERE id = ANY(v_alumnos) AND calificacion_promedio IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('promedios', n);

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.limpiar_cuentas_protegidas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limpiar_cuentas_protegidas() FROM anon, authenticated;

-- 3:00 am CDMX = 09:00 UTC (pg_cron corre en GMT). Con el mismo nombre, re-ejecutar actualiza el job.
SELECT cron.schedule('limpieza-cuentas-protegidas', '0 9 * * *', $cron$SELECT public.limpiar_cuentas_protegidas()$cron$);

COMMIT;
