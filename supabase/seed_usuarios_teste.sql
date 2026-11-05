-- =========================================================================
-- GIRO - SEED DE USUÁRIOS DE TESTE COM HIERARQUIA COMPLETA (SEM CONFIRMAÇÃO)
-- Execute este script no SQL Editor do Supabase Giro
-- Senha de todos os usuários de teste: 123456
-- =========================================================================

-- 1. ATIVAR TRIGGER DE AUTO-CONFIRMAÇÃO (Para que novos cadastros nunca exijam e-mail real)
CREATE OR REPLACE FUNCTION public.auto_confirm_new_users()
RETURNS TRIGGER AS $$
BEGIN
    NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_confirm_new_users ON auth.users;
CREATE TRIGGER trigger_auto_confirm_new_users
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_confirm_new_users();

-- 2. CONFIRMAR TODOS OS USUÁRIOS EXISTENTES
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL;

-- 3. REPARAR QUALQUER IDENTIDADE FALTANTE EM AUTH.IDENTITIES (Evita "Database error querying schema")
INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT 
    u.id::text, 
    u.id, 
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.email)), 
    'email', 
    now(), 
    now(), 
    now()
FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM auth.identities)
ON CONFLICT (provider, id) DO NOTHING;
