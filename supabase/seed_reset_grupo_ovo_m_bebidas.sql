-- =========================================================================
-- SEED DE RESET E CARGA OFICIAL: GRUPO OVO E M BEBIDAS
-- Preserva: networks, branches, cash_desks e profiles
-- Limpa: vendas, turnos, compras, movimentações e produtos legados
-- Cadastra: Categorias oficiais, catálogos e entradas de compras com NF
-- =========================================================================

-- 1. LIMPEZA SEGURA DOS DADOS OPERACIONAIS DE TESTE
DELETE FROM public.sale_items;
DELETE FROM public.sales;
DELETE FROM public.purchase_items;
DELETE FROM public.purchases;
DELETE FROM public.stock_movements;
DELETE FROM public.cash_transactions;
DELETE FROM public.cash_shifts;
DELETE FROM public.products;

-- Ajustar unicidade de SKU por Unidade (branch_id + sku) em vez de global
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_branch_sku_key;
ALTER TABLE public.products ADD CONSTRAINT products_branch_sku_key UNIQUE (branch_id, sku);

-- 2. GARANTIR CATEGORIAS OFICIAIS
INSERT INTO public.categories (name, description)
SELECT c.name, c.description
FROM (VALUES 
    ('Ovos', 'Ovos brancos, caipiras e especiais selecionados'),
    ('Mercearia', 'Itens básicos de despensa e cereais'),
    ('Águas', 'Águas minerais com/sem gás e galões retornáveis'),
    ('Cervejas', 'Cervejas puro malte, tradicionais e especiais'),
    ('Whiskys & Destilados', 'Whiskys importados 12 anos e destilados nobres')
) AS c(name, description)
WHERE NOT EXISTS (
    SELECT 1 FROM public.categories cat WHERE lower(trim(cat.name)) = lower(trim(c.name))
);

-- 3. CARGA OPERACIONAL VIA BLOCO ANÔNIMO PL/PGSQL
DO $$
DECLARE
    v_net_ovo UUID;
    v_net_mbeb UUID;
    v_branch RECORD;
    v_cat_ovos INT;
    v_cat_merc INT;
    v_cat_aguas INT;
    v_cat_cerv INT;
    v_cat_dest INT;
    v_purchase_id INT;
    v_prod_id INT;
    v_admin_id UUID;
