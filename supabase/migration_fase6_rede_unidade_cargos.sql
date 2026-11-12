-- =========================================================================
-- MIGRAÇÃO FASE 6: ESTRUTURA 3 NÍVEIS (REDE -> UNIDADE -> CAIXA) & CARGOS SIMPLIFICADOS
-- EDIÇÃO COMPLETA DE ESTRUTURA E USUÁRIOS COM PRESERVAÇÃO DE HISTÓRICO
-- =========================================================================

-- 1. ESTRUTURA REDE -> UNIDADE -> CAIXA (TABELA BRANCHES COMO UNIDADES)
-- Tornar unit_id opcional na tabela branches (as branches passam a ser as Unidades diretas da Rede)
ALTER TABLE public.branches ALTER COLUMN unit_id DROP NOT NULL;

-- Migração de unidades regionais antigas para a tabela de branches/unidades se ainda não existirem
INSERT INTO public.branches (id, network_id, name, location, is_active, created_at)
SELECT u.id, u.network_id, u.name, 'Unidade Regional', true, COALESCE(u.created_at, now())
FROM public.units u
WHERE NOT EXISTS (
    SELECT 1 FROM public.branches b 
    WHERE b.id = u.id OR (b.network_id = u.network_id AND lower(trim(b.name)) = lower(trim(u.name)))
)
ON CONFLICT (id) DO NOTHING;

-- Garantir que toda Unidade (branch) possua ao menos um terminal 'Caixa 01'
INSERT INTO public.cash_desks (branch_id, name, code, is_active)
SELECT b.id, 'Caixa 01', 'CX-01', true
FROM public.branches b
WHERE NOT EXISTS (
    SELECT 1 FROM public.cash_desks cd WHERE cd.branch_id = b.id
);

-- Limpeza de caixas duplicados com o mesmo nome na mesma unidade sem turnos vinculados
DELETE FROM public.cash_desks
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY branch_id, lower(trim(name)) ORDER BY created_at ASC, id ASC) as rn
        FROM public.cash_desks
        WHERE NOT EXISTS (
            SELECT 1 FROM public.cash_shifts cs WHERE cs.cash_desk_id = cash_desks.id
        )
    ) duplicates
    WHERE duplicates.rn > 1
);

-- Saneamento: Preencher network_id de cash_desks a partir de branches
UPDATE public.cash_desks cd
SET network_id = b.network_id
FROM public.branches b
WHERE cd.branch_id = b.id AND cd.network_id IS NULL;

-- 2. SIMPLIFICAÇÃO DE CARGOS E ADIÇÃO DE JOB_TITLE
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Migração de cargos legados (branch_admin e unit_admin -> network_admin) e preenchimento de job_title
UPDATE public.profiles
SET job_title = COALESCE(
    job_title,
    CASE 
        WHEN role IN ('branch_admin', 'unit_admin') THEN 'Gerente de Loja'
        WHEN role = 'network_admin' THEN 'Administrador de Rede'
        WHEN role = 'super_admin' THEN 'Super Admin'
        ELSE 'Operador de Caixa'
    END
);

UPDATE public.profiles
SET role = 'network_admin'
WHERE role IN ('unit_admin', 'branch_admin');

-- Correção de perfis network_admin com job_title indevido
UPDATE public.profiles
SET job_title = 'Administrador de Rede'
WHERE role = 'network_admin' AND (job_title = 'Operador de Caixa' OR job_title IS NULL);

-- 3. POLÍTICA DE SELEÇÃO DE PERFIS ATUALIZADA
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT TO authenticated
USING (
    id = (SELECT auth.uid())
    OR public.current_user_role() = 'super_admin'
    OR (
        public.current_user_role() = 'network_admin'
        AND network_id = public.current_user_network_id()
        AND role <> 'super_admin'
    )
);

-- 4. POLÍTICAS RLS DE UPDATE PARA NETWORKS, BRANCHES E CASH_DESKS & LOGO DE REDE
ALTER TABLE public.networks ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Vincular logos oficiais padrão das redes Grupo OVO e M Bebidas
UPDATE public.networks
SET logo_url = '/logo-grupo-ovo.png'
WHERE name ILIKE '%Grupo OVO%' AND (logo_url IS NULL OR logo_url = '');

