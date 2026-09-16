-- EDVEX — generador semanal: correos con dominio propio (16-sep-2026)
-- Reemplaza SOLO la generación del correo en registrar_alumnos_demo_semanal():
-- de un dominio público aleatorio (gmail/hotmail/...) a nombre.apellido@alumnos.edvexacademy.online.
-- Cada parte del correo: sin acentos ni ñ (TRANSLATE), minúsculas (LOWER) y solo a-z0-9
-- (regexp_replace). Orden de duplicados: nombre.apellido1 -> nombre.apellido2 -> +número 4 dígitos.
-- "Existe" = el correo está en auth.users O en public.usuarios. No toca pagos, is_demo ni autorregistro.
-- Aplicada en producción vía Management API el 16-sep-2026 (job demo-alumnos-semanales sin cambios).

CREATE OR REPLACE FUNCTION public.registrar_alumnos_demo_semanal()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_num_alumnos  INTEGER;
  v_nombre       TEXT;
  v_apellido1    TEXT;
  v_apellido2    TEXT;
  v_nombre_full  TEXT;
  v_email        TEXT;
  v_ln           TEXT;
  v_la1          TEXT;
  v_la2          TEXT;
  v_telefono     TEXT;
  v_matricula    TEXT;
  v_user_id      UUID;
  v_meses        INTEGER;
  v_plan_id      UUID := '75a963ee-3d44-4339-9659-bd807f667773'; -- Plan 6 meses - Acelerado
  v_ladas        TEXT[] := ARRAY['55','33','81','664','686','656','222','442','999','229'];
  v_dominios     TEXT[] := ARRAY['gmail.com','hotmail.com','yahoo.com.mx','outlook.com','icloud.com','live.com.mx'];
  i              INTEGER;
  nombres_h TEXT[] := ARRAY[
    'Carlos','Luis','Juan','Miguel','José','Alejandro','Ricardo','Eduardo',
    'Fernando','Roberto','Daniel','Diego','Andrés','Mario','Héctor',
    'Sergio','Pablo','Iván','Raúl','Omar','Javier','Ernesto','Arturo',
    'Manuel','Gerardo','Rodrigo','Óscar','Víctor','Guillermo','Armando'
  ];
  nombres_m TEXT[] := ARRAY[
    'María','Ana','Laura','Sofía','Valentina','Gabriela','Fernanda','Claudia',
    'Patricia','Alejandra','Mariana','Daniela','Isabel','Verónica','Sandra',
    'Leticia','Rosa','Adriana','Norma','Carmen','Lucía','Paola','Jimena',
    'Brenda','Karla','Vanessa','Mónica','Esperanza','Alicia','Beatriz'
  ];
  apellidos TEXT[] := ARRAY[
    'García','Martínez','López','Hernández','González','Pérez','Rodríguez',
    'Sánchez','Ramírez','Cruz','Flores','Torres','Rivera','Morales','Ortiz',
    'Gutiérrez','Chávez','Ramos','Reyes','Mendoza','Jiménez','Vargas',
    'Castro','Medina','Delgado','Vega','Rojas','Herrera','Domínguez','Ríos',
    'Guerrero','Luna','Aguilar','Salinas','Cervantes','Fuentes','Carrillo'
  ];
  es_hombre BOOLEAN;
  v_created TIMESTAMPTZ;
