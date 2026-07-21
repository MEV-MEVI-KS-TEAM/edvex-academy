-- =============================================================================
-- EDVEX ACADEMY — PR 0: RPC transaccional del webhook de Stripe
-- Archivo: scripts/migration-control-escolar-00-aplicar-pago-stripe.sql
-- Fecha: 2026-07-20
--
-- APLICAR: Supabase SQL Editor, como owner del proyecto (rol postgres), O por
--          conexion directa 5432 como postgres. NUNCA por el pooler.
-- IMPORTANTE: este archivo contiene SOLO DDL ejecutable. La VERIFICACION y el
--             ROLLBACK estan integramente COMENTADOS al final: el SQL Editor
--             envia el script como un unico batch en transaccion implicita, y
--             un ROLLBACK o un error de sintaxis en una prueba revertiria el
--             DDL entero sin aviso claro.
-- ORDEN DE DESPLIEGUE: aplicar este .sql ANTES de desplegar el webhook nuevo.
--             (Aun asi, el TS clasifica 42883/PGRST202 como TRANSITORIOS, de
--              modo que un despliegue desordenado se recupera solo por reintento
--              de Stripe en vez de perder los pagos.)
-- =============================================================================

SET lock_timeout = '3s';   -- fallar rapido en vez de encolarse delante de los
                           -- INSERT del webhook y de los 2 jobs pg_cron.

-- =============================================================================
-- SECCION 0 — CHECK de monto: > 0  →  >= 0
-- =============================================================================
-- POR QUE: Stripe entrega amount_total = 0 en cupones del 100% y precios de
-- cortesia. Con la RPC transaccional, un CHECK (monto > 0) aborta la
-- transaccion entera: el alumno pago (sesion 'complete') y nunca recibe nada.
-- Relajar es una AMPLIACION de dominio: no puede invalidar ninguna de las 470
-- filas existentes ni rechazar nada que hoy pase. Los negativos siguen
-- prohibidos (no hay devoluciones en este modelo).
--
-- Se localiza por DEFINICION, no por nombre. El nombre autogenerado del CHECK
-- inline de EDVEX-SUPABASE-SETUP.sql:233 deberia ser 'pagos_monto_check', pero
-- si difiere, un DROP CONSTRAINT IF EXISTS seria un no-op SILENCIOSO y el > 0
-- sobreviviria. Al final se comprueba y se aborta si sobrevive alguno.
-- ESTE ARCHIVO ES EL UNICO DUENO DEL CONSTRAINT. PR 1 no lo toca.

DO $monto$
DECLARE c record; n integer := 0;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_catalog.pg_constraint con
     WHERE con.conrelid = 'public.pagos'::regclass
       AND con.contype  = 'c'
       AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%monto%'
       AND pg_catalog.pg_get_constraintdef(con.oid) LIKE  '%>%'
       AND pg_catalog.pg_get_constraintdef(con.oid) NOT LIKE '%>=%'
  LOOP
    EXECUTE format('ALTER TABLE public.pagos DROP CONSTRAINT %I', c.conname);
    n := n + 1;
    RAISE NOTICE 'CHECK de monto eliminado: %', c.conname;
  END LOOP;
  RAISE NOTICE 'Total CHECKs de monto (> 0) eliminados: %', n;
END
$monto$;

ALTER TABLE public.pagos
  DROP CONSTRAINT IF EXISTS pagos_monto_no_negativo;
ALTER TABLE public.pagos
  ADD  CONSTRAINT pagos_monto_no_negativo CHECK (monto >= 0);

-- Guarda dura: si algo con "monto > " sigue vivo, ABORTAR aqui y no seguir.
DO $verif_monto$
DECLARE v_sobrevive text;
BEGIN
  SELECT string_agg(con.conname, ', ')
    INTO v_sobrevive
    FROM pg_catalog.pg_constraint con
   WHERE con.conrelid = 'public.pagos'::regclass
     AND con.contype  = 'c'
     AND pg_catalog.pg_get_constraintdef(con.oid) ILIKE '%monto%'
     AND pg_catalog.pg_get_constraintdef(con.oid) LIKE  '%>%'
     AND pg_catalog.pg_get_constraintdef(con.oid) NOT LIKE '%>=%';
  IF v_sobrevive IS NOT NULL THEN
    RAISE EXCEPTION
      'Sobrevive un CHECK monto > 0 (%). El cupon 100%% seguiria fallando. Abortando.',
      v_sobrevive;
  END IF;
