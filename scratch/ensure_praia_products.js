const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2]||'').replace(/^"|"$/g, '').trim();
});

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  // Sign in as super admin
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: 'super@giro.com',
    password: '123456'
  });
  if (authError || !authData.user) {
    console.error('Super admin auth failed:', authError);
    process.exit(1);
  }
  const superAdminId = authData.user.id;
  console.log('Super admin signed in:', superAdminId);

  // Find Grupo OVO network and branches
  const { data: networks } = await client.from('networks').select('*').ilike('name', '%ovo%');
  const netOvo = networks?.[0];
  if (!netOvo) {
    console.error('Grupo OVO network not found!');
    process.exit(1);
  }
  console.log('Grupo OVO Network:', netOvo.id, netOvo.name);

  const { data: branches } = await client.from('branches').select('*').eq('network_id', netOvo.id);
  console.log('Branches of Grupo OVO:', branches.map(b => ({ id: b.id, name: b.name })));

  const praiaBranch = branches.find(b => b.name.toLowerCase().includes('praia'));
  const centroBranch = branches.find(b => b.name.toLowerCase().includes('centro')) || branches[0];

  if (!praiaBranch) {
    console.error('Filial Praia not found in Grupo OVO branches!');
    process.exit(1);
  }
  console.log(`Praia Branch ID: ${praiaBranch.id} (${praiaBranch.name})`);
  console.log(`Centro Branch ID: ${centroBranch.id} (${centroBranch.name})`);

  // Check products in Praia
  const { data: praiaProds } = await client
    .from('products')
    .select('id, name, sku, stock_quantity, branch_id, is_active')
    .eq('branch_id', praiaBranch.id)
    .eq('is_active', true);

  console.log(`Praia products count: ${praiaProds?.length || 0}`);

  // Check products in Centro or general
  const { data: centroProds } = await client
    .from('products')
    .select('*')
    .eq('network_id', netOvo.id)
    .eq('is_active', true);

  console.log(`All active Grupo OVO products count: ${centroProds?.length || 0}`);
  centroProds.forEach(p => console.log(` - ID ${p.id} | SKU ${p.sku} | Branch ${p.branch_id} | Name: ${p.name}`));

  // If Praia has 0 products:
  if (!praiaProds || praiaProds.length === 0) {
    console.log('\n--- Populando 9 produtos na unidade Praia com NF-OVO-002 (R$ 4.789,00) ---');

    // 9 official products definitions
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

    // Categories map
    const { data: cats } = await client.from('categories').select('id, name');
    const catMap = {};
    cats.forEach(c => { catMap[c.name.toLowerCase().trim()] = c.id; });

    // Check if NF-OVO-002 exists
    const { data: existingPurch } = await client
      .from('purchases')
      .select('id')
      .eq('invoice_number', 'NF-OVO-002')
      .limit(1);

    let purchaseId = existingPurch?.[0]?.id;
    if (!purchaseId) {
      const totalAmount = produtosOvo.reduce((sum, p) => sum + (p.cost * p.qty), 0); // 4789.00
      const { data: newPurch, error: purchErr } = await client
        .from('purchases')
        .insert({
          network_id: netOvo.id,
          branch_id: praiaBranch.id,
          user_id: superAdminId,
          supplier: 'Granja & Atacado Nordeste',
          invoice_number: 'NF-OVO-002',
          total_amount: totalAmount,
          date: new Date().toISOString()
        })
        .select()
        .single();

      if (purchErr) {
        console.error('Error creating purchase NF-OVO-002:', purchErr);
        process.exit(1);
      }
      purchaseId = newPurch.id;
      console.log(`[OK] Compra NF-OVO-002 criada com ID ${purchaseId} para Praia (Total R$ ${totalAmount})`);
    }

    for (const p of produtosOvo) {
      const catId = catMap[p.cat.toLowerCase().trim()] || null;

      // Check if product with this branch_id and sku already exists
      const { data: existingP } = await client
        .from('products')
        .select('id')
        .eq('branch_id', praiaBranch.id)
        .eq('sku', p.sku)
        .limit(1);

      let pId;
      if (existingP && existingP.length > 0) {
        pId = existingP[0].id;
        await client.from('products').update({
          name: p.name,
          category_id: catId,
          cost_price: p.cost,
          sale_price: p.sale,
          stock_quantity: p.qty,
          min_stock: p.min,
          unit: 'un',
          is_active: true
        }).eq('id', pId);
        console.log(` - Produto ${p.name} atualizado (ID: ${pId})`);
      } else {
        const { data: newP, error: pErr } = await client
          .from('products')
          .insert({
            network_id: netOvo.id,
            branch_id: praiaBranch.id,
            name: p.name,
            sku: p.sku,
            category_id: catId,
            cost_price: p.cost,
            sale_price: p.sale,
            stock_quantity: p.qty,
            min_stock: p.min,
            unit: 'un',
            is_active: true
          })
          .select()
          .single();

        if (pErr) {
          console.error(`Erro inserindo produto ${p.name}:`, pErr);
          continue;
        }
        pId = newP.id;
        console.log(` - Produto ${p.name} inserido (ID: ${pId}) com estoque ${p.qty} un`);
      }

      // Insert purchase_item
      const { data: existingItem } = await client
        .from('purchase_items')
        .select('id')
        .eq('purchase_id', purchaseId)
        .eq('product_id', pId);

      if (!existingItem || existingItem.length === 0) {
        await client.from('purchase_items').insert({
          purchase_id: purchaseId,
          product_id: pId,
          quantity: p.qty,
          unit_cost: p.cost
        });
      }

      // Stock movement
      await client.from('stock_movements').insert({
        network_id: netOvo.id,
        branch_id: praiaBranch.id,
        product_id: pId,
        movement_type: 'IN',
        quantity: p.qty,
        origin: 'PURCHASE',
        note: 'Entrada de compra NF-OVO-002',
        user_id: superAdminId,
        date: new Date().toISOString()
      });
    }

    console.log('[SUCESSO] Todos os 9 produtos cadastrados e estocados com sucesso na Filial Praia!');
  } else {
    console.log('[INFO] A Filial Praia já possui produtos cadastrados.');
  }
}

main().catch(console.error);

