-- =========================================================================
-- GIRO - MIGRAÇÃO DA ARQUITETURA DE REDES, UNIDADES, FILIAIS E MULTI-CAIXAS
-- Execute este script no SQL Editor do Supabase Giro
-- =========================================================================

-- 1. TABELA DE REDES (NETWORKS)
CREATE TABLE IF NOT EXISTS public.networks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    document_cnpj TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TABELA DE UNIDADES / POLOS REGIONAIS (UNITS)
CREATE TABLE IF NOT EXISTS public.units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    city TEXT,
    state TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. TABELA DE FILIAIS / LOJAS (BRANCHES)
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. TABELA DE TERMINAIS DE CAIXA (CASH_DESKS) - MULTI-CAIXAS POR FILIAL
CREATE TABLE IF NOT EXISTS public.cash_desks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,          -- Ex: "Caixa 01", "Caixa Rápido", "Caixa Balcão"
    code TEXT,                  -- Ex: "CX-01"
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. ATUALIZAR TABELA DE PERFIS DE USUÁRIOS COM A HIERARQUIA COMPLETA
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES public.networks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- 6. ATUALIZAR O SUPER ADMIN (munizsheik08@gmail.com)
UPDATE public.profiles
SET role = 'super_admin'
WHERE email = 'munizsheik08@gmail.com';

-- 7. ATUALIZAR TABELAS OPERACIONAIS PARA VINCULAR À FILIAL E REDE
-- Produtos: Cada filial cadastra e tem seu estoque autônomo
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES public.networks(id) ON DELETE CASCADE;

-- Turnos de Caixa: Cada turno ocorre em um terminal (cash_desk) de uma filial
ALTER TABLE public.cash_shifts
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS cash_desk_id UUID REFERENCES public.cash_desks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES public.networks(id) ON DELETE CASCADE;

-- Vendas: Cada venda pertence a uma filial, um terminal de caixa e rede
ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS cash_desk_id UUID REFERENCES public.cash_desks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES public.networks(id) ON DELETE CASCADE;

-- Compras e Entradas:
ALTER TABLE public.purchases
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES public.networks(id) ON DELETE CASCADE;

-- Movimentações de Estoque:
ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS network_id UUID REFERENCES public.networks(id) ON DELETE CASCADE;

-- 8. HABILITAR ROW LEVEL SECURITY (RLS) E POLÍTICAS DE ACESSO
ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_desks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso completo a networks" ON public.networks FOR ALL USING (true);
CREATE POLICY "Acesso completo a units" ON public.units FOR ALL USING (true);
CREATE POLICY "Acesso completo a branches" ON public.branches FOR ALL USING (true);
CREATE POLICY "Acesso completo a cash_desks" ON public.cash_desks FOR ALL USING (true);

-- 9. FUNÇÃO RPC ATUALIZADA: CRIAR VENDA VINCULADA À FILIAL E AO CAIXA
CREATE OR REPLACE FUNCTION public.create_complete_sale(
    p_payment_method TEXT,
    p_items JSONB,
    p_user_id UUID DEFAULT NULL,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_shift_id BIGINT DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_cash_desk_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_sale_id BIGINT;
    v_gross_amount NUMERIC(10, 2) := 0;
    v_net_amount NUMERIC(10, 2) := 0;
    v_item JSONB;
    v_product RECORD;
    v_qty INTEGER;
    v_price NUMERIC(10, 2);
    v_network_id UUID := NULL;
BEGIN
    -- Se houver filial, pegar o network_id dela
    IF p_branch_id IS NOT NULL THEN
        SELECT network_id INTO v_network_id FROM public.branches WHERE id = p_branch_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INTEGER;
        
        SELECT id, name, sale_price, stock_quantity, is_active
        INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::BIGINT;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto ID % não encontrado.', (v_item->>'product_id');
        END IF;

        IF NOT v_product.is_active THEN
            RAISE EXCEPTION 'O produto "%" está inativo.', v_product.name;
        END IF;

        IF v_product.stock_quantity < v_qty THEN
            RAISE EXCEPTION 'Estoque insuficiente para "%". Disponível: %, Solicitado: %', 
                v_product.name, v_product.stock_quantity, v_qty;
        END IF;

        v_price := v_product.sale_price;
        v_gross_amount := v_gross_amount + (v_qty * v_price);
    END LOOP;

    v_net_amount := GREATEST(0.00, v_gross_amount - COALESCE(p_discount_amount, 0.00));

    INSERT INTO public.sales (
        total_amount, discount_amount, payment_method, user_id, shift_id, 
        branch_id, cash_desk_id, network_id, status
    )
    VALUES (
        v_net_amount, COALESCE(p_discount_amount, 0.00), p_payment_method, p_user_id, p_shift_id,
        p_branch_id, p_cash_desk_id, v_network_id, 'COMPLETED'
    )
    RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INTEGER;

        SELECT sale_price INTO v_price
        FROM public.products
        WHERE id = (v_item->>'product_id')::BIGINT;

        INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price)
        VALUES (v_sale_id, (v_item->>'product_id')::BIGINT, v_qty, v_price);

        UPDATE public.products
        SET stock_quantity = stock_quantity - v_qty,
            updated_at = timezone('utc'::text, now())
        WHERE id = (v_item->>'product_id')::BIGINT;

        INSERT INTO public.stock_movements (
            product_id, movement_type, quantity, origin, note, user_id, branch_id, network_id
        )
        VALUES (
            (v_item->>'product_id')::BIGINT,
            'OUT',
            v_qty,
            'SALE',
            'Venda #' || v_sale_id,
            p_user_id,
            p_branch_id,
            v_network_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'gross_amount', v_gross_amount,
        'discount_amount', COALESCE(p_discount_amount, 0.00),
        'total_amount', v_net_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
