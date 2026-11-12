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
  await client.auth.signInWithPassword({ email: 'super@giro.com', password: '123456' });

  // Get purchase 15
  const { data: purchase } = await client.from('purchases').select('*').eq('invoice_number', 'NF-OVO-002').single();
  console.log('Purchase NF-OVO-002:', purchase);

  if (!purchase) return;

  // 9 official products
  const skus = ['OVO-B15', 'OVO-C15', 'OVO-B30', 'OVO-E30', 'MER-ACU1', 'MER-FEIC1', 'MER-FEIP1', 'AGU-500', 'AGU-1500'];
  const { data: prods } = await client.from('products').select('*').in('sku', skus);

  console.log(`Found ${prods.length} products for Grupo OVO.`);

  const qtys = {
    'OVO-B15': { qty: 60, cost: 9.50 },
    'OVO-C15': { qty: 40, cost: 11.00 },
    'OVO-B30': { qty: 80, cost: 17.50 },
    'OVO-E30': { qty: 50, cost: 19.50 },
    'MER-ACU1': { qty: 100, cost: 3.40 },
    'MER-FEIC1': { qty: 80, cost: 5.80 },
    'MER-FEIP1': { qty: 60, cost: 6.00 },
    'AGU-500': { qty: 120, cost: 1.10 },
    'AGU-1500': { qty: 60, cost: 1.80 }
  };

  for (const prod of prods) {
    const info = qtys[prod.sku];
    if (!info) continue;

    // Check purchase item
    const { data: item } = await client.from('purchase_items').select('id').eq('purchase_id', purchase.id).eq('product_id', prod.id);
    if (!item || item.length === 0) {
      await client.from('purchase_items').insert({
        purchase_id: purchase.id,
        product_id: prod.id,
        quantity: info.qty,
        unit_cost: info.cost
      });
      console.log(`Linked ${prod.name} to NF-OVO-002 (${info.qty} un)`);
    }

    // Check stock movement
    const { data: mov } = await client.from('stock_movements').select('id').eq('product_id', prod.id).eq('note', 'Entrada de compra NF-OVO-002');
    if (!mov || mov.length === 0) {
      await client.from('stock_movements').insert({
        network_id: purchase.network_id,
        branch_id: purchase.branch_id,
        product_id: prod.id,
        movement_type: 'IN',
        quantity: info.qty,
        origin: 'PURCHASE',
        note: 'Entrada de compra NF-OVO-002',
        user_id: purchase.user_id,
        date: new Date().toISOString()
      });
      console.log(`Stock movement added for ${prod.name} (${info.qty} un)`);
    }
  }

  console.log('[OK] NF-OVO-002 devidamente estruturada com os 9 itens e movimentações de estoque!');
}
main().catch(console.error);

