-- =========================================================================
-- FUNÇÃO RPC PARA EXCLUSÃO DE USUÁRIOS COM SEGURANÇA (SECURITY DEFINER)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.delete_user_by_admin(
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_target_email TEXT;
BEGIN
    -- 1. Obter email do usuário
    SELECT email INTO v_target_email FROM auth.users WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado.';
    END IF;

    -- 2. Proteção: Impedir que o ADM Geral (munizsheik08@gmail.com) seja excluído acidentalmente
    IF v_target_email = 'munizsheik08@gmail.com' THEN
        RAISE EXCEPTION 'Não é permitido excluir a conta do Administrador Geral!';
    END IF;

    -- 3. Deletar do perfil
    DELETE FROM public.profiles WHERE id = p_user_id;

    -- 4. Deletar do auth.users (cascateia as sessões)
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_user_id', p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
