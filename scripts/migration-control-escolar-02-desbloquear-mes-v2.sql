-- ============================================================================
-- public.desbloquear_mes — v2
-- Cambios respecto a la version en produccion, EXACTAMENTE TRES:
--   (1) el INSERT en pagos escribe ademas meses_cubiertos = 1
--   (2) el INSERT en pagos escribe ademas concepto = 'Módulo N (manual)'
--   (3) search_path pasa de 'public' a pg_catalog, public, pg_temp
-- Firma, tipo de retorno, volatilidad, SECURITY DEFINER, logica, mensajes y
-- ERRCODE (P0001 / P0002) son IDENTICOS.
--
-- SOBRE (2) — POR QUE ESCRIBIR concepto:
-- Hasta ahora esta funcion dejaba concepto NULL, y pago_categoria() tenia que
-- deducir MENSUALIDAD por la via indirecta "concepto vacio + mes_desbloqueado
-- NOT NULL". Esa regla funciona, pero es fragil: cualquier escritor futuro que
-- ponga mes_desbloqueado sin concepto hereda la clasificacion por accidente.
-- Escribiendo el concepto explicito, el historico NUEVO se clasifica por la
-- regla directa (5) '%modulo%' y la regla indirecta (1) queda como red para el
-- historico ANTIGUO, que no se reescribe.
--
-- Formato 'Módulo N (manual)': deliberadamente paralelo al del webhook
-- ('Módulo N (estándar)' / 'Módulo N (acelerado)'), para que las tres vias de
-- alta sean legibles de un vistazo en la misma columna y el sufijo diga el
-- ORIGEN. N es el mes que se acaba de abrir (v_meses_nuevos), el mismo valor
-- que va en mes_desbloqueado — no se inventa un contador aparte.
--
-- VERIFICADO que no rompe el clasificador: 'Módulo 3 (manual)' normaliza a
-- 'modulo 3 (manual)', no casa ninguna guarda negativa (reembols/devoluc/
-- cancelac/ajuste/descuento/bonific) ni las reglas (3)/(4), y cae en la regla
-- (5) '%modulo%' → MENSUALIDAD. Es la misma categoria que producia la regla
-- indirecta, asi que los conteos de meses NO cambian ni para el historico ni
-- para las filas nuevas.
-- REQUISITO PREVIO: public.pagos.meses_cubiertos debe existir (PR 0, seccion 0b).
-- NOTA: este CREATE OR REPLACE **conserva** el REVOKE aplicado en PR 0. Un
--       CREATE OR REPLACE reutiliza la misma fila de pg_proc (mismo OID) y
--       mantiene owner y proacl; ALTER DEFAULT PRIVILEGES solo actua sobre
--       objetos CREADOS. (Repetir el REVOKE despues es igualmente inocuo.)
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
BEGIN
  SELECT a.meses_desbloqueados + 1, pe.duracion_meses
    INTO v_meses_nuevos, v_duracion_meses
    FROM alumnos a
    JOIN planes_estudio pe ON pe.id = a.plan_estudio_id
   WHERE a.id = p_alumno_id
     FOR UPDATE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumno no encontrado' USING ERRCODE = 'P0001';
  END IF;

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
    -- format() y no concatenacion con ||: si v_meses_nuevos fuera NULL, '||'
    -- devolveria NULL y el concepto se perderia en silencio. Aqui es imposible
    -- (v_meses_nuevos ya paso el NOT FOUND y la comparacion con duracion_meses),
    -- pero la forma segura no cuesta nada y sobrevive a futuras ediciones.
    format('Módulo %s (manual)', v_meses_nuevos)
  );

  RETURN v_meses_nuevos;
END;
$function$;
