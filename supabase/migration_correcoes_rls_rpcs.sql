-- =========================================================================
-- GIRO - MIGRAÇÃO DE CORREÇÃO: DESBLOQUEIO RLS (REDES/FILIAIS) E RPC CANCEL_SALE
-- Execute este script no SQL Editor do Supabase Giro
-- =========================================================================

-- 1. CORREÇÃO DAS POLÍTICAS DE RLS PARA REDES, UNIDADES, FILIAIS E CAIXAS
-- (Permite criação, edição e exclusão de acordo com o nível hierárquico)

-- 1.1. NETWORKS (Redes)
DROP POLICY IF EXISTS "networks_policy" ON public.networks;
DROP POLICY IF EXISTS "networks_all_policy" ON public.networks;

CREATE POLICY "networks_select_policy" ON public.networks
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR id = public.current_user_network_id()
);

CREATE POLICY "networks_insert_policy" ON public.networks
FOR INSERT TO authenticated
WITH CHECK (
    public.current_user_role() = 'super_admin'
);

CREATE POLICY "networks_update_policy" ON public.networks
FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND id = public.current_user_network_id())
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND id = public.current_user_network_id())
);

CREATE POLICY "networks_delete_policy" ON public.networks
FOR DELETE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
);

-- 1.2. UNITS (Unidades / Regionais)
DROP POLICY IF EXISTS "units_policy" ON public.units;
DROP POLICY IF EXISTS "units_all_policy" ON public.units;

CREATE POLICY "units_select_policy" ON public.units
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR network_id = public.current_user_network_id()
);

CREATE POLICY "units_insert_policy" ON public.units
FOR INSERT TO authenticated
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
);

CREATE POLICY "units_update_policy" ON public.units
FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
);

CREATE POLICY "units_delete_policy" ON public.units
FOR DELETE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
);

-- 1.3. BRANCHES (Filiais)
DROP POLICY IF EXISTS "branches_policy" ON public.branches;
DROP POLICY IF EXISTS "branches_all_policy" ON public.branches;

CREATE POLICY "branches_select_policy" ON public.branches
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR network_id = public.current_user_network_id()
    OR id = public.current_user_branch_id()
);

CREATE POLICY "branches_insert_policy" ON public.branches
FOR INSERT TO authenticated
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
);

CREATE POLICY "branches_update_policy" ON public.branches
FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (public.current_user_role() = 'branch_admin' AND id = public.current_user_branch_id())
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (public.current_user_role() = 'branch_admin' AND id = public.current_user_branch_id())
);

CREATE POLICY "branches_delete_policy" ON public.branches
FOR DELETE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
);

-- 1.4. CASH_DESKS (Caixas)
DROP POLICY IF EXISTS "cash_desks_policy" ON public.cash_desks;
DROP POLICY IF EXISTS "cash_desks_all_policy" ON public.cash_desks;

CREATE POLICY "cash_desks_select_policy" ON public.cash_desks
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = cash_desks.branch_id
        AND (
            b.network_id = public.current_user_network_id()
            OR b.id = public.current_user_branch_id()
        )
    )
);

CREATE POLICY "cash_desks_insert_policy" ON public.cash_desks
FOR INSERT TO authenticated
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = cash_desks.branch_id
        AND (
            b.network_id = public.current_user_network_id()
            OR b.id = public.current_user_branch_id()
        )
    )
);

CREATE POLICY "cash_desks_update_policy" ON public.cash_desks
FOR UPDATE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = cash_desks.branch_id
        AND (
            b.network_id = public.current_user_network_id()
            OR b.id = public.current_user_branch_id()
        )
    )
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = cash_desks.branch_id
        AND (
            b.network_id = public.current_user_network_id()
            OR b.id = public.current_user_branch_id()
        )
    )
);

CREATE POLICY "cash_desks_delete_policy" ON public.cash_desks
FOR DELETE TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = cash_desks.branch_id
        AND b.network_id = public.current_user_network_id()
    )
);

-- 1.5. CATEGORIES (Categorias de Produtos)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_all_policy" ON public.categories;
DROP POLICY IF EXISTS "categories_select_policy" ON public.categories;

