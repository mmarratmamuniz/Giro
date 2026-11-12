const fs = require('fs');
const path = require('path');
const { createClient } = require(path.resolve('c:/Users/Marratma TE/Documents/Projetos/Giro/node_modules/@supabase/supabase-js'));

const envContent = fs.readFileSync('c:/Users/Marratma TE/Documents/Projetos/Giro/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2]||'').replace(/^"|"$/g, '').trim();
});

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testRelatoriosQueries() {
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'super@giro.com',
    password: '123456'
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }
  console.log('[OK] Autenticado como:', auth.user.email);

  // 1. Sales
  const sRes = await client
    .from('sales')
    .select(`
      id,
      user_id,
      total_amount,
      discount_amount,
      payment_method,
      status,
      date,
      created_at,
      shift_id,
      branch_id,
      cash_desk_id,
      cancel_reason,
      canceled_at,
      branch:branches(id, name, network_id),
      cash_desk:cash_desks(id, name),
      sale_items (
        id,
        quantity,
        unit_price,
        unit_cost,
        product_id,
        products (
          id,
          name,
          sku,
          cost_price,
          category_id,
          categories (id, name)
        )
      )
    `)
    .order('created_at', { ascending: false });

  console.log('1. Vendas query status:', { error: sRes.error, count: sRes.data?.length });

  // 2. Shifts
  const shRes = await client
    .from('cash_shifts')
    .select(`
      id,
      user_id,
      branch_id,
      cash_desk_id,
      opened_at,
      closed_at,
      initial_amount,
      final_amount,
      system_amount,
      difference,
      status,
      notes,
      created_at,
      branch:branches(id, name, network_id),
      cash_desk:cash_desks(id, name)
    `)
    .order('opened_at', { ascending: false });

  console.log('2. Turnos query status:', { error: shRes.error, count: shRes.data?.length });

  // 3. Purchases
  const pRes = await client
    .from('purchases')
    .select(`
      id,
      user_id,
      invoice_number,
      supplier,
      total_amount,
      date,
      created_at,
      branch_id,
      network_id,
      branch:branches(id, name),
      purchase_items (
        id,
        quantity,
        unit_cost,
        product_id,
        products (id, name, sku)
      )
    `)
    .order('date', { ascending: false });

  console.log('3. Compras query status:', { error: pRes.error, count: pRes.data?.length, purchases: pRes.data?.map(p => ({ nf: p.invoice_number, total: p.total_amount, branch: p.branch?.name })) });

  // 4. Profiles
  const profRes = await client.from('profiles').select('id, full_name, email');
  console.log('4. Perfis query status:', { error: profRes.error, count: profRes.data?.length });
}

testRelatoriosQueries();
