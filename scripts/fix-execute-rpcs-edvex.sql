-- ============================================================================
-- fix-execute-rpcs-edvex.sql
-- EXECUTE abierto en RPCs SECURITY DEFINER que mueven dinero o privilegios
-- ============================================================================
-- ESTADO: YA APLICADO EN PRODUCCION EDVEX (2026-07-20).
--   Verificado tras aplicar: proacl de desbloquear_mes = {postgres, service_role}.
-- Este archivo lo VERSIONA como documentacion y retrofit re-ejecutable para el
-- resto de clientes de la familia (plantilla-maestra, CRECE, IMFO...), donde el
-- mismo agujero es esperable porque las funciones se crearon igual.
--
-- ----------------------------------------------------------------------------
-- SINTOMA
-- ----------------------------------------------------------------------------
-- Cualquier alumno autenticado podia regalarse meses de plan de pago desde la
-- consola del navegador, con la anon key y su propia sesion:
--
--   await supabase.rpc('desbloquear_mes', {
--     p_alumno_id: '<su alumnos.id>', p_monto: 1,
--     p_metodo_pago: 'EFECTIVO', p_referencia: null, p_registrado_por: null
--   })
--
-- ----------------------------------------------------------------------------
-- CAUSA
-- ----------------------------------------------------------------------------
-- Dos condiciones que solo son peligrosas JUNTAS:
--   1. public.desbloquear_mes es SECURITY DEFINER y NO valida quien la llama.
--      Se escribio asi porque el unico llamador previsto era una API admin.
--   2. En PostgreSQL, CREATE FUNCTION otorga EXECUTE a PUBLIC por defecto, y
--      Supabase ademas concede privilegios nominales a anon/authenticated en el
--      esquema public via ALTER DEFAULT PRIVILEGES.
-- Resultado: la funcion corre con los privilegios del owner y la puede invocar
-- cualquiera. La RLS no interviene: SECURITY DEFINER la evalua como el owner.
--
-- Es un agujero DISTINTO del de escalada de rol (scripts/fix-escalada-rol-edvex.sql),
-- aunque comparte raiz: privilegios por defecto demasiado amplios en public.
--
-- ----------------------------------------------------------------------------
-- ALCANCE — POR QUE SOLO desbloquear_mes
-- ----------------------------------------------------------------------------
-- NO se puede revocar EXECUTE a ciegas en todas las SECURITY DEFINER: algunas
-- se invocan legitimamente con el cliente de SESION (rol authenticated) y
-- revocarlas rompe funcionalidad de alumno.
--
--   public.desbloquear_mes         -> unico llamador:
--       src/app/api/admin/alumnos/[id]/desbloquear-mes/route.ts:29
--       usa createAdminClient() = service_role  ⇒ REVOCAR es seguro.
--
--   public.recalcular_calificacion -> llamador:
--       src/app/api/alumno/evaluacion/[id]/enviar/route.ts:149
--       usa el cliente de SESION (authenticated) ⇒ NO TOCAR.
--       Revocarle EXECUTE romperia el envio de evaluaciones de los alumnos.
--
-- ANTES DE APLICAR ESTE SCRIPT EN OTRO CLIENTE: repetir ese analisis. La
-- consulta de la seccion VERIFICACION lista las candidatas; el grep del
-- llamador decide. No hay atajo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FIX (idempotente: REVOKE/GRANT son declarativos, re-ejecutables sin efecto)
-- ----------------------------------------------------------------------------
-- Guarda por si la funcion no existe en este cliente: sin ella, un cliente que
-- no tenga desbloquear_mes aborta el script con 42883.
DO $$
BEGIN
  IF to_regprocedure('public.desbloquear_mes(uuid, numeric, text, text, uuid)') IS NOT NULL THEN

    -- FROM PUBLIC NO BASTA en Supabase: anon/authenticated tienen concesiones
    -- NOMINALES propias (via ALTER DEFAULT PRIVILEGES), no heredadas de PUBLIC.
    -- Revocar solo a PUBLIC deja el agujero abierto y la verificacion en verde.
    -- Es exactamente el hallazgo del commit 8f18ccc de plantilla-maestra.
    REVOKE EXECUTE ON FUNCTION public.desbloquear_mes(uuid, numeric, text, text, uuid)
      FROM PUBLIC, anon, authenticated;

    GRANT EXECUTE ON FUNCTION public.desbloquear_mes(uuid, numeric, text, text, uuid)
      TO service_role;

    RAISE NOTICE 'desbloquear_mes: EXECUTE restringido a service_role.';
  ELSE
    RAISE NOTICE 'desbloquear_mes no existe en esta BD; nada que hacer.';
  END IF;
END $$;


-- ============================================================================
-- VERIFICACION — ejecutar tras aplicar
-- ============================================================================
-- V1 — proacl esperado: {postgres=X/postgres, service_role=X/postgres}
--      NO debe aparecer anon ni authenticated, ni un '=X/' suelto (que es PUBLIC).
--
-- SELECT p.proname,
--        p.prosecdef                                  AS security_definer,
--        pg_catalog.pg_get_userbyid(p.proowner)       AS owner,
--        p.proacl
--   FROM pg_catalog.pg_proc p
--   JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('desbloquear_mes', 'recalcular_calificacion');
--
-- V2 — Censo de TODAS las SECURITY DEFINER de public y quien puede ejecutarlas.
--      Sirve para auditar otros clientes de la familia. Toda fila con
--      puede_authenticated = true es una candidata a revisar (NO a revocar sin
--      antes localizar sus llamadores en src/).
--
-- SELECT p.proname,
--        pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS puede_authenticated,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') AS puede_anon
--   FROM pg_catalog.pg_proc p
--   JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prosecdef
--  ORDER BY puede_authenticated DESC, p.proname;
--
--      NOTA: usar has_function_privilege('authenticated', ...) y NO
--      has_function_privilege('PUBLIC', ...). El pseudo-rol PUBLIC no es un rol
--      real: la llamada falla con 42704 y aborta la consulta entera.
--
-- V3 — Prueba negativa real (la unica que demuestra el cierre). Desde el
--      navegador, con la sesion de un ALUMNO y la anon key:
--        await supabase.rpc('desbloquear_mes', { p_alumno_id: '<su id>', p_monto: 1,
--          p_metodo_pago: 'EFECTIVO', p_referencia: null, p_registrado_por: null })
--      Esperado: error 42501 "permission denied for function desbloquear_mes".
--      Y confirmar despues que alumnos.meses_desbloqueados NO cambio.


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Solo si se demuestra que un flujo legitimo necesitaba EXECUTE con sesion de
-- usuario. En ese caso la solucion correcta NO es este rollback, sino anadir
-- validacion del llamador DENTRO de la funcion (comprobar is_admin() o el
-- puente alumnos.usuario_id = auth.uid()), porque el problema de fondo es que
-- una SECURITY DEFINER no valide quien la invoca.
--
-- GRANT EXECUTE ON FUNCTION public.desbloquear_mes(uuid, numeric, text, text, uuid)
--   TO authenticated;