UPDATE public.networks
SET logo_url = '/logo-m-bebidas.png'
WHERE name ILIKE '%M Bebidas%' AND (logo_url IS NULL OR logo_url = '');

ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_desks ENABLE ROW LEVEL SECURITY;

-- UPDATE em networks: EXCLUSIVO para super_admin (alteração de nome, cnpj e logo)
DROP POLICY IF EXISTS "networks_update_policy" ON public.networks;
CREATE POLICY "networks_update_policy" ON public.networks
FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
);

-- UPDATE em branches (Unidades)
DROP POLICY IF EXISTS "branches_update_policy" ON public.branches;
CREATE POLICY "branches_update_policy" ON public.branches
FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (
        public.current_user_role() = 'network_admin'
        AND network_id = public.current_user_network_id()
    )
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (
        public.current_user_role() = 'network_admin'
        AND network_id = public.current_user_network_id()
    )
);

-- UPDATE em cash_desks (Caixas)
DROP POLICY IF EXISTS "cash_desks_update_policy" ON public.cash_desks;
CREATE POLICY "cash_desks_update_policy" ON public.cash_desks
FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (
        public.current_user_role() = 'network_admin'
        AND EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = cash_desks.branch_id
              AND b.network_id = public.current_user_network_id()
        )
    )
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (
        public.current_user_role() = 'network_admin'
        AND EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = cash_desks.branch_id
              AND b.network_id = public.current_user_network_id()
        )
    )
);