END
$verif_monto$;

COMMENT ON CONSTRAINT pagos_monto_no_negativo ON public.pagos IS
  'monto >= 0 (no > 0): Stripe entrega amount_total = 0 en cupones del 100% y '
  'precios de cortesia. Con la RPC transaccional un CHECK > 0 abortaria el pago '
  'entero y el evento nunca podria aplicarse. Los negativos siguen prohibidos. '
  'Dueno unico del constraint: migration-control-escolar-00. PR 1 no lo toca.';


-- =============================================================================
-- SECCION 0b — pagos.meses_cubiertos
-- =============================================================================
-- Se crea AQUI, no en PR 1, porque aplicar_pago_stripe la escribe desde el
-- primer evento. PR 1 la repite con IF NOT EXISTS (no-op) para que cada archivo
-- siga siendo aplicable por separado.
--
-- NULLABLE y SIN DEFAULT, a proposito:
--   * un DEFAULT 1 mentiria sobre inscripcion y certificacion (cubren 0 meses);
--   * un DEFAULT 1 haria que los pagos de modulo ACELERADO quedaran en 1 si
--     algun escritor no la nombrara → estado de cuenta marcaria morosos falsos;
--   * NULL significa honestamente "este escritor no lo declaro" y deja que la
--     heuristica de PR 1 decida.
-- Ningun escritor existente la nombra ⇒ la columna no puede romper ningun INSERT.
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS meses_cubiertos INTEGER;

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_meses_cubiertos_check;
ALTER TABLE public.pagos
  ADD  CONSTRAINT pagos_meses_cubiertos_check
  CHECK (meses_cubiertos IS NULL OR meses_cubiertos >= 0);
-- Se admite 0 (no > 0) para que inscripcion/certificacion declaren "cubre 0 meses".

COMMENT ON COLUMN public.pagos.meses_cubiertos IS
  'Meses de plan que cubre este pago, declarado por el escritor. '
  '0 = inscripcion/certificacion; 1 = modulo estandar o desbloquear_mes; '
  '2 = modulo acelerado. NULL = escritor que no lo declara (los 2 jobs pg_cron). '
  'NO tiene DEFAULT: un DEFAULT 1 mentiria sobre inscripcion y certificacion.';


-- =============================================================================
-- SECCION 1 — public.aplicar_pago_stripe(...)
-- =============================================================================
-- FIRMA CONGELADA. El webhook TS llama EXACTAMENTE con estas 6 claves:
--   p_alumno_id, p_tipo, p_monto, p_stripe_session_id,
--   p_modulo_numero, p_incremento_meses
-- NO existe p_concepto: el vocabulario de `concepto` se deriva AQUI para que no
-- pueda divergir entre el webhook y la captura manual del PR 3.
--
-- RETURNS jsonb (no parametros OUT): un unico objeto, sin ambiguedad sobre si
-- PostgREST entrega registro u array. El TS desenvuelve por si acaso.
--
-- DROP previo con firma exacta: CREATE OR REPLACE no puede cambiar el tipo de
-- retorno (42P13). Aplicar fuera de hora pico: hay una ventana de milisegundos
-- sin funcion (cubierta de todos modos por el reintento de Stripe, ya que el TS
-- clasifica 42883 como transitorio).
DROP FUNCTION IF EXISTS public.aplicar_pago_stripe(uuid, text, numeric, text, integer, integer);

