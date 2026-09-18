-- =========================================================================
-- SEED DE 20 PRODUTOS COM 50 UNIDADES CADA - FINISH BEBIDAS
-- =========================================================================

-- 1. Inserir Categorias Principais (caso ainda não existam)
INSERT INTO public.categories (name, description) VALUES
('Cervejas', 'Cervejas em lata, long neck e garrafas'),
('Destilados', 'Whiskies, vodkas, gins e cachaças'),
('Refrigerantes', 'Refrigerantes em lata e garrafa'),
('Energéticos', 'Energéticos de marcas variadas'),
('Sucos e Águas', 'Água mineral, água de coco e sucos prontos'),
('Petiscos e Gelo', 'Salgadinhos, amendoins, gelo e carvão')
ON CONFLICT (name) DO NOTHING;

-- 2. Inserir 20 Produtos Variados (com 50 unidades em estoque cada)
DO $$
DECLARE
    v_cat_cervejas BIGINT;
    v_cat_destilados BIGINT;
    v_cat_refrigerantes BIGINT;
    v_cat_energeticos BIGINT;
    v_cat_sucos BIGINT;
    v_cat_petiscos BIGINT;
BEGIN
    SELECT id INTO v_cat_cervejas FROM public.categories WHERE name = 'Cervejas' LIMIT 1;
    SELECT id INTO v_cat_destilados FROM public.categories WHERE name = 'Destilados' LIMIT 1;
    SELECT id INTO v_cat_refrigerantes FROM public.categories WHERE name = 'Refrigerantes' LIMIT 1;
    SELECT id INTO v_cat_energeticos FROM public.categories WHERE name = 'Energéticos' LIMIT 1;
    SELECT id INTO v_cat_sucos FROM public.categories WHERE name = 'Sucos e Águas' LIMIT 1;
    SELECT id INTO v_cat_petiscos FROM public.categories WHERE name = 'Petiscos e Gelo' LIMIT 1;

    -- Inserir / Atualizar os 20 produtos
    INSERT INTO public.products (sku, name, description, cost_price, sale_price, stock_quantity, min_stock, unit, is_active, category_id)
    VALUES
    -- Cervejas (6 produtos)
    ('7891991000826', 'Cerveja Heineken Long Neck 330ml', 'Cerveja Premium Puro Malte', 4.80, 7.99, 50, 10, 'un', true, v_cat_cervejas),
    ('7891991010832', 'Cerveja Corona Extra 330ml', 'Cerveja Clara Tipo Pilsen', 5.20, 8.49, 50, 10, 'un', true, v_cat_cervejas),
    ('7891149103218', 'Cerveja Amstel Lager Lata 350ml', 'Cerveja Puro Malte Holandesa', 2.89, 4.49, 50, 12, 'un', true, v_cat_cervejas),
    ('7891991015110', 'Cerveja Stella Artois 330ml', 'Cerveja Premium Belga', 4.50, 7.49, 50, 10, 'un', true, v_cat_cervejas),
    ('7891149200115', 'Cerveja Brahma Chopp Lata 350ml', 'Cerveja Pilsen Tradicional', 2.59, 3.99, 50, 15, 'un', true, v_cat_cervejas),
    ('7891149107803', 'Cerveja Spaten Puro Malte Lata 350ml', 'Cerveja Munich Helles Alemã', 3.20, 4.99, 50, 12, 'un', true, v_cat_cervejas),

    -- Destilados (4 produtos)
    ('5000267014203', 'Whisky Johnnie Walker Red Label 1L', 'Whisky Escocês Blended Scotch', 68.00, 99.90, 50, 5, 'un', true, v_cat_destilados),
    ('7312040017088', 'Vodka Absolut Original 1L', 'Vodka Sueca Premium', 62.00, 89.90, 50, 5, 'un', true, v_cat_destilados),
    ('5010103917409', 'Gin Tanqueray London Dry 750ml', 'Gin Importado Premium', 75.00, 114.90, 50, 5, 'un', true, v_cat_destilados),
    ('7891079000106', 'Cachaça 51 Tradicional 965ml', 'Cachaça Brasileira Clássica', 10.50, 16.90, 50, 8, 'un', true, v_cat_destilados),

    -- Refrigerantes (3 produtos)
    ('7894900011517', 'Coca-Cola Original Lata 350ml', 'Refrigerante de Cola', 2.40, 4.50, 50, 15, 'un', true, v_cat_refrigerantes),
    ('7894900010015', 'Coca-Cola Original 2 Litros', 'Refrigerante de Cola Garrafa PET', 6.20, 10.99, 50, 10, 'un', true, v_cat_refrigerantes),
    ('7891991000789', 'Guaraná Antarctica Lata 350ml', 'Refrigerante Tradicional de Guaraná', 2.20, 4.00, 50, 15, 'un', true, v_cat_refrigerantes),

    -- Energéticos (3 produtos)
    ('9002490100070', 'Energético Red Bull Energy Drink 250ml', 'Energético Suíço Original', 6.10, 9.99, 50, 12, 'un', true, v_cat_energeticos),
    ('7898080640017', 'Energético Monster Energy 473ml', 'Energético Original Verde', 6.80, 10.99, 50, 12, 'un', true, v_cat_energeticos),
    ('7898080640109', 'Energético Monster Energy Ultra 473ml', 'Energético Zero Açúcar Branco', 6.80, 10.99, 50, 12, 'un', true, v_cat_energeticos),

    -- Sucos e Águas (2 produtos)
    ('7896005800102', 'Água Mineral Crystal Sem Gás 500ml', 'Água Mineral Natural', 0.90, 2.50, 50, 20, 'un', true, v_cat_sucos),
    ('7896005800201', 'Água Mineral Crystal Com Gás 500ml', 'Água Mineral Gasosa', 1.10, 3.00, 50, 15, 'un', true, v_cat_sucos),

    -- Petiscos e Gelo (2 produtos)
    ('7892840222000', 'Batata Pringles Original 114g', 'Salgadinho de Batata Crocante', 8.50, 14.90, 50, 8, 'un', true, v_cat_petiscos),
    ('7898910000010', 'Saco de Gelo Filtrado em Cubos 5kg', 'Gelo Puro em Cubos Especial para Bebidas', 5.00, 11.90, 50, 50, 'un', true, v_cat_petiscos)

    ON CONFLICT (sku) DO UPDATE
    SET stock_quantity = 50,
        cost_price = EXCLUDED.cost_price,
        sale_price = EXCLUDED.sale_price,
        is_active = true;

END $$;