-- 5. RPC: ADMIN_CONFIGURE_NEW_USER COM SUPORTE A JOB_TITLE E CARGOS SIMPLIFICADOS
CREATE OR REPLACE FUNCTION public.admin_configure_new_user(
    p_user_id UUID,
    p_full_name TEXT,
    p_role TEXT,
    p_network_id UUID DEFAULT NULL,
    p_unit_id UUID DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_job_title TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_net UUID;
    v_caller_branch UUID;
    v_target_role TEXT;
    v_target_net UUID;
    v_target_branch UUID;
    v_job_title TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado.';
    END IF;

    SELECT role, network_id, branch_id
    INTO v_caller_role, v_caller_net, v_caller_branch
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('super_admin', 'network_admin') THEN
        RAISE EXCEPTION 'Permissão negada: apenas administradores podem configurar novos usuários.';
    END IF;

    v_target_role := p_role;
    IF v_target_role NOT IN ('super_admin', 'network_admin', 'cashier_operator') THEN
        RAISE EXCEPTION 'Cargo inválido. Cargos permitidos: super_admin, network_admin, cashier_operator.';
    END IF;

    -- Regras de escopo por nível de administrador
    IF v_caller_role = 'network_admin' THEN
        IF v_target_role = 'super_admin' THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de rede não pode criar super_admin.';
        END IF;

        IF p_network_id IS NOT NULL AND p_network_id <> v_caller_net THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de rede só pode vincular usuários à sua própria rede.';
        END IF;

        v_target_net := v_caller_net;

        IF p_branch_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.branches b WHERE b.id = p_branch_id AND b.network_id = v_caller_net
        ) THEN
            RAISE EXCEPTION 'Permissão negada: A unidade selecionada não pertence à sua rede.';
        END IF;

        v_target_branch := p_branch_id;
    ELSE
        -- super_admin pode escolher qualquer rede e unidade
        v_target_net := p_network_id;
        v_target_branch := p_branch_id;
        IF v_target_branch IS NOT NULL AND v_target_net IS NULL THEN
            SELECT network_id INTO v_target_net FROM public.branches WHERE id = v_target_branch;
        END IF;
    END IF;

    -- Se for operador de caixa, a unidade é obrigatória
    IF v_target_role = 'cashier_operator' AND v_target_branch IS NULL THEN
        RAISE EXCEPTION 'A unidade de atendimento é obrigatória para operadores de caixa.';
    END IF;

    -- Definição de job_title padrão caso não informado
    v_job_title := COALESCE(
        NULLIF(TRIM(p_job_title), ''),
        CASE 
            WHEN v_target_role = 'network_admin' THEN 'Administrador de Rede'
            WHEN v_target_role = 'super_admin' THEN 'Super Admin'
            ELSE 'Operador de Caixa'
        END
    );

    -- Confirmação imediata do e-mail do usuário recém-criado em auth.users
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = p_user_id;

    -- Atualização ou inserção no perfil
    INSERT INTO public.profiles (
        id,
        full_name,
        role,
        job_title,
        network_id,
        unit_id,
        branch_id,
        updated_at
    ) VALUES (
        p_user_id,
        p_full_name,
        v_target_role,
        v_job_title,
        v_target_net,
        NULL,
        v_target_branch,
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        job_title = EXCLUDED.job_title,
        network_id = EXCLUDED.network_id,
        unit_id = NULL,
        branch_id = EXCLUDED.branch_id,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', v_target_role,
        'job_title', v_job_title,
        'network_id', v_target_net,
        'branch_id', v_target_branch
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.admin_configure_new_user FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_configure_new_user TO authenticated;

-- 6. NOVA RPC: ADMIN_UPDATE_USER (EDIÇÃO COMPLETA DE USUÁRIOS E SENHA)
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_user_id UUID,
    p_full_name TEXT,
    p_role TEXT,
    p_network_id UUID DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_job_title TEXT DEFAULT NULL,
    p_new_password TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_net UUID;
    v_target_profile public.profiles%ROWTYPE;
    v_new_role TEXT;
    v_new_net UUID;
    v_new_branch UUID;
    v_job_title TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado.';
    END IF;

    SELECT role, network_id INTO v_caller_role, v_caller_net
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('super_admin', 'network_admin') THEN
        RAISE EXCEPTION 'Permissão negada: apenas administradores podem atualizar usuários.';
    END IF;

    SELECT * INTO v_target_profile
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado.';
    END IF;

    v_new_role := p_role;
    IF v_new_role NOT IN ('super_admin', 'network_admin', 'cashier_operator') THEN
        RAISE EXCEPTION 'Cargo inválido. Cargos permitidos: super_admin, network_admin, cashier_operator.';
    END IF;

    -- Regras de validação para network_admin
    IF v_caller_role = 'network_admin' THEN
        -- Não pode gerenciar super_admin nem promover a super_admin
        IF v_target_profile.role = 'super_admin' OR v_new_role = 'super_admin' THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de rede não pode gerenciar contas super_admin.';
        END IF;

        -- Usuário alvo deve pertencer à mesma rede
        IF v_target_profile.network_id IS DISTINCT FROM v_caller_net THEN
            RAISE EXCEPTION 'Permissão negada: Usuário pertence a outra rede.';
        END IF;

        -- Não pode transferir usuário para outra rede
        v_new_net := v_caller_net;

        -- Não pode alterar seu próprio role
        IF v_caller_id = p_user_id AND v_target_profile.role IS DISTINCT FROM v_new_role THEN
            RAISE EXCEPTION 'Permissão negada: Você não pode alterar o seu próprio cargo.';
        END IF;

        -- Se informou branch, validar se pertence à rede
        IF p_branch_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.branches b WHERE b.id = p_branch_id AND b.network_id = v_caller_net
        ) THEN
            RAISE EXCEPTION 'Permissão negada: A unidade selecionada não pertence à sua rede.';
        END IF;

        v_new_branch := p_branch_id;
    ELSE
        -- super_admin pode alterar qualquer rede e unidade
        v_new_net := p_network_id;
        v_new_branch := p_branch_id;
        IF v_new_branch IS NOT NULL AND v_new_net IS NULL THEN
            SELECT network_id INTO v_new_net FROM public.branches WHERE id = v_new_branch;
        END IF;
    END IF;

    -- Se for operador de caixa, a unidade é obrigatória
    IF v_new_role = 'cashier_operator' AND v_new_branch IS NULL THEN
        RAISE EXCEPTION 'A unidade de atendimento é obrigatória para operadores de caixa.';
    END IF;

    -- Se for network_admin sem unidade especificada, branch_id fica NULL (acesso global na rede)
    IF v_new_role = 'network_admin' AND v_new_branch IS NULL THEN
        v_new_branch := NULL;
    END IF;

    -- Job title padrão
    v_job_title := COALESCE(
        NULLIF(TRIM(p_job_title), ''),
        CASE 
            WHEN v_new_role = 'super_admin' THEN 'Super Admin'
            WHEN v_new_role = 'network_admin' THEN 'Administrador de Rede'
            ELSE 'Operador de Caixa'
        END
    );

    -- Atualização em public.profiles
    UPDATE public.profiles
    SET full_name = TRIM(p_full_name),
        role = v_new_role,
        job_title = v_job_title,
        network_id = v_new_net,
        unit_id = NULL,
        branch_id = v_new_branch,
        updated_at = now()
    WHERE id = p_user_id;

    -- Atualização de senha opcional se fornecida
    IF p_new_password IS NOT NULL AND length(trim(p_new_password)) >= 6 THEN
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
            updated_at = now()
        WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'full_name', TRIM(p_full_name),
        'role', v_new_role,
        'job_title', v_job_title,
        'network_id', v_new_net,
        'branch_id', v_new_branch,
        'password_updated', (p_new_password IS NOT NULL AND length(trim(p_new_password)) >= 6)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.admin_update_user FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user TO authenticated;