BEGIN
    -- Obter IDs das categorias
    SELECT id INTO v_cat_ovos FROM public.categories WHERE lower(trim(name)) = 'ovos' LIMIT 1;
    SELECT id INTO v_cat_merc FROM public.categories WHERE lower(trim(name)) = 'mercearia' LIMIT 1;
    SELECT id INTO v_cat_aguas FROM public.categories WHERE lower(trim(name)) = 'águas' LIMIT 1;
    SELECT id INTO v_cat_cerv FROM public.categories WHERE lower(trim(name)) = 'cervejas' LIMIT 1;
    SELECT id INTO v_cat_dest FROM public.categories WHERE lower(trim(name)) = 'whiskys & destilados' LIMIT 1;

    -- Obter ID do Super Admin ou primeiro Admin para registrar compras
    SELECT id INTO v_admin_id FROM public.profiles WHERE role IN ('super_admin', 'network_admin') ORDER BY created_at ASC LIMIT 1;

    -- Localizar Redes
    SELECT id INTO v_net_ovo FROM public.networks WHERE name ILIKE '%Grupo OVO%' LIMIT 1;
    SELECT id INTO v_net_mbeb FROM public.networks WHERE name ILIKE '%M Bebidas%' LIMIT 1;

    -- =========================================================================
    -- REDE 1: GRUPO OVO (Cadastrar produtos e compras em cada unidade ativa)
    -- =========================================================================
    IF v_net_ovo IS NOT NULL THEN
        FOR v_branch IN 
            SELECT id, name FROM public.branches WHERE network_id = v_net_ovo
        LOOP
            -- Criar registro de Compra (Total = R$ 4.789,00)
            INSERT INTO public.purchases (
                network_id, branch_id, user_id, supplier, invoice_number, total_amount, date, created_at
            ) VALUES (
                v_net_ovo, v_branch.id, v_admin_id, 'Granja & Atacado Nordeste', 'NF-OVO-001', 4789.00, now(), now()
            ) RETURNING id INTO v_purchase_id;

            -- 1. Bandeja de Ovos Brancos 15 un (60 un * 9.50 = 570.00 | Venda: 14.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Bandeja de Ovos Brancos 15 un', 'OVO-B15', v_cat_ovos, 9.50, 14.00, 60, 15, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 60, 9.50);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 60, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());

            -- 2. Bandeja de Ovos Caipira 15 un (40 un * 11.00 = 440.00 | Venda: 16.50)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Bandeja de Ovos Caipira 15 un', 'OVO-C15', v_cat_ovos, 11.00, 16.50, 40, 10, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 40, 11.00);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 40, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());

            -- 3. Bandeja de Ovos Brancos 30 un (80 un * 17.50 = 1400.00 | Venda: 25.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Bandeja de Ovos Brancos 30 un', 'OVO-B30', v_cat_ovos, 17.50, 25.00, 80, 20, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 80, 17.50);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 80, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());

            -- 4. Bandeja de Ovos Extra 30 un (50 un * 19.50 = 975.00 | Venda: 28.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Bandeja de Ovos Extra 30 un', 'OVO-E30', v_cat_ovos, 19.50, 28.00, 50, 15, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 50, 19.50);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 50, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());

            -- 5. Açúcar Cristal 1kg (100 un * 3.40 = 340.00 | Venda: 5.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Açúcar Cristal 1kg', 'MER-ACU1', v_cat_merc, 3.40, 5.00, 100, 20, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 100, 3.40);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 100, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());

            -- 6. Feijão Carioca Tipo 1 1kg (80 un * 5.80 = 464.00 | Venda: 8.50)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Feijão Carioca Tipo 1 1kg', 'MER-FEIC1', v_cat_merc, 5.80, 8.50, 80, 20, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 80, 5.80);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 80, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());

            -- 7. Feijão Preto Tipo 1 1kg (60 un * 6.00 = 360.00 | Venda: 8.90)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Feijão Preto Tipo 1 1kg', 'MER-FEIP1', v_cat_merc, 6.00, 8.90, 60, 15, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 60, 6.00);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 60, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());

            -- 8. Água Mineral sem Gás 500ml (120 un * 1.10 = 132.00 | Venda: 2.50)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Água Mineral sem Gás 500ml', 'AGU-500', v_cat_aguas, 1.10, 2.50, 120, 24, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 120, 1.10);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 120, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());

            -- 9. Água Mineral sem Gás 1,5L (60 un * 1.80 = 108.00 | Venda: 4.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_ovo, v_branch.id, 'Água Mineral sem Gás 1,5L', 'AGU-1500', v_cat_aguas, 1.80, 4.00, 60, 12, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 60, 1.80);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_ovo, v_branch.id, v_prod_id, 'IN', 60, 'PURCHASE', 'Entrada de compra NF-OVO-001', v_admin_id, now());
        END LOOP;
    END IF;

    -- =========================================================================
    -- REDE 2: M BEBIDAS (Cadastrar produtos e compras na Unidade JP 01)
    -- =========================================================================
    IF v_net_mbeb IS NOT NULL THEN
        FOR v_branch IN 
            SELECT id, name FROM public.branches WHERE network_id = v_net_mbeb
        LOOP
            -- Criar registro de Compra (Total = R$ 6.097,00)
            INSERT INTO public.purchases (
                network_id, branch_id, user_id, supplier, invoice_number, total_amount, date, created_at
            ) VALUES (
                v_net_mbeb, v_branch.id, v_admin_id, 'Distribuidora Ambev & Importados', 'NF-MBEB-001', 6097.00, now(), now()
            ) RETURNING id INTO v_purchase_id;

            -- 1. Cerveja Heineken 600ml (72 un * 9.20 = 662.40 | Venda: 14.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_mbeb, v_branch.id, 'Cerveja Heineken 600ml', 'BEB-HEI600', v_cat_cerv, 9.20, 14.00, 72, 24, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 72, 9.20);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_mbeb, v_branch.id, v_prod_id, 'IN', 72, 'PURCHASE', 'Entrada de compra NF-MBEB-001', v_admin_id, now());

            -- 2. Cerveja Spaten 600ml (72 un * 7.80 = 561.60 | Venda: 12.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_mbeb, v_branch.id, 'Cerveja Spaten 600ml', 'BEB-SPA600', v_cat_cerv, 7.80, 12.00, 72, 24, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 72, 7.80);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_mbeb, v_branch.id, v_prod_id, 'IN', 72, 'PURCHASE', 'Entrada de compra NF-MBEB-001', v_admin_id, now());

            -- 3. Cerveja Brahma Duplo Malte 350ml (120 un * 3.10 = 372.00 | Venda: 5.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_mbeb, v_branch.id, 'Cerveja Brahma Duplo Malte 350ml', 'BEB-BRA350', v_cat_cerv, 3.10, 5.00, 120, 36, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 120, 3.10);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_mbeb, v_branch.id, v_prod_id, 'IN', 120, 'PURCHASE', 'Entrada de compra NF-MBEB-001', v_admin_id, now());

            -- 4. Cerveja Corona Long Neck 330ml (60 un * 5.50 = 330.00 | Venda: 8.50)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_mbeb, v_branch.id, 'Cerveja Corona Long Neck 330ml', 'BEB-COR330', v_cat_cerv, 5.50, 8.50, 60, 24, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 60, 5.50);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_mbeb, v_branch.id, v_prod_id, 'IN', 60, 'PURCHASE', 'Entrada de compra NF-MBEB-001', v_admin_id, now());

            -- 5. Água Mineral Galão 20L (50 un * 6.50 = 325.00 | Venda: 12.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_mbeb, v_branch.id, 'Água Mineral Galão 20L', 'BEB-GAL20L', v_cat_aguas, 6.50, 12.00, 50, 10, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 50, 6.50);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_mbeb, v_branch.id, v_prod_id, 'IN', 50, 'PURCHASE', 'Entrada de compra NF-MBEB-001', v_admin_id, now());

            -- 6. Whisky Johnnie Walker Red Label 1L (15 un * 72.00 = 1080.00 | Venda: 110.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_mbeb, v_branch.id, 'Whisky Johnnie Walker Red Label 1L', 'WHI-RED1L', v_cat_dest, 72.00, 110.00, 15, 4, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 15, 72.00);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_mbeb, v_branch.id, v_prod_id, 'IN', 15, 'PURCHASE', 'Entrada de compra NF-MBEB-001', v_admin_id, now());

            -- 7. Whisky Johnnie Walker Black Label 1L (10 un * 135.00 = 1350.00 | Venda: 199.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_mbeb, v_branch.id, 'Whisky Johnnie Walker Black Label 1L', 'WHI-BLK1L', v_cat_dest, 135.00, 199.00, 10, 3, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 10, 135.00);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_mbeb, v_branch.id, v_prod_id, 'IN', 10, 'PURCHASE', 'Entrada de compra NF-MBEB-001', v_admin_id, now());

            -- 8. Whisky Old Parr 12 Anos 1L (12 un * 118.00 = 1416.00 | Venda: 175.00)
            INSERT INTO public.products (network_id, branch_id, name, sku, category_id, cost_price, sale_price, stock_quantity, min_stock, unit, is_active)
            VALUES (v_net_mbeb, v_branch.id, 'Whisky Old Parr 12 Anos 1L', 'WHI-OLD1L', v_cat_dest, 118.00, 175.00, 12, 3, 'un', true)
            RETURNING id INTO v_prod_id;
            INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (v_purchase_id, v_prod_id, 12, 118.00);
            INSERT INTO public.stock_movements (network_id, branch_id, product_id, movement_type, quantity, origin, note, user_id, date)
            VALUES (v_net_mbeb, v_branch.id, v_prod_id, 'IN', 12, 'PURCHASE', 'Entrada de compra NF-MBEB-001', v_admin_id, now());
        END LOOP;
    END IF;
END $$;
