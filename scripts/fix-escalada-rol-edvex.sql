-- ============================================================================
-- fix-escalada-rol-edvex.sql — EDVEX Academy
-- Escalada de privilegios via UPDATE de usuarios.rol
-- ============================================================================
-- ESTADO: YA APLICADO EN PRODUCCION por el equipo. Este archivo NO introduce
--         cambio nuevo: versiona y documenta el fix, y sirve de retrofit
--         re-ejecutable para cualquier otro cliente de la familia.
--         Es idempotente: correrlo de nuevo deja el mismo estado.
--         Por eso queda FUERA del PR 0.
--
-- SINTOMA: un alumno autenticado podia auto-promoverse a admin con
--   supabase.from('usuarios').update({ rol: 'ADMIN' }).eq('id', suId)
--
-- CAUSA: dos capas fallan a la vez.
--   1) GRANT: el rol `authenticated` tenia UPDATE de TABLA sobre public.usuarios
--      (Supabase lo otorga por defecto), es decir sobre TODAS las columnas,
--      incluida `rol`.
--   2) RLS: RLS filtra FILAS, no COLUMNAS. La policy solo exige que la fila sea
--      la propia — EDVEX-SUPABASE-SETUP.sql:339-343:
--        CREATE POLICY usuarios_update ON public.usuarios
--          FOR UPDATE TO authenticated
--          USING       (id = auth.uid() OR public.is_admin())
--          WITH CHECK  (id = auth.uid() OR public.is_admin());
--      El WITH CHECK vuelve a comprobar la IDENTIDAD de la fila; nada impide que
--      la fila resultante lleve rol='ADMIN'. El control por columna solo puede
--      venir del sistema de GRANTs.
--
-- FIX: quitar el UPDATE amplio y re-otorgar SOLO columnas de perfil inofensivas.
--   Allowlist EDVEX = (nombre_completo, avatar_url). NO se usa la de
--   plantilla-maestra (nombre/apellidos/telefono/foto_url/full_name): esas
--   columnas NO existen en public.usuarios de EDVEX, cuyo esquema es
--   (id, email, nombre_completo, avatar_url, rol, activo, created_at).
--   El descubrimiento es dinamico contra information_schema, asi que el script
--   es reutilizable en otro cliente sin editarlo.
--
-- ALCANCE VERIFICADO EN CODIGO (edvex/src):
--   usuarios.avatar_url        -> api/alumno/avatar/route.ts:33-36        (service_role)
--   usuarios.nombre_completo   -> api/admin/alumnos/[id]/route.ts:124     (service_role)
--   alumnos.plan_estudio_id    -> api/alumno/seleccionar-plan/route.ts:46 (service_role)
--   grep .update|.insert|.upsert en *.tsx -> 0 resultados
--   => NINGUN flujo legitimo escribe usuarios/alumnos con la sesion del usuario.
--      Por eso el REVOKE sobre alumnos es seguro. Si un cliente futuro lo
--      necesitara, poner v_revocar_alumnos := false y otorgar la columna puntual.
--
-- APLICAR por conexion DIRECTA (5432) como rol postgres. NUNCA por el pooler:
--   psql "postgresql://postgres:<PWD>@db.<REF>.supabase.co:5432/postgres" \
--        -f scripts/fix-escalada-rol-edvex.sql
-- ============================================================================

DO $$
DECLARE
  safe_cols          text[] := ARRAY['nombre_completo','avatar_url'];
  sensitive_cols     text[] := ARRAY['id','email','rol','activo','created_at'];
  v_revocar_alumnos  boolean := true;   -- ver bloque ALCANCE VERIFICADO
  col                text;
  grant_list         text := '';