-- 7. RPC: ADMIN_DELETE_USER COM PRESERVAÇÃO INTEGRAL DE HISTÓRICO
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_net UUID;
    v_target_profile public.profiles%ROWTYPE;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado.';
    END IF;

    IF v_caller_id = p_user_id THEN
        RAISE EXCEPTION 'Auto-exclusão proibida: você não pode deletar a sua própria conta.';
    END IF;

    SELECT role, network_id INTO v_caller_role, v_caller_net
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('super_admin', 'network_admin') THEN
        RAISE EXCEPTION 'Permissão negada: apenas administradores podem excluir usuários.';
    END IF;

    SELECT * INTO v_target_profile FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado.';
    END IF;

    IF v_target_profile.role = 'super_admin' THEN
        RAISE EXCEPTION 'Permissão negada: contas super_admin não podem ser excluídas por esta via.';
    END IF;

    IF v_caller_role = 'network_admin' THEN
        IF v_target_profile.network_id IS DISTINCT FROM v_caller_net THEN
            RAISE EXCEPTION 'Permissão negada: Usuário pertence a outra rede.';
        END IF;
    END IF;

    -- PRESERVAÇÃO DE HISTÓRICO: define user_id = NULL nas tabelas operacionais
    UPDATE public.sales SET user_id = NULL WHERE user_id = p_user_id;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'canceled_by') THEN
        UPDATE public.sales SET canceled_by = NULL WHERE canceled_by = p_user_id;
    END IF;

    UPDATE public.cash_shifts SET user_id = NULL WHERE user_id = p_user_id;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_shifts' AND column_name = 'closed_by_user_id') THEN
        UPDATE public.cash_shifts SET closed_by_user_id = NULL WHERE closed_by_user_id = p_user_id;
    END IF;

    UPDATE public.cash_transactions SET user_id = NULL WHERE user_id = p_user_id;
    UPDATE public.purchases SET user_id = NULL WHERE user_id = p_user_id;
    UPDATE public.stock_movements SET user_id = NULL WHERE user_id = p_user_id;

    -- Deletar do perfil e da tabela auth.users
    DELETE FROM public.profiles WHERE id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_user_id', p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.admin_delete_user FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user TO authenticated;

