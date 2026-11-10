-- =========================================================================
-- GIRO - FASE 5: BLINDAGEM DE SEGURANÇA, AUDITORIA E RPCS TRANSACIONAIS
-- Execute este script no SQL Editor do Supabase Giro
-- Idempotente: seguro para execução repetida
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. LIMPEZA E SEGURANÇA DE FUNÇÕES AUXILIARES
-- =========================================================================

DROP FUNCTION IF EXISTS public.debug_get_policies();
DROP FUNCTION IF EXISTS public.delete_user_by_admin(uuid);
DROP TRIGGER IF EXISTS trigger_auto_confirm_new_users ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_new_users();
DROP FUNCTION IF EXISTS public.create_complete_sale(text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_complete_sale(text, jsonb, uuid, numeric, bigint);
DROP FUNCTION IF EXISTS public.create_complete_sale(text, jsonb, uuid, numeric, bigint, uuid, uuid);

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_network_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_unit_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_branch_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_network_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_unit_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_branch_id() TO authenticated;

-- =========================================================================
-- 2. COLUNAS DE AUDITORIA E CONSTRAINTS
-- =========================================================================

-- Auditoria de cancelamento em vendas
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS canceled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Preservação de CMV histórico por item vendido
ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10, 2) DEFAULT 0.00 NOT NULL;

-- Responsável pelo fechamento de turno
ALTER TABLE public.cash_shifts
ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Auditoria e nota fiscal nas compras
ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Vínculo de categorias com redes
ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES public.networks(id) ON DELETE CASCADE;

-- Saneamento: Preencher network_id em cash_shifts e sales legados com base na filial
UPDATE public.cash_shifts cs
SET network_id = b.network_id
FROM public.branches b
WHERE cs.branch_id = b.id AND cs.network_id IS NULL;

UPDATE public.sales s
SET network_id = b.network_id
FROM public.branches b
WHERE s.branch_id = b.id AND s.network_id IS NULL;

-- Saneamento: Fechar turnos duplicados legados no mesmo terminal antes de criar o índice
-- (mantém apenas o turno mais recente como OPEN para evitar erro 23505)
WITH ranked_open_shifts AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY cash_desk_id 
               ORDER BY COALESCE(opened_at, now()) DESC, id DESC
           ) AS rn
    FROM public.cash_shifts
    WHERE status = 'OPEN' AND cash_desk_id IS NOT NULL
)
UPDATE public.cash_shifts
SET status = 'CLOSED',
    closed_at = COALESCE(closed_at, now()),
    notes = TRIM(COALESCE(notes, '') || ' [Fechamento automático de turno duplicado legado]')
WHERE id IN (
    SELECT id FROM ranked_open_shifts WHERE rn > 1
);

-- Previne turnos simultâneos abertos no mesmo terminal físico de caixa
CREATE UNIQUE INDEX IF NOT EXISTS cash_shifts_one_open_per_desk_idx
ON public.cash_shifts (cash_desk_id)
WHERE status = 'OPEN' AND cash_desk_id IS NOT NULL;

-- =========================================================================
-- 3. BLINDAGEM DE PERFIS E RLS (ANTI-ESCALAÇÃO DE PRIVILÉGIOS E ISOLAMENTO)
-- =========================================================================

-- 3.1. Auto-cadastro seguro: metadados do cliente são completamente ignorados
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, network_id, unit_id, branch_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'cashier_operator',
        NULL,
        NULL,
        NULL
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3.2. Bloqueio estrito de escalação de privilégios em profiles
CREATE OR REPLACE FUNCTION public.protect_profile_privilege_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role TEXT;
    v_actor_net UUID;
    v_actor_branch UUID;