BEGIN
  -- ── public.usuarios ───────────────────────────────────────────────────────
  IF to_regclass('public.usuarios') IS NOT NULL THEN
    -- 1) Quitar el UPDATE de TABLA (cubre el grant por defecto de Supabase).
    EXECUTE 'REVOKE UPDATE ON public.usuarios FROM anon, authenticated';

    -- 2) Revocar explicitamente columnas sensibles (cubre grants por COLUMNA,
    --    que un REVOKE de tabla no siempre elimina).
    FOR col IN
      SELECT c.column_name FROM information_schema.columns c
       WHERE c.table_schema='public' AND c.table_name='usuarios'
         AND c.column_name = ANY(sensitive_cols)
    LOOP
      EXECUTE format('REVOKE UPDATE (%I) ON public.usuarios FROM anon, authenticated', col);
    END LOOP;

    -- 3) Re-otorgar UPDATE solo sobre las columnas de la allowlist QUE EXISTAN.
    FOR col IN
      SELECT c.column_name FROM information_schema.columns c
       WHERE c.table_schema='public' AND c.table_name='usuarios'
         AND c.column_name = ANY(safe_cols)
       ORDER BY c.column_name
    LOOP
      grant_list := grant_list || quote_ident(col) || ', ';
    END LOOP;

    IF length(grant_list) > 0 THEN
      grant_list := left(grant_list, length(grant_list) - 2);
      EXECUTE format('GRANT UPDATE (%s) ON public.usuarios TO authenticated', grant_list);
      RAISE NOTICE 'usuarios: UPDATE de authenticated restringido a (%).', grant_list;
    ELSE
      RAISE NOTICE 'usuarios: ninguna columna de la allowlist existe; UPDATE queda revocado por completo.';
    END IF;
    -- LEER ESTE NOTICE: debe listar DOS columnas. Si lista una, avatar_url no
    -- existe en la tabla (no aparece en ningun .sql versionado del worktree; la
    -- escribe api/alumno/avatar/route.ts:33 con service_role, asi que se creo
    -- fuera del repo). Si lista una sola, el estado sigue siendo seguro.
    RAISE NOTICE 'usuarios: anon sin UPDATE.';
  ELSE
    RAISE NOTICE 'usuarios: la tabla no existe; nada que hacer.';
  END IF;

  -- ── public.alumnos (defensa en profundidad) ───────────────────────────────
  -- La policy alumnos_update ya es admin-only (EDVEX-SUPABASE-SETUP.sql:378-381)
  -- y todos los writes van por service_role. Revocar el GRANT elimina la capa de
  -- privilegio que hoy solo la RLS esta conteniendo.
  IF v_revocar_alumnos AND to_regclass('public.alumnos') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE ON public.alumnos FROM anon, authenticated';
    RAISE NOTICE 'alumnos: UPDATE revocado para anon/authenticated (la app usa service_role).';
  ELSIF NOT v_revocar_alumnos THEN
    RAISE NOTICE 'alumnos: REVOKE omitido por configuracion (v_revocar_alumnos = false).';
  END IF;

  -- ── Defensa en profundidad adicional (barata, no cierra ningun flujo) ─────
  -- INSERT/DELETE sobre usuarios NO son vector de escalada hoy: no existen
  -- policies FOR INSERT/DELETE y RLS esta activo (EDVEX-SUPABASE-SETUP.sql:319,
  -- :347 "INSERT y DELETE solo via service role"), asi que un authenticated no
  -- puede borrar y recrear su fila con rol='ADMIN'. Se revoca igualmente.
  IF to_regclass('public.usuarios') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, DELETE ON public.usuarios FROM anon, authenticated';
  END IF;
END $$;

-- ============================================================================
-- VERIFICACION (correr despues; resultados esperados anotados)
-- ============================================================================
-- V1. ¿authenticated puede tocar rol?  -> esperado: f
-- SELECT has_column_privilege('authenticated','public.usuarios','rol','UPDATE') AS puede_rol;

-- V2. Columnas de usuarios con UPDATE por grantee
--     -> esperado: authenticated = {avatar_url, nombre_completo}; anon = sin fila
-- SELECT grantee, string_agg(column_name, ', ' ORDER BY column_name) AS cols_update
--   FROM information_schema.column_privileges
--  WHERE table_schema='public' AND table_name='usuarios'
--    AND privilege_type='UPDATE' AND grantee IN ('anon','authenticated')
--  GROUP BY grantee;

-- V3. alumnos -> esperado: 0 filas
-- SELECT grantee, column_name FROM information_schema.column_privileges
--  WHERE table_schema='public' AND table_name='alumnos'
--    AND privilege_type='UPDATE' AND grantee IN ('anon','authenticated');

-- V4. service_role intacto -> esperado: t, t
-- SELECT has_table_privilege('service_role','public.usuarios','UPDATE') AS srv_usuarios,
--        has_table_privilege('service_role','public.alumnos','UPDATE')  AS srv_alumnos;

-- ============================================================================
-- DETECCION en OTROS clientes (si devuelve fila -> vulnerable)
-- ============================================================================
-- SELECT current_database() AS cliente
--  WHERE has_column_privilege('authenticated','public.usuarios','rol','UPDATE');

-- ============================================================================
-- ROLLBACK (solo si el fix rompiera un flujo; deja el sistema VULNERABLE)
-- ============================================================================
-- PREFERIR SIEMPRE el rollback PARCIAL: si un flujo necesita una columna
-- concreta, otorgar SOLO esa, nunca la tabla entera.
--   GRANT UPDATE (telefono) ON public.usuarios TO authenticated;
--   GRANT UPDATE (plan_estudio_id) ON public.alumnos TO authenticated;
--     -- ojo: alumnos_update es admin-only, harian falta ademas policies nuevas.
--
-- Rollback total (REABRE LA ESCALADA — no hacer):
-- BEGIN;
--   REVOKE UPDATE ON public.usuarios FROM authenticated;  -- limpia grants de columna
--   GRANT  UPDATE ON public.usuarios TO authenticated;    -- <-- REABRE LA ESCALADA
--   GRANT  UPDATE ON public.alumnos  TO authenticated;
-- COMMIT;
-- ============================================================================
