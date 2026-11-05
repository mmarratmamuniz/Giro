-- =========================================================================
-- GIRO - FASE 4: BLINDAGEM DE SEGURANÇA COM ROW LEVEL SECURITY (RLS)
-- Execute este script no SQL Editor do Supabase Giro
-- =========================================================================

-- 1. FUNÇÕES AUXILIARES DE SEGURANÇA (SECURITY DEFINER)
-- Retornam os dados do usuário autenticado executando como sistema (evita recursão)

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.current_user_network_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p.network_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.current_user_unit_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p.unit_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.current_user_branch_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p.branch_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
$$;

-- Função auxiliar para inspecionar políticas ativas
CREATE OR REPLACE FUNCTION public.debug_get_policies()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    SELECT jsonb_agg(jsonb_build_object(
        'table', tablename,
        'policy', policyname,
        'roles', roles,
        'qual', qual
    ))
    FROM pg_policies
    WHERE schemaname = 'public';
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_network_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_unit_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_branch_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.debug_get_policies() TO authenticated, anon;

-- 2. HABILITAR ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_desks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

-- 3. REMOVER AUTOMATICAMENTE TODAS AS POLÍTICAS ANTERIORES (Limpa políticas legadas "Acesso completo a..." e "tenant_access")
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN (
            'profiles', 'networks', 'units', 'branches', 'cash_desks', 
            'products', 'sales', 'sale_items', 'purchases', 'purchase_items', 
            'stock_movements', 'cash_shifts', 'cash_transactions', 'categories'
          )
    ) 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;


-- 4. POLÍTICAS DE PERFIS (PROFILES)
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
    OR (
        public.current_user_role() = 'branch_admin'
        AND branch_id = public.current_user_branch_id()
        AND role IN ('branch_admin', 'cashier_operator', 'operator')
    )
);

CREATE POLICY "profiles_update_policy" ON public.profiles
FOR UPDATE TO authenticated
USING (
    id = (SELECT auth.uid())
    OR public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (public.current_user_role() = 'branch_admin' AND branch_id = public.current_user_branch_id())
)
WITH CHECK (
    id = (SELECT auth.uid())
    OR public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (public.current_user_role() = 'branch_admin' AND branch_id = public.current_user_branch_id())
);

-- 5. POLÍTICAS DE PRODUTOS (PRODUCTS)
CREATE POLICY "products_select_policy" ON public.products
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR network_id = public.current_user_network_id()
    OR network_id IS NULL
    OR branch_id = public.current_user_branch_id()
    OR branch_id IS NULL
);

CREATE POLICY "products_write_policy" ON public.products
FOR ALL TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (public.current_user_role() = 'branch_admin' AND branch_id = public.current_user_branch_id())
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (public.current_user_role() = 'branch_admin' AND branch_id = public.current_user_branch_id())
);

-- 6. POLÍTICAS DE VENDAS E ITENS (SALES & SALE_ITEMS)
CREATE POLICY "sales_select_policy" ON public.sales
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (branch_id = public.current_user_branch_id())
);

CREATE POLICY "sales_insert_policy" ON public.sales
FOR INSERT TO authenticated
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (branch_id = public.current_user_branch_id())
);

CREATE POLICY "sale_items_select_policy" ON public.sale_items
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s.id = sale_items.sale_id
        AND (
            public.current_user_role() = 'super_admin'
            OR (public.current_user_role() = 'network_admin' AND s.network_id = public.current_user_network_id())
            OR (s.branch_id = public.current_user_branch_id())
        )
    )
);

CREATE POLICY "sale_items_insert_policy" ON public.sale_items
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s.id = sale_items.sale_id
        AND (
            public.current_user_role() = 'super_admin'
            OR (public.current_user_role() = 'network_admin' AND s.network_id = public.current_user_network_id())
            OR (s.branch_id = public.current_user_branch_id())
        )
    )
);

-- 7. POLÍTICAS DE COMPRAS E ENTRADAS (PURCHASES & PURCHASE_ITEMS)
-- Caixas possuem zero acesso a compras
CREATE POLICY "purchases_policy" ON public.purchases
FOR ALL TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (public.current_user_role() = 'branch_admin' AND branch_id = public.current_user_branch_id())
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (public.current_user_role() = 'branch_admin' AND branch_id = public.current_user_branch_id())
);

CREATE POLICY "purchase_items_policy" ON public.purchase_items
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.purchases p
        WHERE p.id = purchase_items.purchase_id
        AND (
            public.current_user_role() = 'super_admin'
            OR (public.current_user_role() = 'network_admin' AND p.network_id = public.current_user_network_id())
            OR (public.current_user_role() = 'branch_admin' AND p.branch_id = public.current_user_branch_id())
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.purchases p
        WHERE p.id = purchase_items.purchase_id
        AND (
            public.current_user_role() = 'super_admin'
            OR (public.current_user_role() = 'network_admin' AND p.network_id = public.current_user_network_id())
            OR (public.current_user_role() = 'branch_admin' AND p.branch_id = public.current_user_branch_id())
        )
    )
);

-- 8. POLÍTICAS DE TURNOS E TRANSAÇÕES DE CAIXA (CASH_SHIFTS & CASH_TRANSACTIONS)
CREATE POLICY "cash_shifts_policy" ON public.cash_shifts
FOR ALL TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (branch_id = public.current_user_branch_id())
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (branch_id = public.current_user_branch_id())
);

CREATE POLICY "cash_transactions_policy" ON public.cash_transactions
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.cash_shifts cs
        WHERE cs.id = cash_transactions.shift_id
        AND (
            public.current_user_role() = 'super_admin'
            OR (public.current_user_role() = 'network_admin' AND cs.network_id = public.current_user_network_id())
            OR (cs.branch_id = public.current_user_branch_id())
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.cash_shifts cs
        WHERE cs.id = cash_transactions.shift_id
        AND (
            public.current_user_role() = 'super_admin'
            OR (public.current_user_role() = 'network_admin' AND cs.network_id = public.current_user_network_id())
            OR (cs.branch_id = public.current_user_branch_id())
        )
    )
);

-- 9. POLÍTICAS DE MOVIMENTAÇÃO DE ESTOQUE (STOCK_MOVEMENTS)
CREATE POLICY "stock_movements_policy" ON public.stock_movements
FOR ALL TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (branch_id = public.current_user_branch_id())
)
WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (branch_id = public.current_user_branch_id())
);

-- 10. POLÍTICAS DE REDES, UNIDADES, FILIAIS E CAIXAS
CREATE POLICY "networks_policy" ON public.networks
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR id = public.current_user_network_id()
);

CREATE POLICY "units_policy" ON public.units
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR network_id = public.current_user_network_id()
);

CREATE POLICY "branches_policy" ON public.branches
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR network_id = public.current_user_network_id()
    OR id = public.current_user_branch_id()
);

CREATE POLICY "cash_desks_policy" ON public.cash_desks
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

-- =========================================================================
-- FIM DA MIGRAÇÃO FASE 4: RLS ATIVADO E BLINDADO
-- =========================================================================
