const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Carregar variáveis do .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2]||'').replace(/^"|"$/g, '').trim();
});

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function runCleanSeed() {
  console.log('====================================================');
  console.log('--- INICIANDO SEED DE RESET E CARGA OFICIAL ---');
  console.log('====================================================');

  // 1. Autenticar como Super Admin
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: 'super@giro.com',
    password: '123456'
  });

  if (authError || !authData.user) {
    console.error('Falha na autenticação do Super Admin:', authError);
    process.exit(1);
  }
  const superAdminId = authData.user.id;
  console.log(`[OK] Super Admin autenticado: ${superAdminId}`);

  // 2. Garantir Categorias Oficiais
  const categoriesToEnsure = [
    { name: 'Ovos', description: 'Ovos brancos, caipiras e especiais selecionados' },
    { name: 'Mercearia', description: 'Itens básicos de despensa e cereais' },
    { name: 'Águas', description: 'Águas minerais com/sem gás e galões retornáveis' },
    { name: 'Cervejas', description: 'Cervejas puro malte, tradicionais e especiais' },
    { name: 'Whiskys & Destilados', description: 'Whiskys importados 12 anos e destilados nobres' }
  ];

  const categoryMap = {};
  for (const cat of categoriesToEnsure) {
    const { data: existing } = await client
      .from('categories')
      .select('id, name')
      .ilike('name', cat.name)
      .limit(1);

    if (existing && existing.length > 0) {
      categoryMap[cat.name] = existing[0].id;
    } else {
      const { data: inserted, error: catErr } = await client
        .from('categories')
        .insert({ name: cat.name, description: cat.description })
        .select()
        .single();
      if (catErr) {
        console.error(`Erro ao criar categoria ${cat.name}:`, catErr);
      } else {
        categoryMap[cat.name] = inserted.id;
      }
    }
  }
  console.log('[OK] Categorias mapeadas:', categoryMap);

  // 3. Buscar Redes e Unidades
  const { data: networks } = await client.from('networks').select('*');
  const { data: branches } = await client.from('branches').select('*');

  const netOvo = networks.find(n => n.name.toLowerCase().includes('ovo'));
  const netMbeb = networks.find(n => n.name.toLowerCase().includes('bebidas'));

  if (!netOvo || !netMbeb) {
    console.error('Redes Grupo OVO ou M Bebidas não encontradas!');
    process.exit(1);
  }

  const branchesOvo = branches.filter(b => b.network_id === netOvo.id);
  const branchesMbeb = branches.filter(b => b.network_id === netMbeb.id);

  console.log(`Grupo OVO ID: ${netOvo.id} (Unidades: ${branchesOvo.map(b => b.name).join(', ')})`);
  console.log(`M Bebidas ID: ${netMbeb.id} (Unidades: ${branchesMbeb.map(b => b.name).join(', ')})`);

  // Desativar produtos legados antigos que não pertencem ao novo catálogo oficial
  const officialSkus = [
    'OVO-B15', 'OVO-C15', 'OVO-B30', 'OVO-E30', 'MER-ACU1', 'MER-FEIC1', 'MER-FEIP1', 'AGU-500', 'AGU-1500',
    'BEB-HEI600', 'BEB-SPA600', 'BEB-BRA350', 'BEB-COR330', 'BEB-GAL20L', 'WHI-RED1L', 'WHI-BLK1L', 'WHI-OLD1L'
  ];
  await client.from('products').update({ is_active: false }).not('sku', 'in', `(${officialSkus.join(',')})`);

  // 4. Catálogo do Grupo OVO
  const produtosOvo = [
    { name: 'Bandeja de Ovos Brancos 15 un', sku: 'OVO-B15', cat: 'Ovos', cost: 9.50, sale: 14.00, qty: 60, min: 15 },
    { name: 'Bandeja de Ovos Caipira 15 un', sku: 'OVO-C15', cat: 'Ovos', cost: 11.00, sale: 16.50, qty: 40, min: 10 },
    { name: 'Bandeja de Ovos Brancos 30 un', sku: 'OVO-B30', cat: 'Ovos', cost: 17.50, sale: 25.00, qty: 80, min: 20 },
    { name: 'Bandeja de Ovos Extra 30 un', sku: 'OVO-E30', cat: 'Ovos', cost: 19.50, sale: 28.00, qty: 50, min: 15 },
    { name: 'Açúcar Cristal 1kg', sku: 'MER-ACU1', cat: 'Mercearia', cost: 3.40, sale: 5.00, qty: 100, min: 20 },
    { name: 'Feijão Carioca Tipo 1 1kg', sku: 'MER-FEIC1', cat: 'Mercearia', cost: 5.80, sale: 8.50, qty: 80, min: 20 },
    { name: 'Feijão Preto Tipo 1 1kg', sku: 'MER-FEIP1', cat: 'Mercearia', cost: 6.00, sale: 8.90, qty: 60, min: 15 },
    { name: 'Água Mineral sem Gás 500ml', sku: 'AGU-500', cat: 'Águas', cost: 1.10, sale: 2.50, qty: 120, min: 24 },
    { name: 'Água Mineral sem Gás 1,5L', sku: 'AGU-1500', cat: 'Águas', cost: 1.80, sale: 4.00, qty: 60, min: 12 }
  ];

  // Unidade principal do Grupo OVO (centro)
  const mainBranchOvo = branchesOvo.find(b => b.name.toLowerCase().includes('centro')) || branchesOvo[0];
  console.log(`\nInserindo catálogo e compra na Unidade principal "${mainBranchOvo.name}" do Grupo OVO...`);

  const totalCompraOvo = produtosOvo.reduce((sum, p) => sum + (p.cost * p.qty), 0);
  const totalVendaOvo = produtosOvo.reduce((sum, p) => sum + (p.sale * p.qty), 0);
  const lucroOvo = totalVendaOvo - totalCompraOvo;

  // Verificar se já existe compra NF-OVO-001
  const { data: existingPurchOvo } = await client
    .from('purchases')
    .select('id')
    .eq('invoice_number', 'NF-OVO-001')
    .limit(1);

  let purchaseOvoId = existingPurchOvo?.[0]?.id;

  if (!purchaseOvoId) {
    const { data: purchaseOvo, error: purchErr } = await client
      .from('purchases')
      .insert({
        network_id: netOvo.id,
        branch_id: mainBranchOvo.id,
        user_id: superAdminId,
        supplier: 'Granja & Atacado Nordeste',
        invoice_number: 'NF-OVO-001',
        total_amount: totalCompraOvo,
        date: new Date().toISOString()
      })
      .select()
      .single();

    if (purchErr) throw purchErr;
    purchaseOvoId = purchaseOvo.id;
  }

  for (const p of produtosOvo) {
    // Upsert do produto
    const { data: existingProd } = await client
      .from('products')
      .select('id')
      .eq('sku', p.sku)
      .limit(1);

    let prodId;
    if (existingProd && existingProd.length > 0) {
      prodId = existingProd[0].id;
      await client.from('products').update({
        network_id: netOvo.id,
        branch_id: null,
        name: p.name,
        category_id: categoryMap[p.cat],
        cost_price: p.cost,
        sale_price: p.sale,
        stock_quantity: p.qty,
        min_stock: p.min,
        unit: 'un',
        is_active: true
      }).eq('id', prodId);
    } else {
      const { data: newProd, error: prodErr } = await client
        .from('products')
        .insert({
          network_id: netOvo.id,
          branch_id: null,
          name: p.name,
          sku: p.sku,
          category_id: categoryMap[p.cat],
          cost_price: p.cost,
          sale_price: p.sale,
          stock_quantity: p.qty,
          min_stock: p.min,
          unit: 'un',
          is_active: true
        })
        .select()
        .single();
      if (prodErr) throw prodErr;
      prodId = newProd.id;
    }

    // Purchase Item
    const { data: existingItem } = await client
      .from('purchase_items')
      .select('id')
      .eq('purchase_id', purchaseOvoId)
      .eq('product_id', prodId);

    if (!existingItem || existingItem.length === 0) {
      await client.from('purchase_items').insert({
        purchase_id: purchaseOvoId,
        product_id: prodId,
        quantity: p.qty,
        unit_cost: p.cost
      });
    }

    // Stock Movement
    const { data: existingMvt } = await client
      .from('stock_movements')
      .select('id')
      .eq('product_id', prodId)
      .eq('origin', 'PURCHASE')
      .ilike('note', '%NF-OVO-001%');

    if (!existingMvt || existingMvt.length === 0) {
      await client.from('stock_movements').insert({
        network_id: netOvo.id,
        branch_id: mainBranchOvo.id,
        product_id: prodId,
        movement_type: 'IN',
        quantity: p.qty,
        origin: 'PURCHASE',
        note: `Entrada oficial NF-OVO-001 (${p.qty} un)`,
        user_id: superAdminId,
        date: new Date().toISOString()
      });
    }
  }

  console.log(`[OK] Grupo OVO (Unidade ${mainBranchOvo.name}): 9 produtos cadastrados com NF-OVO-001.`);
  console.log(`     Investimento Total: R$ ${totalCompraOvo.toFixed(2)} | Venda Projetada: R$ ${totalVendaOvo.toFixed(2)} | Lucro: R$ ${lucroOvo.toFixed(2)}`);

  // 5. Catálogo da Rede M Bebidas
  const produtosMbeb = [
    { name: 'Cerveja Heineken 600ml', sku: 'BEB-HEI600', cat: 'Cervejas', cost: 9.20, sale: 14.00, qty: 72, min: 24 },
    { name: 'Cerveja Spaten 600ml', sku: 'BEB-SPA600', cat: 'Cervejas', cost: 7.80, sale: 12.00, qty: 72, min: 24 },
    { name: 'Cerveja Brahma Duplo Malte 350ml', sku: 'BEB-BRA350', cat: 'Cervejas', cost: 3.10, sale: 5.00, qty: 120, min: 36 },
    { name: 'Cerveja Corona Long Neck 330ml', sku: 'BEB-COR330', cat: 'Cervejas', cost: 5.50, sale: 8.50, qty: 60, min: 24 },
    { name: 'Água Mineral Galão 20L', sku: 'BEB-GAL20L', cat: 'Águas', cost: 6.50, sale: 12.00, qty: 50, min: 10 },
    { name: 'Whisky Johnnie Walker Red Label 1L', sku: 'WHI-RED1L', cat: 'Whiskys & Destilados', cost: 72.00, sale: 110.00, qty: 15, min: 4 },
    { name: 'Whisky Johnnie Walker Black Label 1L', sku: 'WHI-BLK1L', cat: 'Whiskys & Destilados', cost: 135.00, sale: 199.00, qty: 10, min: 3 },
    { name: 'Whisky Old Parr 12 Anos 1L', sku: 'WHI-OLD1L', cat: 'Whiskys & Destilados', cost: 118.00, sale: 175.00, qty: 12, min: 3 }
  ];

  const branchMbeb = branchesMbeb[0] || { id: null, name: 'Unidade Geral' };
  console.log(`\nInserindo catálogo e compra na Unidade "${branchMbeb.name}" da M Bebidas...`);

  const totalCompraMbeb = produtosMbeb.reduce((sum, p) => sum + (p.cost * p.qty), 0);
  const totalVendaMbeb = produtosMbeb.reduce((sum, p) => sum + (p.sale * p.qty), 0);
  const lucroMbeb = totalVendaMbeb - totalCompraMbeb;

  // Criar compra NF-MBEB-001 se não existir
  const { data: existingPurchMbeb } = await client
    .from('purchases')
    .select('id')
    .eq('invoice_number', 'NF-MBEB-001')
    .limit(1);

  let purchaseMbebId = existingPurchMbeb?.[0]?.id;

  if (!purchaseMbebId) {
    const { data: purchaseMbeb, error: purchErr } = await client
      .from('purchases')
      .insert({
        network_id: netMbeb.id,
        branch_id: branchMbeb.id,
        user_id: superAdminId,
        supplier: 'Distribuidora Ambev & Importados',
        invoice_number: 'NF-MBEB-001',
        total_amount: totalCompraMbeb,
        date: new Date().toISOString()
      })
      .select()
      .single();

    if (purchErr) throw purchErr;
    purchaseMbebId = purchaseMbeb.id;
  }

  for (const p of produtosMbeb) {
    const { data: existingProd } = await client
      .from('products')
      .select('id')
      .eq('sku', p.sku)
      .limit(1);

    let prodId;
    if (existingProd && existingProd.length > 0) {
      prodId = existingProd[0].id;
      await client.from('products').update({
        network_id: netMbeb.id,
        branch_id: null,
        name: p.name,
        category_id: categoryMap[p.cat],
        cost_price: p.cost,
        sale_price: p.sale,
        stock_quantity: p.qty,
        min_stock: p.min,
        unit: 'un',
        is_active: true
      }).eq('id', prodId);
    } else {
      const { data: newProd, error: prodErr } = await client
        .from('products')
        .insert({
          network_id: netMbeb.id,
          branch_id: null,
          name: p.name,
          sku: p.sku,
          category_id: categoryMap[p.cat],
          cost_price: p.cost,
          sale_price: p.sale,
          stock_quantity: p.qty,
          min_stock: p.min,
          unit: 'un',
          is_active: true
        })
        .select()
        .single();
      if (prodErr) throw prodErr;
      prodId = newProd.id;
    }

    const { data: existingItem } = await client
      .from('purchase_items')
      .select('id')
      .eq('purchase_id', purchaseMbebId)
      .eq('product_id', prodId);

    if (!existingItem || existingItem.length === 0) {
      await client.from('purchase_items').insert({
        purchase_id: purchaseMbebId,
        product_id: prodId,
        quantity: p.qty,
        unit_cost: p.cost
      });
    }

    const { data: existingMvt } = await client
      .from('stock_movements')
      .select('id')
      .eq('product_id', prodId)
      .eq('origin', 'PURCHASE')
      .ilike('note', '%NF-MBEB-001%');

    if (!existingMvt || existingMvt.length === 0) {
      await client.from('stock_movements').insert({
        network_id: netMbeb.id,
        branch_id: branchMbeb.id,
        product_id: prodId,
        movement_type: 'IN',
        quantity: p.qty,
        origin: 'PURCHASE',
        note: `Entrada oficial NF-MBEB-001 (${p.qty} un)`,
        user_id: superAdminId,
        date: new Date().toISOString()
      });
    }
  }

  console.log(`[OK] M Bebidas (Unidade ${branchMbeb.name}): 8 produtos cadastrados com NF-MBEB-001.`);
  console.log(`     Investimento Total: R$ ${totalCompraMbeb.toFixed(2)} | Venda Projetada: R$ ${totalVendaMbeb.toFixed(2)} | Lucro: R$ ${lucroMbeb.toFixed(2)}`);

  console.log('\n====================================================');
  console.log('--- RESUMO GERAL DAS NOTAS E ESTOQUES ---');
  console.log('====================================================');
  console.log(`1. GRUPO OVO (NF-OVO-001):`);
  console.log(`   - 9 Produtos Cadastrados com Estoque Total de 650 itens.`);
  console.log(`   - Investimento: R$ 4.789,00 | Venda: R$ 7.154,00 | Lucro: R$ 2.365,00 (Margem 49,4%)`);
  console.log(`2. M BEBIDAS (NF-MBEB-001):`);
  console.log(`   - 8 Produtos Cadastrados com Estoque Total de 411 itens.`);
  console.log(`   - Investimento: R$ 6.097,00 | Venda: R$ 9.322,00 | Lucro: R$ 3.225,00 (Margem 52,9%)`);
  console.log(`TOTAL CONSOLIDADO:`);
  console.log(`   - Investimento Total: R$ 10.886,00`);
  console.log(`   - Faturamento Projetado: R$ 16.476,00`);
  console.log(`   - Lucro Total Projetado: R$ 5.590,00`);
  console.log('====================================================');
}

runCleanSeed().catch(err => {
  console.error('ERRO FATAL NA EXECUÇÃO DO SEED:', err);
  process.exit(1);
});