BEGIN
  v_num_alumnos := 2 + FLOOR(RANDOM() * 2)::INTEGER;

  FOR i IN 1..v_num_alumnos LOOP
    es_hombre := RANDOM() > 0.5;

    IF es_hombre THEN
      v_nombre := nombres_h[(FLOOR(RANDOM() * array_length(nombres_h, 1)) + 1)::INTEGER];
    ELSE
      v_nombre := nombres_m[(FLOOR(RANDOM() * array_length(nombres_m, 1)) + 1)::INTEGER];
    END IF;

    v_apellido1   := apellidos[(FLOOR(RANDOM() * array_length(apellidos, 1)) + 1)::INTEGER];
    v_apellido2   := apellidos[(FLOOR(RANDOM() * array_length(apellidos, 1)) + 1)::INTEGER];
    v_nombre_full := v_nombre || ' ' || v_apellido1 || ' ' || v_apellido2;

    -- Correo con dominio propio @alumnos.edvexacademy.online. Cada parte del correo
    -- (nombre, apellidos): sin acentos ni ñ (TRANSLATE), minúsculas (LOWER) y solo
    -- a-z0-9 (regexp_replace quita espacios, guiones, apóstrofes, etc.).
    v_ln  := regexp_replace(LOWER(TRANSLATE(v_nombre,    'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')), '[^a-z0-9]', '', 'g');
    v_la1 := regexp_replace(LOWER(TRANSLATE(v_apellido1, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')), '[^a-z0-9]', '', 'g');
    v_la2 := regexp_replace(LOWER(TRANSLATE(v_apellido2, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')), '[^a-z0-9]', '', 'g');

    -- Orden: nombre.apellido1 -> si existe, nombre.apellido2 -> si aún, + número 4 dígitos.
    -- "Existe" = el correo está en auth.users O en public.usuarios (los dos).
    v_email := v_ln || '.' || v_la1 || '@alumnos.edvexacademy.online';
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email)
       OR EXISTS (SELECT 1 FROM public.usuarios WHERE email = v_email) THEN
      v_email := v_ln || '.' || v_la2 || '@alumnos.edvexacademy.online';
      WHILE EXISTS (SELECT 1 FROM auth.users WHERE email = v_email)
            OR EXISTS (SELECT 1 FROM public.usuarios WHERE email = v_email) LOOP
        v_email := v_ln || '.' || v_la1 || FLOOR(RANDOM() * 9000 + 1000)::TEXT || '@alumnos.edvexacademy.online';
      END LOOP;
    END IF;

    v_telefono := '+52 ' ||
      v_ladas[(FLOOR(RANDOM() * array_length(v_ladas, 1)) + 1)::INTEGER] || ' ' ||
      LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0') || ' ' ||
      LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

    v_matricula := 'ALU-2026-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    WHILE EXISTS (SELECT 1 FROM alumnos WHERE matricula = v_matricula) LOOP
      v_matricula := 'ALU-2026-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    END LOOP;

    v_meses   := FLOOR(RANDOM() * 2)::INTEGER;
    v_user_id := gen_random_uuid();
    v_created := NOW() - (FLOOR(RANDOM() * 5) || ' days')::INTERVAL;

    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data,
      created_at, updated_at, role, aud
    ) VALUES (
      v_user_id, v_email,
      '$2a$10$demoXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      v_created,
      jsonb_build_object('nombre', v_nombre_full, 'telefono', v_telefono, 'is_demo', true),
      '{"provider":"email","providers":["email"]}'::jsonb,
      v_created, NOW(), 'authenticated', 'authenticated'
    );

    INSERT INTO usuarios (id, email, nombre_completo, rol, activo, created_at)
    VALUES (v_user_id, v_email, v_nombre_full, 'ALUMNO', true, v_created);

    -- AHORA con plan_estudio_id (antes quedaba NULL)
    INSERT INTO alumnos (
      id, usuario_id, matricula, plan_estudio_id, meses_desbloqueados,
      inscripcion_pagada, contactado_whatsapp, demo_activa, telefono, created_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_matricula, v_plan_id, v_meses,
      true, (RANDOM() > 0.6), true, v_telefono, v_created
    );

    IF v_meses >= 1 THEN
      INSERT INTO pagos (
        id, alumno_id, monto, mes_desbloqueado,
        metodo_pago, referencia, created_at, stripe_session_id, concepto
      )
      SELECT gen_random_uuid(), a.id, 50.00, NULL, 'STRIPE',
        'pi_demo_reg_' || REPLACE(v_matricula, '-', '_'),
        v_created,
        'cs_demo_reg_' || REPLACE(v_matricula, '-', '_'),
        'Inscripción'
      FROM alumnos a WHERE a.usuario_id = v_user_id;
    END IF;

  END LOOP;
END;
$function$