-- 8. TRIGGER DE PROTEÇÃO DE PRIVILÉGIOS ATUALIZADO
CREATE OR REPLACE FUNCTION public.protect_profile_privilege_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_net UUID;
BEGIN
    v_caller_id := auth.uid();

    -- Se disparado por processo interno sem usuário autenticado (ex: trigger auth)
    IF v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role, network_id INTO v_caller_role, v_caller_net
    FROM public.profiles
    WHERE id = v_caller_id;

    -- Super Admin pode alterar qualquer perfil
    IF v_caller_role = 'super_admin' THEN
        RETURN NEW;
    END IF;

    -- Admin de Rede pode atualizar perfis da sua rede (exceto super_admin e seu próprio role)
    IF v_caller_role = 'network_admin' THEN
        IF OLD.role = 'super_admin' OR NEW.role = 'super_admin' THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de rede não pode gerenciar contas super_admin.';
        END IF;

        IF OLD.network_id IS DISTINCT FROM v_caller_net OR NEW.network_id IS DISTINCT FROM v_caller_net THEN
            RAISE EXCEPTION 'Permissão negada: Usuário pertence a outra rede.';
        END IF;

        -- Auto-alteração de role ou network_id bloqueada para o próprio admin de rede
        IF v_caller_id = OLD.id AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.network_id IS DISTINCT FROM NEW.network_id) THEN
            RAISE EXCEPTION 'Permissão negada: Você não pode alterar o seu próprio cargo ou rede.';
        END IF;

        -- Admin de rede pode alterar full_name e job_title livremente
        RETURN NEW;
    END IF;

    -- Demais usuários (operadores) não podem alterar colunas de privilégio
    IF OLD.role IS DISTINCT FROM NEW.role OR
       OLD.network_id IS DISTINCT FROM NEW.network_id OR
       OLD.branch_id IS DISTINCT FROM NEW.branch_id OR
       OLD.job_title IS DISTINCT FROM NEW.job_title THEN
        RAISE EXCEPTION 'Permissão negada: Você não pode alterar cargos ou vínculos organizacionais.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- =========================================================================
-- 9. RPC DE EXCLUSÃO DEFINITIVA DE PRODUTOS & SANEAMENTO DE INATIVOS
-- =========================================================================

-- Ajuste de constraints de chave estrangeira para permitir exclusão segura preservando histórico
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;
ALTER TABLE public.sale_items 
  ADD CONSTRAINT sale_items_product_id_fkey 
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_items DROP CONSTRAINT IF EXISTS purchase_items_product_id_fkey;
ALTER TABLE public.purchase_items 
  ADD CONSTRAINT purchase_items_product_id_fkey 
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_product_id_fkey;
ALTER TABLE public.stock_movements 
  ADD CONSTRAINT stock_movements_product_id_fkey 
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- Exclusão definitiva de todos os produtos inativos de teste
DELETE FROM public.stock_movements WHERE product_id IN (SELECT id FROM public.products WHERE is_active = false);
UPDATE public.sale_items SET product_id = NULL WHERE product_id IN (SELECT id FROM public.products WHERE is_active = false);
UPDATE public.purchase_items SET product_id = NULL WHERE product_id IN (SELECT id FROM public.products WHERE is_active = false);
DELETE FROM public.products WHERE is_active = false;

-- RPC Segura para exclusão de produtos pela interface (Super Admin e Network Admin)
CREATE OR REPLACE FUNCTION public.admin_delete_product(p_product_id bigint)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_net UUID;
    v_prod_net UUID;
    v_prod_name TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado.';
    END IF;

    SELECT role, network_id INTO v_caller_role, v_caller_net
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('super_admin', 'network_admin') THEN
        RAISE EXCEPTION 'Permissão negada. Apenas administradores podem excluir produtos.';
    END IF;

    SELECT network_id, name INTO v_prod_net, v_prod_name
    FROM public.products
    WHERE id = p_product_id;

    IF v_prod_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Produto não encontrado ou já excluído.');
    END IF;

    IF v_caller_role = 'network_admin' AND v_caller_net IS DISTINCT FROM v_prod_net THEN
        RAISE EXCEPTION 'Permissão negada. Você só pode excluir produtos pertencentes à sua própria rede.';
    END IF;

    -- Deletar registros dependentes do produto com integridade
    DELETE FROM public.stock_movements WHERE product_id = p_product_id;
    UPDATE public.purchase_items SET product_id = NULL WHERE product_id = p_product_id;
    UPDATE public.sale_items SET product_id = NULL WHERE product_id = p_product_id;

    -- Deletar o produto definitivamente
    DELETE FROM public.products WHERE id = p_product_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Produto "%s" excluído com sucesso.', v_prod_name),
        'deleted_product_id', p_product_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_product(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_product(bigint) TO authenticated;