BEGIN
    v_actor_id := auth.uid();

    -- Regra a: Permite tudo se SQL Editor / Service Role (auth.uid() IS NULL)
    IF v_actor_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_actor_role := public.current_user_role();

    -- Regra a: Super Admin possui controle total
    IF v_actor_role = 'super_admin' THEN
        RETURN NEW;
    END IF;

    -- Regra b: Bloqueia qualquer usuário tentando alterar seus próprios privilégios ou vínculos
    IF v_actor_id = OLD.id THEN
        IF NEW.role IS DISTINCT FROM OLD.role
           OR NEW.network_id IS DISTINCT FROM OLD.network_id
           OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
           OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
            RAISE EXCEPTION 'Auto-escalação bloqueada: Usuários não podem alterar seu próprio cargo ou filiais vinculadas.';
        END IF;
    END IF;

    v_actor_net := public.current_user_network_id();
    v_actor_branch := public.current_user_branch_id();

    -- Regra c: network_admin não pode promover a super_admin nem apontar para outra rede
    IF v_actor_role = 'network_admin' THEN
        IF NEW.role = 'super_admin' THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de rede não pode promover usuários a super_admin.';
        END IF;
        IF NEW.network_id IS DISTINCT FROM v_actor_net THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de rede só pode gerenciar usuários da sua própria rede.';
        END IF;
        RETURN NEW;
    END IF;

    -- Regra c2: unit_admin só pode gerenciar branch_admin/cashier_operator na sua unidade e rede
    IF v_actor_role = 'unit_admin' THEN
        IF NEW.role NOT IN ('branch_admin', 'cashier_operator', 'operator') THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de unidade só pode atribuir cargos branch_admin ou cashier_operator.';
        END IF;
        IF NEW.network_id IS DISTINCT FROM v_actor_net THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de unidade só pode vincular usuários à sua própria rede.';
        END IF;
        IF NEW.unit_id IS DISTINCT FROM public.current_user_unit_id() THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de unidade só pode vincular usuários à sua própria unidade regional.';
        END IF;
        RETURN NEW;
    END IF;

    -- Regra d: branch_admin só pode gerenciar branch_admin/cashier_operator na sua filial e rede
    IF v_actor_role = 'branch_admin' THEN
        IF NEW.role NOT IN ('branch_admin', 'cashier_operator', 'operator') THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de filial só pode atribuir cargos de filial (branch_admin ou cashier_operator).';
        END IF;
        IF NEW.network_id IS DISTINCT FROM v_actor_net THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de filial só pode vincular usuários à sua própria rede.';
        END IF;
        IF NEW.branch_id IS DISTINCT FROM v_actor_branch THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de filial só pode vincular usuários à sua própria filial.';
        END IF;
        RETURN NEW;
    END IF;

    -- Demais cargos não podem alterar role, network_id, unit_id ou branch_id de ninguém
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.network_id IS DISTINCT FROM OLD.network_id
       OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
        RAISE EXCEPTION 'Permissão negada: Privilégios insuficientes para alterar cargo ou vínculos de usuários.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS protect_profile_privilege_columns ON public.profiles;
CREATE TRIGGER protect_profile_privilege_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privilege_columns();

-- 3.3. Correção estrita de products_select_policy (elimina bypass por OR NULL)
DROP POLICY IF EXISTS "products_select_policy" ON public.products;
CREATE POLICY "products_select_policy" ON public.products
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (
        network_id = public.current_user_network_id()
        AND (
            public.current_user_role() IN ('network_admin', 'unit_admin')
            OR branch_id = public.current_user_branch_id()
            OR branch_id IS NULL
        )
    )
);

-- 3.4. Restrição de tabelas de movimentação financeira e estoque apenas para leitura via RLS
DROP POLICY IF EXISTS "stock_movements_policy" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_all_policy" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_write_policy" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_insert_policy" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_update_policy" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_delete_policy" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_select_policy" ON public.stock_movements;

CREATE POLICY "stock_movements_select_policy" ON public.stock_movements
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'super_admin'
    OR (public.current_user_role() = 'network_admin' AND network_id = public.current_user_network_id())
    OR (branch_id = public.current_user_branch_id())
);

DROP POLICY IF EXISTS "cash_transactions_policy" ON public.cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_all_policy" ON public.cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_write_policy" ON public.cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_insert_policy" ON public.cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_update_policy" ON public.cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_delete_policy" ON public.cash_transactions;
DROP POLICY IF EXISTS "cash_transactions_select_policy" ON public.cash_transactions;

CREATE POLICY "cash_transactions_select_policy" ON public.cash_transactions
FOR SELECT TO authenticated
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
);

-- 3.5. Atualização de profiles_select_policy com suporte a unit_admin
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
    OR (
        public.current_user_role() = 'unit_admin'
        AND network_id = public.current_user_network_id()
        AND (
            unit_id = public.current_user_unit_id()
            OR branch_id IN (
                SELECT b.id FROM public.branches b WHERE b.unit_id = public.current_user_unit_id()
            )
        )
        AND role IN ('unit_admin', 'branch_admin', 'cashier_operator', 'operator')
    )
    OR (
        public.current_user_role() = 'branch_admin'
        AND branch_id = public.current_user_branch_id()
        AND role IN ('branch_admin', 'cashier_operator', 'operator')
    )
);

-- =========================================================================
-- 4. RPCS TRANSACIONAIS E AUDITÁVEIS
-- =========================================================================