CREATE FUNCTION public.aplicar_pago_stripe(
    p_alumno_id          uuid,
    p_tipo               text,                       -- 'inscripcion'|'certificacion'|'modulo'
    p_monto              numeric,                    -- USD, ya dividido entre 100
    p_stripe_session_id  text,                       -- ANCLA DE IDEMPOTENCIA
    p_modulo_numero      integer DEFAULT NULL,       -- 1..6, solo si p_tipo='modulo'
    p_incremento_meses   integer DEFAULT NULL        -- 1 estandar | 2 acelerado
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
-- SECURITY DEFINER: hoy la llama service_role (que ya bypassa RLS), pero se
-- declara DEFINER por consistencia con desbloquear_mes. Precio: hay que blindar
-- search_path y revocar EXECUTE. Ambas cosas estan hechas (SECCION 2), y el
-- OWNER se fija explicitamente (si el owner no fuera el de la tabla, la RLS de
-- pagos se evaluaria y todo INSERT fallaria con 42501).
--
-- SET search_path = '': ningun identificador se resuelve por busqueda; ni
-- siquiera pg_temp puede secuestrar un nombre. pg_catalog se busca siempre de
-- forma implicita, asi que tipos y nodos del parser (COALESCE, CASE) funcionan.
DECLARE
    v_meses_actuales   integer;
    v_modulos_actuales jsonb;
    v_concepto         text;
    v_incremento       integer;
    v_meses_cubiertos  integer;
    v_pago_id          uuid;
BEGIN
    -- ---------------------------------------------------------------------
    -- 1. VALIDACION DE ENTRADA (fail fast). EXCEPTION, no estado de negocio:
    --    esto es un bug del llamador y debe explotar ruidosamente.
    -- ---------------------------------------------------------------------
    IF p_alumno_id IS NULL THEN
        RAISE EXCEPTION 'p_alumno_id es obligatorio' USING ERRCODE = '22023';
    END IF;

    IF p_stripe_session_id IS NULL OR pg_catalog.length(p_stripe_session_id) = 0 THEN
        RAISE EXCEPTION 'p_stripe_session_id es obligatorio (ancla de idempotencia)'
              USING ERRCODE = '22023';
    END IF;

    IF p_monto IS NULL OR p_monto < 0 THEN
        RAISE EXCEPTION 'p_monto invalido: %', p_monto USING ERRCODE = '22023';
    END IF;

    IF p_tipo IS NULL OR p_tipo NOT IN ('inscripcion', 'certificacion', 'modulo') THEN
        RAISE EXCEPTION 'p_tipo invalido: % (esperado inscripcion|certificacion|modulo)', p_tipo
              USING ERRCODE = '22023';
    END IF;

    IF p_tipo = 'modulo' THEN
        IF p_modulo_numero IS NULL OR p_modulo_numero < 1 OR p_modulo_numero > 6 THEN
            RAISE EXCEPTION 'p_modulo_numero fuera de rango (1-6): %', p_modulo_numero
                  USING ERRCODE = '22023';
        END IF;
        IF p_incremento_meses IS NULL OR p_incremento_meses NOT IN (1, 2) THEN
            RAISE EXCEPTION 'p_incremento_meses debe ser 1 (estandar) o 2 (acelerado): %',
                  p_incremento_meses USING ERRCODE = '22023';
        END IF;
        v_incremento      := p_incremento_meses;
        v_meses_cubiertos := p_incremento_meses;
        -- VOCABULARIO DE `concepto`: EXACTAMENTE el de webhook/route.ts:146,
        -- acentos y minusculas incluidos. Cambiar una letra rompe el historico
        -- y el clasificador de PR 1.
        v_concepto := 'Módulo ' || p_modulo_numero::text || ' ('
                      || CASE WHEN p_incremento_meses = 2 THEN 'acelerado' ELSE 'estándar' END
                      || ')';
    ELSIF p_tipo = 'inscripcion' THEN
        v_incremento      := 0;
        v_meses_cubiertos := 0;
        v_concepto        := 'Inscripción';   -- webhook/route.ts:77
    ELSE
        v_incremento      := 0;
        v_meses_cubiertos := 0;
        v_concepto        := 'Certificación'; -- webhook/route.ts:97
    END IF;

    -- ---------------------------------------------------------------------
    -- 2. LOCK DE alumnos ANTES del INSERT
    --    (a) orden de bloqueo consistente (alumnos → pagos), identico al de
    --        desbloquear_mes ⇒ no hay deadlock cruzado;
    --    (b) si el alumno no existe, salimos SIN quemar el stripe_session_id
    --        (que es de un solo uso por el UNIQUE): un reintento posterior, ya
    --        con el alumno creado, si podra aplicarse.
    --    El FOR UPDATE serializa eventos concurrentes DISTINTOS del mismo
    --    alumno: el segundo espera al COMMIT del primero.
    -- ---------------------------------------------------------------------
    SELECT a.meses_desbloqueados, a.modulos_desbloqueados
      INTO v_meses_actuales, v_modulos_actuales
      FROM public.alumnos a
     WHERE a.id = p_alumno_id
       FOR UPDATE;

    IF NOT FOUND THEN
        -- Estado de negocio, NO excepcion: la app debe poder distinguirlo para
        -- decidir el HTTP status y emitir una alerta accionable.
        RETURN jsonb_build_object(
            'resultado',             'alumno_no_encontrado',
            'meses_desbloqueados',   NULL,
            'modulos_desbloqueados', NULL,
            'pago_id',               NULL
        );
    END IF;

    -- ---------------------------------------------------------------------
    -- 3. INSERT IDEMPOTENTE — unica fuente de verdad sobre "ya se aplico".
    --    ON CONFLICT (stripe_session_id) DO NOTHING se apoya en el UNIQUE
    --    pagos_stripe_session_id_key (migration-pagos-stripe.sql:9-10).
    --    El efecto sobre alumnos se decide por si el INSERT realmente inserto,
    --    NO por una lectura previa: decision del motor bajo indice unico, sin
    --    ventana TOCTOU.
    --
    --    Columnas NO escritas a proposito:
    --      mes_desbloqueado → NULL (territorio de desbloquear_mes/captura manual)
    --      registrado_por   → NULL (no hay actor humano; auth.uid() es NULL)
    --      fecha_pago       → aun no existe; cuando PR 1 la anada con DEFAULT
    --                         CURRENT_DATE, este INSERT la rellena solo.
    -- ---------------------------------------------------------------------
    INSERT INTO public.pagos (
        alumno_id, monto, metodo_pago, concepto, stripe_session_id, meses_cubiertos
    )
    VALUES (
        p_alumno_id, p_monto, 'stripe', v_concepto, p_stripe_session_id, v_meses_cubiertos
    )
    ON CONFLICT (stripe_session_id) DO NOTHING
    RETURNING id INTO v_pago_id;

    IF v_pago_id IS NULL THEN
        -- Ya aplicado antes (o por una transaccion concurrente que commiteo
        -- primero). NO se toca alumnos: este es exactamente el punto donde hoy
        -- se duplica meses_desbloqueados.
        -- Matiz: si la ganadora aun no commiteo, ON CONFLICT nos hace ESPERAR
        -- a su commit/rollback. Si hizo rollback, insertamos nosotros. En ambos
        -- casos el resultado es exactamente-una-vez.
        RETURN jsonb_build_object(
            'resultado',             'duplicado',
            'meses_desbloqueados',   v_meses_actuales,
            'modulos_desbloqueados', v_modulos_actuales,
            'pago_id',               NULL
        );
    END IF;

    -- ---------------------------------------------------------------------
    -- 4. EFECTO SOBRE alumnos — solo se llega aqui si el INSERT inserto.
    -- ---------------------------------------------------------------------
    IF p_tipo = 'inscripcion' THEN
        -- Asignacion de constantes (idempotente por naturaleza). NO desbloquea
        -- meses: el alumno debe comprar su primer modulo para abrir Mes 1
        -- (regla documentada en webhook/route.ts:61-63).
        UPDATE public.alumnos
           SET inscripcion_pagada = true,
               demo_activa        = false
         WHERE id = p_alumno_id;

    ELSIF p_tipo = 'certificacion' THEN
        UPDATE public.alumnos
           SET certificacion_pagada = true
         WHERE id = p_alumno_id;

    ELSE  -- 'modulo'
        -- meses_desbloqueados: incremento EN SQL sobre la fila bloqueada, nunca
        -- un literal calculado en Node.
        -- modulos_desbloqueados: merge deduplicado y ordenado (webhook:126-128),
        -- hecho en SQL para que el array quede canonico. El CASE sobre
        -- jsonb_typeof protege contra filas donde la columna no sea un array.
        -- NOTA: COALESCE va SIN cualificar. Es un nodo del parser, no una
        -- funcion de pg_catalog: 'pg_catalog.coalesce(...)' produce
        -- 42883 en ejecucion aunque el CREATE FUNCTION tenga exito.
        UPDATE public.alumnos a
           SET meses_desbloqueados   = a.meses_desbloqueados + v_incremento,
               modulos_desbloqueados = (
                   SELECT COALESCE(
                              pg_catalog.jsonb_agg(u.n ORDER BY u.n),
                              '[]'::jsonb
                          )
                     FROM (
                          SELECT e.valor::integer AS n
                            FROM pg_catalog.jsonb_array_elements_text(
                                     CASE
                                       WHEN pg_catalog.jsonb_typeof(a.modulos_desbloqueados) = 'array'
                                       THEN a.modulos_desbloqueados
                                       ELSE '[]'::jsonb
                                     END
                                 ) AS e(valor)
                           UNION
                          SELECT p_modulo_numero
                     ) AS u
               )
         WHERE a.id = p_alumno_id;
    END IF;

    -- Estado final real, para que la app pueda loguearlo sin round-trip extra.
    SELECT a.meses_desbloqueados, a.modulos_desbloqueados
      INTO v_meses_actuales, v_modulos_actuales
      FROM public.alumnos a
     WHERE a.id = p_alumno_id;

    RETURN jsonb_build_object(
        'resultado',             'aplicado',
        'meses_desbloqueados',   v_meses_actuales,
        'modulos_desbloqueados', v_modulos_actuales,
        'pago_id',               v_pago_id
    );
END;
$fn$;

-- OWNER explicito: SECURITY DEFINER ejecuta con los privilegios del owner. Si
-- el script se aplicara con un rol distinto al owner de public.pagos, la RLS
-- (pagos_insert WITH CHECK (public.is_admin()), EDVEX-SUPABASE-SETUP.sql:491)
-- se evaluaria, auth.uid() seria NULL y TODO INSERT fallaria con 42501.
ALTER FUNCTION public.aplicar_pago_stripe(uuid, text, numeric, text, integer, integer)
  OWNER TO postgres;

COMMENT ON FUNCTION public.aplicar_pago_stripe(uuid, text, numeric, text, integer, integer) IS
  'PR 0 — Aplica un checkout.session.completed de Stripe de forma atomica e '
  'idempotente. Idempotencia anclada en pagos.stripe_session_id (UNIQUE) via '
  'ON CONFLICT DO NOTHING: si no inserta, no toca alumnos y devuelve "duplicado". '
  'Serializa eventos concurrentes con SELECT ... FOR UPDATE sobre alumnos. '
  'Devuelve jsonb {resultado, meses_desbloqueados, modulos_desbloqueados, pago_id} '
  'con resultado in (aplicado, duplicado, alumno_no_encontrado). Solo service_role.';


-- =============================================================================
-- SECCION 2 — PERMISOS
-- =============================================================================
-- POR QUE NO BASTA "REVOKE ... FROM PUBLIC":
-- Supabase ejecuta en el bootstrap
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
--     TO anon, authenticated, service_role;
-- ⇒ cada funcion nueva en public nace con TRES ACL NOMINALES ademas del PUBLIC
-- implicito. Los privilegios son la UNION de todas las concesiones: revocar
-- solo a PUBLIC deja la funcion igual de abierta. Hay que nombrar a los tres y
-- re-otorgar a service_role.
REVOKE EXECUTE ON FUNCTION public.aplicar_pago_stripe(uuid, text, numeric, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.aplicar_pago_stripe(uuid, text, numeric, text, integer, integer)
  TO service_role;

-- -----------------------------------------------------------------------------
-- BLINDAJE DE public.desbloquear_mes  (se hace AQUI, en PR 0, no mas tarde)
-- -----------------------------------------------------------------------------
-- desbloquear_mes es SECURITY DEFINER, no valida quien la llama, y por las
-- default privileges de Supabase tiene EXECUTE nominal para anon/authenticated:
-- cualquier alumno autenticado puede regalarse meses de plan de pago. Es el
-- unico agujero abierto que mueve dinero.
--
-- Se descarta la premisa que lo difería: "un CREATE OR REPLACE resetea los
-- privilegios al default de Supabase" es FALSO. CREATE OR REPLACE reutiliza la
-- misma fila de pg_proc (mismo OID) y CONSERVA owner y proacl; ALTER DEFAULT
-- PRIVILEGES solo actua sobre objetos CREADOS. Por tanto este REVOKE sobrevive
-- al CREATE OR REPLACE de la SECCION 4 de este entregable.
--
-- VERIFICADO que no rompe nada: el unico llamador es
-- src/app/api/admin/alumnos/[id]/desbloquear-mes/route.ts:29, con
-- createAdminClient() (service_role). NO generalizar el patron:
-- recalcular_calificacion se invoca en
-- src/app/api/alumno/evaluacion/[id]/enviar/route.ts:149 con el cliente de
-- SESION (rol authenticated); revocarle EXECUTE romperia el envio de
-- evaluaciones.
REVOKE EXECUTE ON FUNCTION public.desbloquear_mes(uuid, numeric, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.desbloquear_mes(uuid, numeric, text, text, uuid)
  TO service_role;

RESET lock_timeout;

-- =============================================================================
-- FIN DEL DDL EJECUTABLE. Todo lo que sigue esta COMENTADO a proposito.
-- =============================================================================


-- =============================================================================
-- VERIFICACION — copiar y ejecutar EN UNA SESION APARTE, consulta por consulta
-- =============================================================================
--
-- V1 — Funcion, DEFINER, search_path blindado y OWNER correcto.
--      Esperado: prosecdef = t | proconfig = {search_path=""} | owner = postgres
-- SELECT p.proname,
--        p.prosecdef                                          AS es_security_definer,
--        p.proconfig                                          AS config,
--        p.proowner::regrole                                  AS owner,
--        pg_catalog.pg_get_function_identity_arguments(p.oid)  AS firma,
--        pg_catalog.pg_get_function_result(p.oid)              AS retorna
--   FROM pg_catalog.pg_proc p
--   JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'aplicar_pago_stripe';
--
-- V2 — Permisos efectivos. NOTA: has_function_privilege('PUBLIC', ...) NO se
--      usa: el primer argumento se resuelve como nombre de rol real y es
--      case-sensitive, asi que 'PUBLIC' da 42704 y aborta la consulta entera.
--      PUBLIC se comprueba leyendo el ACL: no debe haber ninguna entrada "=X/".
--      Esperado: anon=f | authenticated=f | service_role=t
--                proacl = {postgres=X/postgres,service_role=X/postgres}
-- SELECT pg_catalog.has_function_privilege('anon',
--          'public.aplicar_pago_stripe(uuid,text,numeric,text,integer,integer)','EXECUTE') AS anon,
--        pg_catalog.has_function_privilege('authenticated',
--          'public.aplicar_pago_stripe(uuid,text,numeric,text,integer,integer)','EXECUTE') AS authenticated,
--        pg_catalog.has_function_privilege('service_role',
--          'public.aplicar_pago_stripe(uuid,text,numeric,text,integer,integer)','EXECUTE') AS service_role,
--        (SELECT p.proacl FROM pg_catalog.pg_proc p
--           JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
--          WHERE n.nspname='public' AND p.proname='aplicar_pago_stripe') AS proacl;
--
-- V2b — desbloquear_mes blindada. Esperado: f | f | t
-- SELECT pg_catalog.has_function_privilege('anon',
--          'public.desbloquear_mes(uuid,numeric,text,text,uuid)','EXECUTE') AS anon,
--        pg_catalog.has_function_privilege('authenticated',
--          'public.desbloquear_mes(uuid,numeric,text,text,uuid)','EXECUTE') AS authenticated,
--        pg_catalog.has_function_privilege('service_role',
--          'public.desbloquear_mes(uuid,numeric,text,text,uuid)','EXECUTE') AS service_role;
--
-- V3 — CHECKs de pagos. Esperado: EXACTAMENTE UNO sobre monto, con >= 0,
--      llamado pagos_monto_no_negativo. Ningun otro con "monto >".
-- SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definicion
--   FROM pg_catalog.pg_constraint
--  WHERE conrelid = 'public.pagos'::regclass AND contype = 'c'
--  ORDER BY conname;
--
-- V3b — Esperado: 0
-- SELECT pg_catalog.count(*) AS filas_negativas FROM public.pagos WHERE monto < 0;
--
-- V3c — meses_cubiertos creada correctamente.
--      Esperado: meses_cubiertos | integer | YES | (null)
--      (NULLABLE y SIN DEFAULT. Si aparece "NO | 1", alguien aplico la variante
--       descartada: revisar, porque los pagos acelerados quedarian en 1.)
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='pagos' AND column_name='meses_cubiertos';
--
-- V4 — PRECONDICIONES NO VERIFICADAS DESDE EL REPO. Ejecutar ANTES de dar el OK.
--   (a) Ningun trigger propio en pagos que asuma monto > 0 o escriba en alumnos:
-- SELECT tgname FROM pg_catalog.pg_trigger
--  WHERE tgrelid='public.pagos'::regclass AND NOT tgisinternal;   -- esperado: 0 filas
--   (b) modulos_desbloqueados es siempre un array:
-- SELECT DISTINCT pg_catalog.jsonb_typeof(modulos_desbloqueados) FROM public.alumnos;
--                                                                -- esperado: array
--   (c) No hay sobrecargas de aplicar_pago_stripe (PGRST203 por ambiguedad):
-- SELECT pg_catalog.pg_get_function_identity_arguments(p.oid)
--   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='aplicar_pago_stripe';  -- esperado: 1 fila
--   (d) COALESCE cualificado NO existe (confirma el hallazgo corregido):
-- SELECT pg_catalog.coalesce(NULL, 1);   -- esperado: ERROR 42883
--
-- V5 — OBSERVABILIDAD (no bloquea): alumnos con meses por encima de su plan.
--      La funcion NO lo impide a proposito: rechazar un pago YA COBRADO por
--      exceder el plan convierte un problema contable en perdida de dinero.
-- SELECT a.id, a.matricula, a.meses_desbloqueados, pe.duracion_meses
--   FROM public.alumnos a
--   JOIN public.planes_estudio pe ON pe.id = a.plan_estudio_id
--  WHERE a.meses_desbloqueados > pe.duracion_meses;
--
-- V6 — Salud de la idempotencia tras el despliegue. Esperado: 0
-- SELECT pg_catalog.count(*) AS pagos_stripe_sin_session
--   FROM public.pagos WHERE metodo_pago='stripe' AND stripe_session_id IS NULL;
--
-- V7 — Los otros 3 escritores intactos.
-- SELECT pg_catalog.count(*) AS demo      FROM public.pagos WHERE referencia LIKE 'pi\_demo%';
-- SELECT pg_catalog.count(*) AS manuales  FROM public.pagos WHERE mes_desbloqueado IS NOT NULL;


-- =============================================================================
-- PRUEBA EN SECO — EJECUTAR AISLADA, NUNCA junto al DDL.
-- El SQL Editor manda el script como un batch en transaccion implicita: un
-- BEGIN interno solo emite WARNING y el ROLLBACK revertiria TODO lo anterior.
-- Sustituir <ALUMNO_ID> por un alumnos.id real antes de descomentar.
-- =============================================================================
-- BEGIN;
--   -- 1) modulo estandar → aplicado, +1 mes, meses_cubiertos = 1
--   SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'modulo',40.00,'cs_test_0001',3,1);
--   -- 2) MISMA session (reintento de Stripe) → duplicado, meses IDENTICO
--   SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'modulo',40.00,'cs_test_0001',3,1);
--   -- 3) acelerado, session distinta → aplicado, +2 meses, meses_cubiertos = 2
--   SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'modulo',70.00,'cs_test_0002',4,2);
--   -- 4) cupon 100% → aplicado (NO error). Si falla con 23514, el CHECK > 0 sigue vivo.
--   SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'modulo',0,'cs_test_0003',5,1);
--   -- 5) alumno inexistente → alumno_no_encontrado y CERO filas nuevas
--   SELECT public.aplicar_pago_stripe('00000000-0000-0000-0000-000000000000'::uuid,
--                                     'inscripcion',50.00,'cs_test_0004');
--   SELECT pg_catalog.count(*) AS debe_ser_cero
--     FROM public.pagos WHERE stripe_session_id='cs_test_0004';
--   -- 6) vocabulario y columnas
--   SELECT stripe_session_id, concepto, monto, meses_cubiertos,
--          mes_desbloqueado, registrado_por
--     FROM public.pagos WHERE stripe_session_id LIKE 'cs_test_%' ORDER BY 1;
--   -- Esperado: 'Módulo 3 (estándar)'|1, 'Módulo 4 (acelerado)'|2, 'Módulo 5 (estándar)'|1
--   SELECT meses_desbloqueados, modulos_desbloqueados,
--          inscripcion_pagada, certificacion_pagada
--     FROM public.alumnos WHERE id='<ALUMNO_ID>'::uuid;
-- ROLLBACK;   -- IMPRESCINDIBLE
--
-- Validaciones que DEBEN fallar con 22023 (ejecutar una a una):
-- SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'modulo',10,'cs_x',9,1);
-- SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'modulo',10,'cs_x',3,3);
-- SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'otro',10,'cs_x');
-- SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'modulo',-5,'cs_x',3,1);
-- SELECT public.aplicar_pago_stripe('<ALUMNO_ID>'::uuid,'inscripcion',50,NULL);


