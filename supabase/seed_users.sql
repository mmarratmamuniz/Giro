-- =========================================================================
-- SEED DE USUÁRIOS: ADMINISTRADOR E OPERADOR DE CAIXA
-- =========================================================================

-- 1. Inserir ou atualizar na tabela auth.users (Supabase Auth nativo)
-- Usuário 1: admin@finishbebidas.com (Senha: admin123)
-- Usuário 2: caixa@finishbebidas.com (Senha: caixa123)

DO $$
DECLARE
    v_admin_id UUID := 'a0000000-0000-0000-0000-000000000001';
    v_caixa_id UUID := 'a0000000-0000-0000-0000-000000000002';
    v_admin_pwd TEXT := crypt('admin123', gen_salt('bf'));
    v_caixa_pwd TEXT := crypt('caixa123', gen_salt('bf'));
BEGIN
    -- Inserir / Atualizar Administrador no Auth
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_admin_id,
        'authenticated',
        'authenticated',
        'admin@finishbebidas.com',
        v_admin_pwd,
        now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Administrador","role":"admin"}',
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET encrypted_password = v_admin_pwd,
        raw_user_meta_data = '{"full_name":"Administrador","role":"admin"}';

    -- Inserir / Atualizar Perfil de Administrador
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (v_admin_id, 'admin@finishbebidas.com', 'Administrador', 'admin')
    ON CONFLICT (id) DO UPDATE
    SET role = 'admin', full_name = 'Administrador';

    -- Inserir / Atualizar Operador de Caixa no Auth
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_caixa_id,
        'authenticated',
        'authenticated',
        'caixa@finishbebidas.com',
        v_caixa_pwd,
        now(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Operador de Caixa","role":"operator"}',
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET encrypted_password = v_caixa_pwd,
        raw_user_meta_data = '{"full_name":"Operador de Caixa","role":"operator"}';

    -- Inserir / Atualizar Perfil de Operador
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (v_caixa_id, 'caixa@finishbebidas.com', 'Operador de Caixa', 'operator')
    ON CONFLICT (id) DO UPDATE
    SET role = 'operator', full_name = 'Operador de Caixa';

END $$;