-- 4.1. RPC: CREATE_COMPLETE_SALE
CREATE OR REPLACE FUNCTION public.create_complete_sale(
    p_payment_method TEXT,
    p_items JSONB,
    p_user_id UUID DEFAULT NULL,
    p_discount_amount NUMERIC DEFAULT 0,
    p_shift_id BIGINT DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_cash_desk_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_user_net UUID;
    v_user_branch UUID;
    v_branch_id UUID;
    v_network_id UUID;
    v_shift RECORD;
    v_sale_id BIGINT;
    v_item_json JSONB;
    v_prod_id BIGINT;
    v_qty NUMERIC;
    v_unit_price NUMERIC;
    v_unit_cost NUMERIC;
    v_item_subtotal NUMERIC;
    v_subtotal NUMERIC := 0.00;
    v_discount NUMERIC := 0.00;
    v_total_amount NUMERIC := 0.00;
    v_product RECORD;
BEGIN
    -- Ignora p_user_id fornecido pelo cliente e autentica diretamente na sessão
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
    END IF;

    -- Obtém perfil do usuário
    SELECT role, network_id, branch_id
    INTO v_user_role, v_user_net, v_user_branch
    FROM public.profiles
    WHERE id = v_user_id;

    -- Determina filial da venda
    IF p_branch_id IS NOT NULL THEN
        v_branch_id := p_branch_id;
    ELSE
        v_branch_id := v_user_branch;
    END IF;

    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'Operação inválida: Nenhuma filial especificada ou vinculada ao perfil.';
    END IF;

    -- Determina rede da filial
    SELECT network_id INTO v_network_id FROM public.branches WHERE id = v_branch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Filial % não encontrada.', v_branch_id;
    END IF;

    -- Validação de escopo hierárquico
    IF v_user_role IS NOT NULL AND v_user_role <> 'super_admin' THEN
        IF v_user_role = 'network_admin' AND v_network_id <> v_user_net THEN
            RAISE EXCEPTION 'Permissão negada: Filial pertence a outra rede.';
        ELSIF v_user_role IN ('branch_admin', 'cashier_operator', 'operator') AND (v_user_branch IS DISTINCT FROM v_branch_id) THEN
            RAISE EXCEPTION 'Permissão negada: Operador não tem acesso a esta filial.';
        END IF;
    END IF;

    -- Validação de turno de caixa se informado
    IF p_shift_id IS NOT NULL THEN
        SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Turno #% não encontrado.', p_shift_id;
        END IF;
        IF v_shift.status <> 'OPEN' THEN
            RAISE EXCEPTION 'Turno #% não está aberto.', p_shift_id;
        END IF;
        IF v_shift.branch_id <> v_branch_id THEN
            RAISE EXCEPTION 'Turno #% não pertence à filial da venda.', p_shift_id;
        END IF;
    END IF;

    -- Validação de terminal físico se informado
    IF p_cash_desk_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.cash_desks WHERE id = p_cash_desk_id AND branch_id = v_branch_id) THEN
            RAISE EXCEPTION 'Terminal de caixa #% não pertence à filial da venda.', p_cash_desk_id;
        END IF;
    END IF;

    -- Validação da lista de itens
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'A venda deve conter pelo menos um item.';
    END IF;

    IF EXISTS (
        SELECT (elem->>'product_id')::BIGINT
        FROM jsonb_array_elements(p_items) elem
        GROUP BY (elem->>'product_id')::BIGINT
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'A venda contém itens duplicados para o mesmo produto.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_items) elem
        WHERE COALESCE((elem->>'quantity')::NUMERIC, 0) <= 0
    ) THEN
        RAISE EXCEPTION 'Todos os itens da venda devem ter quantidade superior a zero.';
    END IF;

    -- Lock pessimista nos produtos, verificação de filial/rede e cálculo de subtotal
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item_json->>'product_id')::BIGINT;
        v_qty := (v_item_json->>'quantity')::NUMERIC;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_prod_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto #% não encontrado.', v_prod_id;
        END IF;

        IF v_product.network_id <> v_network_id OR (v_product.branch_id IS NOT NULL AND v_product.branch_id <> v_branch_id) THEN
            RAISE EXCEPTION 'Produto "%" não pertence ao catálogo desta filial/rede.', v_product.name;
        END IF;

        IF v_product.stock_quantity < v_qty THEN
            RAISE EXCEPTION 'Estoque insuficiente para "%" (Disponível: %, Solicitado: %).', v_product.name, v_product.stock_quantity, v_qty;
        END IF;

        v_unit_price := COALESCE((v_item_json->>'unit_price')::NUMERIC, v_product.sale_price);
        v_item_subtotal := round(v_qty * v_unit_price, 2);
        v_subtotal := v_subtotal + v_item_subtotal;
    END LOOP;

    v_discount := COALESCE(p_discount_amount, 0.00);
    IF v_discount < 0 THEN
        RAISE EXCEPTION 'Valor de desconto não pode ser negativo.';
    END IF;
    IF v_discount > v_subtotal THEN
        RAISE EXCEPTION 'Desconto não pode exceder o valor total dos itens.';
    END IF;
    v_total_amount := v_subtotal - v_discount;

    -- Gravação do cabeçalho da venda
    INSERT INTO public.sales (
        payment_method, total_amount, discount_amount, user_id,
        branch_id, network_id, shift_id, cash_desk_id, status, created_at
    )
    VALUES (
        p_payment_method, v_total_amount, v_discount, v_user_id,
        v_branch_id, v_network_id, p_shift_id, p_cash_desk_id, 'COMPLETED', timezone('utc'::text, now())
    )
    RETURNING id INTO v_sale_id;

    -- Gravação dos itens com unit_cost histórico, baixa em estoque e movimentação auditada
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item_json->>'product_id')::BIGINT;
        v_qty := (v_item_json->>'quantity')::NUMERIC;

        SELECT * INTO v_product FROM public.products WHERE id = v_prod_id;
        v_unit_price := COALESCE((v_item_json->>'unit_price')::NUMERIC, v_product.sale_price);
        v_item_subtotal := round(v_qty * v_unit_price, 2);
        v_unit_cost := COALESCE(v_product.cost_price, 0.00);

        INSERT INTO public.sale_items (
            sale_id, product_id, quantity, unit_price, unit_cost
        )
        VALUES (
            v_sale_id, v_prod_id, v_qty, v_unit_price, v_unit_cost
        );

        UPDATE public.products
        SET stock_quantity = stock_quantity - v_qty,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_prod_id;

        INSERT INTO public.stock_movements (
            product_id, movement_type, quantity, origin, note,
            user_id, branch_id, network_id
        )
        VALUES (
            v_prod_id, 'OUT', v_qty, 'SALE', 'Venda #' || v_sale_id,
            v_user_id, v_branch_id, v_network_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'total_amount', v_total_amount,
        'discount_amount', v_discount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.create_complete_sale(text, jsonb, uuid, numeric, bigint, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_complete_sale(text, jsonb, uuid, numeric, bigint, uuid, uuid) TO authenticated;

-- 4.2. RPC: CANCEL_SALE
DROP FUNCTION IF EXISTS public.cancel_sale(bigint, text);
DROP FUNCTION IF EXISTS public.cancel_sale(bigint, text, uuid);

CREATE OR REPLACE FUNCTION public.cancel_sale(
    p_sale_id BIGINT,
    p_reason TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_user_net UUID;
    v_user_branch UUID;
    v_sale RECORD;
    v_item RECORD;
BEGIN
    -- Ignora p_user_id fornecido pelo cliente e obtém identidade da sessão
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
    END IF;

    SELECT role, network_id, branch_id
    INTO v_user_role, v_user_net, v_user_branch
    FROM public.profiles
    WHERE id = v_user_id;

    -- Operador de caixa não cancela venda sem autorização gerencial
    IF v_user_role NOT IN ('super_admin', 'network_admin', 'unit_admin', 'branch_admin') THEN
        RAISE EXCEPTION 'Permissão negada: Apenas administradores e gerentes podem realizar cancelamento de vendas.';
    END IF;

    -- Lock pessimista na venda
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venda #% não encontrada.', p_sale_id;
    END IF;

    IF v_sale.status = 'CANCELED' THEN
        RAISE EXCEPTION 'A venda #% já se encontra cancelada.', p_sale_id;
    END IF;

    -- Validação de isolamento de rede/filial
    IF v_user_role <> 'super_admin' THEN
        IF v_user_role = 'network_admin' AND v_sale.network_id <> v_user_net THEN
            RAISE EXCEPTION 'Permissão negada: Esta venda pertence a outra rede.';
        ELSIF v_user_role = 'branch_admin' AND v_sale.branch_id <> v_user_branch THEN
            RAISE EXCEPTION 'Permissão negada: Esta venda pertence a outra filial.';
        END IF;
    END IF;

    -- Atualização da venda com auditoria de quem cancelou
    UPDATE public.sales
    SET status = 'CANCELED',
        cancel_reason = COALESCE(p_reason, 'Cancelamento de venda'),
        canceled_at = timezone('utc'::text, now()),
        canceled_by = v_user_id
    WHERE id = p_sale_id;

    -- Devolução atômica dos itens ao estoque e registro de movimentação de estorno
    FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id
    LOOP
        PERFORM 1 FROM public.products WHERE id = v_item.product_id FOR UPDATE;

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
            v_user_id,
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

REVOKE ALL ON FUNCTION public.cancel_sale(bigint, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sale(bigint, text, uuid) TO authenticated;

-- 4.3. RPC: CREATE_COMPLETE_PURCHASE
DROP FUNCTION IF EXISTS public.create_complete_purchase(uuid, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.create_complete_purchase(
    p_branch_id UUID,
    p_supplier TEXT,
    p_items JSONB,
    p_invoice_number TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_user_net UUID;
    v_user_branch UUID;
    v_user_unit UUID;
    v_branch_net UUID;
    v_branch_unit UUID;
    v_purchase_id BIGINT;
    v_item_json JSONB;
    v_prod_id BIGINT;
    v_qty NUMERIC;
    v_unit_cost NUMERIC;
    v_item_subtotal NUMERIC;
    v_total_amount NUMERIC := 0.00;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
    END IF;

    SELECT role, network_id, branch_id, unit_id
    INTO v_user_role, v_user_net, v_user_branch, v_user_unit
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role NOT IN ('super_admin', 'network_admin', 'unit_admin', 'branch_admin') THEN
        RAISE EXCEPTION 'Permissão negada: Apenas administradores e gerentes podem registrar compras.';
    END IF;

    -- Validação de filial e hierarquia
    SELECT network_id, unit_id INTO v_branch_net, v_branch_unit FROM public.branches WHERE id = p_branch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Filial % não encontrada.', p_branch_id;
    END IF;

    IF v_user_role <> 'super_admin' THEN
        IF v_user_role = 'network_admin' AND v_branch_net <> v_user_net THEN
            RAISE EXCEPTION 'Permissão negada: Filial pertence a outra rede.';
        ELSIF v_user_role = 'unit_admin' AND v_branch_unit <> v_user_unit THEN
            RAISE EXCEPTION 'Permissão negada: Filial pertence a outra unidade regional.';
        ELSIF v_user_role = 'branch_admin' AND p_branch_id <> v_user_branch THEN
            RAISE EXCEPTION 'Permissão negada: Registro de compras restrito à sua própria filial.';
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'A compra deve conter pelo menos um item.';
    END IF;

    -- Validação prévia de itens e apuração do valor total
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item_json->>'product_id')::BIGINT;
        v_qty := (v_item_json->>'quantity')::NUMERIC;
        v_unit_cost := (v_item_json->>'unit_cost')::NUMERIC;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantidade inválida para o produto #% (deve ser maior que zero).', v_prod_id;
        END IF;
        IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN
            RAISE EXCEPTION 'Custo unitário inválido para o produto #% (não pode ser negativo).', v_prod_id;
        END IF;

        PERFORM 1 FROM public.products WHERE id = v_prod_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto #% não encontrado.', v_prod_id;
        END IF;

        v_total_amount := v_total_amount + round(v_qty * v_unit_cost, 2);
    END LOOP;

    -- Inserção do cabeçalho da compra
    INSERT INTO public.purchases (
        branch_id, network_id, supplier, total_amount, user_id, invoice_number, created_at
    )
    VALUES (
        p_branch_id, v_branch_net, p_supplier, v_total_amount, v_user_id, p_invoice_number, timezone('utc'::text, now())
    )
    RETURNING id INTO v_purchase_id;

    -- Inserção dos itens, incremento no estoque, atualização do custo e auditoria em stock_movements
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item_json->>'product_id')::BIGINT;
        v_qty := (v_item_json->>'quantity')::NUMERIC;
        v_unit_cost := (v_item_json->>'unit_cost')::NUMERIC;
        v_item_subtotal := round(v_qty * v_unit_cost, 2);

        INSERT INTO public.purchase_items (
            purchase_id, product_id, quantity, unit_cost
        )
        VALUES (
            v_purchase_id, v_prod_id, v_qty, v_unit_cost
        );

        UPDATE public.products
        SET stock_quantity = stock_quantity + v_qty,
            cost_price = v_unit_cost,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_prod_id;

        INSERT INTO public.stock_movements (
            product_id, movement_type, quantity, origin, note,
            user_id, branch_id, network_id
        )
        VALUES (
            v_prod_id, 'IN', v_qty, 'PURCHASE',
            'Entrada Compra #' || v_purchase_id || COALESCE(' - NF: ' || p_invoice_number, ''),
            v_user_id, p_branch_id, v_branch_net
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'total_amount', v_total_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.create_complete_purchase(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_complete_purchase(uuid, text, jsonb, text) TO authenticated;

-- 4.4. RPC: ADJUST_PRODUCT_STOCK
DROP FUNCTION IF EXISTS public.adjust_product_stock(bigint, integer, text);

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
    p_product_id BIGINT,
    p_new_quantity INTEGER,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_user_net UUID;
    v_user_branch UUID;
    v_product RECORD;
    v_old_quantity INTEGER;
    v_diff INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
    END IF;

    SELECT role, network_id, branch_id
    INTO v_user_role, v_user_net, v_user_branch
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role NOT IN ('super_admin', 'network_admin', 'unit_admin', 'branch_admin') THEN
        RAISE EXCEPTION 'Permissão negada: Apenas administradores e gerentes podem realizar ajustes manuais de estoque.';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'O motivo do ajuste é obrigatório e deve ter no mínimo 3 caracteres.';
    END IF;

    IF p_new_quantity < 0 THEN
        RAISE EXCEPTION 'A nova quantidade em estoque não pode ser negativa.';
    END IF;

    -- Lock pessimista no produto
    SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto #% não encontrado.', p_product_id;
    END IF;

    IF v_user_role <> 'super_admin' THEN
        IF v_user_role = 'network_admin' AND v_product.network_id <> v_user_net THEN
            RAISE EXCEPTION 'Permissão negada: Produto pertence a outra rede.';
        ELSIF v_user_role = 'branch_admin' THEN
            IF v_product.network_id <> v_user_net OR (v_product.branch_id IS NOT NULL AND v_product.branch_id <> v_user_branch) THEN
                RAISE EXCEPTION 'Permissão negada: Produto fora da filial do administrador.';
            END IF;
        END IF;
    END IF;

    v_old_quantity := v_product.stock_quantity;
    v_diff := p_new_quantity - v_old_quantity;

    IF v_diff = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'product_id', p_product_id,
            'old_quantity', v_old_quantity,
            'new_quantity', p_new_quantity,
            'difference', 0,
            'message', 'Quantidade idêntica à atual. Nenhuma alteração realizada.'
        );
    END IF;

    UPDATE public.products
    SET stock_quantity = p_new_quantity,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id;

    INSERT INTO public.stock_movements (
        product_id, movement_type, quantity, origin, note,
        user_id, branch_id, network_id
    )
    VALUES (
        p_product_id,
        CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END,
        abs(v_diff),
        'MANUAL_ADJUSTMENT',
        trim(p_reason),
        v_user_id,
        COALESCE(v_product.branch_id, v_user_branch),
        COALESCE(v_product.network_id, v_user_net)
    );

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'old_quantity', v_old_quantity,
        'new_quantity', p_new_quantity,
        'difference', v_diff
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.adjust_product_stock(bigint, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(bigint, integer, text) TO authenticated;

-- 4.5. RPC: CLOSE_CASH_SHIFT
DROP FUNCTION IF EXISTS public.close_cash_shift(bigint, numeric, text);

CREATE OR REPLACE FUNCTION public.close_cash_shift(
    p_shift_id BIGINT,
    p_final_amount NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_user_net UUID;
    v_user_branch UUID;
    v_shift RECORD;
    v_cash_sales NUMERIC := 0.00;
    v_suprimento NUMERIC := 0.00;
    v_sangria NUMERIC := 0.00;
    v_system_amount NUMERIC := 0.00;
    v_diff NUMERIC := 0.00;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
    END IF;

    SELECT role, network_id, branch_id
    INTO v_user_role, v_user_net, v_user_branch
    FROM public.profiles
    WHERE id = v_user_id;

    -- Lock pessimista no turno
    SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Turno #% não encontrado.', p_shift_id;
    END IF;

    IF v_shift.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Turno #% já está fechado ou inválido para encerramento.', p_shift_id;
    END IF;

    -- Validação de isolamento
    IF v_user_role IS NOT NULL AND v_user_role <> 'super_admin' THEN
        IF v_user_role = 'network_admin' AND v_shift.network_id <> v_user_net THEN
            RAISE EXCEPTION 'Permissão negada: Turno pertence a outra rede.';
        ELSIF (v_user_role = 'branch_admin' OR v_user_role = 'cashier_operator' OR v_user_role = 'operator') AND v_shift.branch_id <> v_user_branch THEN
            RAISE EXCEPTION 'Permissão negada: Turno pertence a outra filial.';
        END IF;
    END IF;

    -- Apuração de vendas concluídas em dinheiro no turno
    SELECT COALESCE(SUM(total_amount), 0.00) INTO v_cash_sales
    FROM public.sales
    WHERE shift_id = p_shift_id
      AND LOWER(payment_method) = 'dinheiro'
      AND status = 'COMPLETED';

    -- Apuração de suprimentos no turno
    SELECT COALESCE(SUM(amount), 0.00) INTO v_suprimento
    FROM public.cash_transactions
    WHERE shift_id = p_shift_id
      AND UPPER(type) = 'SUPRIMENTO';

    -- Apuração de sangrias no turno
    SELECT COALESCE(SUM(amount), 0.00) INTO v_sangria
    FROM public.cash_transactions
    WHERE shift_id = p_shift_id
      AND UPPER(type) = 'SANGRIA';

    -- Cálculo do saldo esperado do sistema e da quebra de caixa
    v_system_amount := round(COALESCE(v_shift.initial_amount, 0.00) + v_cash_sales + v_suprimento - v_sangria, 2);
    v_diff := round(COALESCE(p_final_amount, 0.00) - v_system_amount, 2);

    -- Atualização do turno de caixa
    UPDATE public.cash_shifts
    SET status = 'CLOSED',
        closed_at = timezone('utc'::text, now()),
        final_amount = p_final_amount,
        system_amount = v_system_amount,
        difference = v_diff,
        notes = p_notes,
        closed_by_user_id = v_user_id
    WHERE id = p_shift_id;

    RETURN jsonb_build_object(
        'success', true,
        'shift_id', p_shift_id,
        'initial_amount', v_shift.initial_amount,
        'cash_sales', v_cash_sales,
        'suprimento', v_suprimento,
        'sangria', v_sangria,
        'system_amount', v_system_amount,
        'final_amount', p_final_amount,
        'difference', v_diff
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.close_cash_shift(bigint, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(bigint, numeric, text) TO authenticated;

-- 4.6. RPC: REGISTER_CASH_TRANSACTION
DROP FUNCTION IF EXISTS public.register_cash_transaction(bigint, text, numeric, text);

CREATE OR REPLACE FUNCTION public.register_cash_transaction(
    p_shift_id BIGINT,
    p_type TEXT,
    p_amount NUMERIC,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_user_net UUID;
    v_user_branch UUID;
    v_shift RECORD;
    v_trans_id BIGINT;
    v_created_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
    END IF;

    IF p_type NOT IN ('SANGRIA', 'SUPRIMENTO') THEN
        RAISE EXCEPTION 'Tipo de transação inválido. Permitido apenas SANGRIA ou SUPRIMENTO.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'O valor da transação deve ser maior que zero.';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'O motivo da transação é obrigatório e deve ter no mínimo 3 caracteres.';
    END IF;

    SELECT role, network_id, branch_id
    INTO v_user_role, v_user_net, v_user_branch
    FROM public.profiles
    WHERE id = v_user_id;

    -- Buscar o turno e validar
    SELECT * INTO v_shift FROM public.cash_shifts WHERE id = p_shift_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Turno #% não encontrado.', p_shift_id;
    END IF;

    IF v_shift.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Transação bloqueada: O turno #% não está aberto.', p_shift_id;
    END IF;

    IF v_user_role IS NOT NULL AND v_user_role <> 'super_admin' THEN
        IF v_user_role = 'network_admin' AND v_shift.network_id <> v_user_net THEN
            RAISE EXCEPTION 'Permissão negada: Turno pertence a outra rede.';
        ELSIF (v_user_role = 'branch_admin' OR v_user_role = 'cashier_operator' OR v_user_role = 'operator') AND v_shift.branch_id <> v_user_branch THEN
            RAISE EXCEPTION 'Permissão negada: Turno pertence a outra filial.';
        END IF;
    END IF;

    -- Inserir transação
    INSERT INTO public.cash_transactions (
        shift_id, type, amount, reason, user_id, created_at
    )
    VALUES (
        p_shift_id, p_type, p_amount, trim(p_reason), v_user_id, timezone('utc'::text, now())
    )
    RETURNING id, created_at INTO v_trans_id, v_created_at;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_trans_id,
        'shift_id', p_shift_id,
        'type', p_type,
        'amount', p_amount,
        'reason', trim(p_reason),
        'user_id', v_user_id,
        'created_at', v_created_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.register_cash_transaction(bigint, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_cash_transaction(bigint, text, numeric, text) TO authenticated;

-- 4.7. RPC: ADMIN_CONFIGURE_NEW_USER
DROP FUNCTION IF EXISTS public.admin_configure_new_user(uuid, text, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.admin_configure_new_user(
    p_user_id UUID,
    p_full_name TEXT,
    p_role TEXT,
    p_network_id UUID DEFAULT NULL,
    p_unit_id UUID DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_net UUID;
    v_caller_unit UUID;
    v_caller_branch UUID;
    v_target_net UUID;
    v_target_unit UUID;
    v_target_branch UUID;
    v_target_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
    END IF;

    v_caller_role := public.current_user_role();
    IF v_caller_role NOT IN ('super_admin', 'network_admin', 'unit_admin', 'branch_admin') THEN
        RAISE EXCEPTION 'Permissão negada: Apenas administradores e gerentes podem configurar novos usuários.';
    END IF;

    v_caller_net := public.current_user_network_id();
    v_caller_unit := public.current_user_unit_id();
    v_caller_branch := public.current_user_branch_id();

    v_target_role := p_role;
    v_target_net := p_network_id;
    v_target_unit := p_unit_id;
    v_target_branch := p_branch_id;

    -- Validação estrita de hierarquia
    IF v_caller_role <> 'super_admin' THEN
        IF v_target_role = 'super_admin' THEN
            RAISE EXCEPTION 'Permissão negada: Não é permitido atribuir o cargo super_admin.';
        END IF;
        -- Forçar a rede do usuário para a rede do administrador
        v_target_net := v_caller_net;

        IF v_caller_role = 'network_admin' THEN
            IF p_network_id IS NOT NULL AND p_network_id <> v_caller_net THEN
                RAISE EXCEPTION 'Permissão negada: Administrador de rede só pode vincular usuários à sua própria rede.';
            END IF;
        ELSIF v_caller_role = 'unit_admin' THEN
            IF p_unit_id IS NOT NULL AND p_unit_id <> v_caller_unit THEN
                RAISE EXCEPTION 'Permissão negada: Administrador de unidade só pode vincular usuários à sua própria unidade regional.';
            END IF;
            IF p_branch_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.branches b WHERE b.id = p_branch_id AND b.unit_id = v_caller_unit
            ) THEN
                RAISE EXCEPTION 'Permissão negada: A filial selecionada não pertence à sua unidade regional.';
            END IF;
            v_target_unit := v_caller_unit;
            IF v_target_role NOT IN ('branch_admin', 'cashier_operator', 'operator') THEN
                RAISE EXCEPTION 'Permissão negada: Administrador de unidade só pode atribuir cargos branch_admin ou cashier_operator.';
            END IF;
        ELSIF v_caller_role = 'branch_admin' THEN
            IF p_branch_id IS NOT NULL AND p_branch_id <> v_caller_branch THEN
                RAISE EXCEPTION 'Permissão negada: Administrador de filial só pode vincular usuários à sua própria filial.';
            END IF;
            v_target_unit := v_caller_unit;
            v_target_branch := v_caller_branch;
            IF v_target_role NOT IN ('branch_admin', 'cashier_operator', 'operator') THEN
                RAISE EXCEPTION 'Permissão negada: Administrador de filial só pode atribuir cargos branch_admin ou cashier_operator.';
            END IF;
        END IF;
    END IF;

    -- Preenchimento automático de unidade e rede com base na filial escolhida
    IF v_target_branch IS NOT NULL THEN
        SELECT b.unit_id, b.network_id INTO v_target_unit, v_target_net
        FROM public.branches b WHERE b.id = v_target_branch;
    ELSIF v_target_unit IS NOT NULL THEN
        SELECT u.network_id INTO v_target_net
        FROM public.units u WHERE u.id = v_target_unit;
    END IF;

    -- Confirmação imediata do e-mail do usuário recém-criado em auth.users
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = p_user_id;

    -- Atualiza os dados cadastrais e vínculos no perfil
    UPDATE public.profiles
    SET full_name = p_full_name,
        role = v_target_role,
        network_id = v_target_net,
        unit_id = v_target_unit,
        branch_id = v_target_branch
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', v_target_role,
        'network_id', v_target_net,
        'unit_id', v_target_unit,
        'branch_id', v_target_branch
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.admin_configure_new_user(uuid, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_configure_new_user(uuid, text, text, uuid, uuid, uuid) TO authenticated;

-- 4.8. RPC: ADMIN_DELETE_USER
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_net UUID;
    v_caller_unit UUID;
    v_caller_branch UUID;
    v_target_profile RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
    END IF;

    v_caller_role := public.current_user_role();
    IF v_caller_role NOT IN ('super_admin', 'network_admin', 'unit_admin', 'branch_admin') THEN
        RAISE EXCEPTION 'Permissão negada: Apenas administradores e gerentes podem excluir usuários.';
    END IF;

    -- Impedir auto-exclusão
    IF p_user_id = v_caller_id THEN
        RAISE EXCEPTION 'Operação inválida: Não é permitido excluir a própria conta de acesso.';
    END IF;

    SELECT * INTO v_target_profile FROM public.profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário não encontrado.';
    END IF;

    -- Impedir exclusão de super_admin por quem não for super_admin
    IF v_target_profile.role = 'super_admin' AND v_caller_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Permissão negada: Apenas super_admin pode excluir contas de super_admin.';
    END IF;

    v_caller_net := public.current_user_network_id();
    v_caller_unit := public.current_user_unit_id();
    v_caller_branch := public.current_user_branch_id();

    -- Verificar isolamento de escopo
    IF v_caller_role = 'network_admin' THEN
        IF v_target_profile.network_id IS DISTINCT FROM v_caller_net THEN
            RAISE EXCEPTION 'Permissão negada: Usuário pertence a outra rede.';
        END IF;
    ELSIF v_caller_role = 'unit_admin' THEN
        IF v_target_profile.network_id IS DISTINCT FROM v_caller_net THEN
            RAISE EXCEPTION 'Permissão negada: Usuário pertence a outra rede.';
        END IF;
        IF v_target_profile.role IN ('super_admin', 'network_admin', 'unit_admin') THEN
            RAISE EXCEPTION 'Permissão negada: Administrador de unidade só pode excluir operadores ou gerentes de filiais de sua regional.';
        END IF;
        IF v_target_profile.unit_id IS DISTINCT FROM v_caller_unit AND NOT EXISTS (
            SELECT 1 FROM public.branches b WHERE b.id = v_target_profile.branch_id AND b.unit_id = v_caller_unit
        ) THEN
            RAISE EXCEPTION 'Permissão negada: Usuário pertence a outra unidade regional.';
        END IF;
    ELSIF v_caller_role = 'branch_admin' THEN
        IF v_target_profile.network_id IS DISTINCT FROM v_caller_net OR v_target_profile.branch_id IS DISTINCT FROM v_caller_branch THEN
            RAISE EXCEPTION 'Permissão negada: Usuário pertence a outra filial.';
        END IF;
        IF v_target_profile.role IN ('super_admin', 'network_admin', 'unit_admin') THEN
            RAISE EXCEPTION 'Permissão negada: Gerente de filial só pode excluir usuários de sua própria filial.';
        END IF;
    END IF;

    -- Deletar do perfil e da tabela auth.users
    DELETE FROM public.profiles WHERE id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_user_id', p_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

COMMIT;
-- =========================================================================
-- FIM DA MIGRAÇÃO FASE 5: BLINDAGEM E RPCS TRANSACIONAIS
-- =========================================================================