-- =============================================================================
-- ROLLBACK — EJECUTAR AISLADO. ORDEN OBLIGATORIO.
-- =============================================================================
-- PASO 0 (PRIMERO, SIEMPRE): redesplegar el webhook a la version anterior. Si se
--   borra la funcion con la app nueva viva, todos los eventos daran 42883 →
--   clasificados TRANSITORIOS → 500 → cola de reintentos de 3 dias (recuperable,
--   pero ruidosa).
--
-- PASO 1 — eliminar la funcion. Seguro: no borra ni altera ninguna fila, y los
--   stripe_session_id ya grabados siguen protegiendo contra reprocesamiento.
-- DROP FUNCTION IF EXISTS public.aplicar_pago_stripe(uuid,text,numeric,text,integer,integer);
--
-- PASO 2 (OPCIONAL, normalmente NO HACER) — restaurar el CHECK original.
--   Solo funciona si NO existe ninguna fila con monto = 0. Comprobar antes:
-- SELECT id, alumno_id, concepto, stripe_session_id FROM public.pagos WHERE monto = 0;
--   Si hay filas, NO revertir: obligaria a borrar o falsear pagos reales.
-- ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_monto_no_negativo;
-- ALTER TABLE public.pagos ADD  CONSTRAINT pagos_monto_check CHECK (monto > 0);
--
-- PASO 3 (OPCIONAL) — meses_cubiertos. Es aditiva y nadie mas la nombra:
--   dejarla es inocuo. Solo borrarla si se revierte tambien PR 1.
-- ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_meses_cubiertos_check;
-- ALTER TABLE public.pagos DROP COLUMN IF EXISTS meses_cubiertos;
--
-- NO revertir el REVOKE de desbloquear_mes: reabrirlo es una escalada de
-- privilegios activa y no es necesario para volver al webhook anterior.
-- =============================================================================