CREATE POLICY "categories_select_policy" ON public.categories
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "categories_write_policy" ON public.categories
FOR ALL TO authenticated
USING (
    public.current_user_role() IN ('super_admin', 'network_admin', 'branch_admin', 'admin')
)
WITH CHECK (
    public.current_user_role() IN ('super_admin', 'network_admin', 'branch_admin', 'admin')
);

-- Inserir categorias padrão caso a tabela esteja vazia
INSERT INTO public.categories (name)
VALUES 
    ('Bebidas'),
    ('Alimentos & Mercearia'),
    ('Snacks & Doces'),
    ('Limpeza & Higiene'),
    ('Tabacaria & Diversos')
ON CONFLICT (name) DO NOTHING;


-- 2. CORREÇÃO DA FUNÇÃO RPC: CANCEL_SALE (Estorno de Vendas com Auditoria e Segurança)
CREATE OR REPLACE FUNCTION public.cancel_sale(
    p_sale_id BIGINT,
    p_reason TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_user_role TEXT;
    v_user_net UUID;
    v_user_branch UUID;
BEGIN
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venda #% não encontrada.', p_sale_id;
    END IF;

    IF v_sale.status = 'CANCELED' THEN
        RAISE EXCEPTION 'A venda #% já foi cancelada anteriormente.', p_sale_id;
    END IF;

    -- Validação de Permissão e Isolamento de Filial
    v_user_role := public.current_user_role();
    v_user_net := public.current_user_network_id();
    v_user_branch := public.current_user_branch_id();

    IF v_user_role IS NOT NULL AND v_user_role <> 'super_admin' THEN
        IF v_user_role = 'network_admin' AND v_sale.network_id <> v_user_net THEN
            RAISE EXCEPTION 'Permissão negada: Esta venda pertence a outra rede.';
        ELSIF (v_user_role = 'branch_admin' OR v_user_role = 'cashier_operator') AND v_sale.branch_id <> v_user_branch THEN
            RAISE EXCEPTION 'Permissão negada: Esta venda pertence a outra filial.';
        END IF;
    END IF;

    -- Atualiza status da venda
    UPDATE public.sales
    SET status = 'CANCELED',
        cancel_reason = COALESCE(p_reason, 'Cancelamento de venda'),
        canceled_at = timezone('utc'::text, now())
    WHERE id = p_sale_id;

    -- Devolve itens ao estoque e gera movimentação auditada com filial e rede
    FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id
    LOOP
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_item.quantity,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_item.product_id;

        INSERT INTO public.stock_movements (
            product_id, movement_type, quantity, origin, note, 
            user_id, branch_id, network_id
        )
        VALUES (
            v_item.product_id,
            'IN',
            v_item.quantity,
            'SALE_CANCEL',
            'Estorno da Venda #' || p_sale_id || ' - Motivo: ' || COALESCE(p_reason, 'Cancelamento'),
            COALESCE(p_user_id, (SELECT auth.uid())),
            v_sale.branch_id,
            v_sale.network_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'status', 'CANCELED'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.cancel_sale(BIGINT, TEXT, UUID) TO authenticated;


-- 3. TRIGGER ATÔMICO DE CRIAÇÃO DE PERFIL COM METADADOS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_net_id UUID := NULL;
    v_unit_id UUID := NULL;
    v_branch_id UUID := NULL;
BEGIN
    IF (new.raw_user_meta_data->>'network_id') IS NOT NULL AND (new.raw_user_meta_data->>'network_id') <> '' THEN
        v_net_id := (new.raw_user_meta_data->>'network_id')::UUID;
    END IF;

    IF (new.raw_user_meta_data->>'unit_id') IS NOT NULL AND (new.raw_user_meta_data->>'unit_id') <> '' THEN
        v_unit_id := (new.raw_user_meta_data->>'unit_id')::UUID;
    END IF;

    IF (new.raw_user_meta_data->>'branch_id') IS NOT NULL AND (new.raw_user_meta_data->>'branch_id') <> '' THEN
        v_branch_id := (new.raw_user_meta_data->>'branch_id')::UUID;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role, network_id, unit_id, branch_id)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'role', 'cashier_operator'),
        v_net_id,
        v_unit_id,
        v_branch_id
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        network_id = EXCLUDED.network_id,
        unit_id = EXCLUDED.unit_id,
        branch_id = EXCLUDED.branch_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- =========================================================================
-- FIM DA MIGRAÇÃO DE CORREÇÕES RLS E RPC
-- =========================================================================
