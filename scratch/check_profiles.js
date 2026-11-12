const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2]||'').replace(/^"|"$/g, '').trim();
});

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  await client.auth.signInWithPassword({ email: 'super@giro.com', password: '123456' });
  const { data: profiles } = await client.from('profiles').select('*');
  console.log('PROFILES:');
  profiles.forEach(p => console.log(` - ${p.email} | role: ${p.role} | net: ${p.network_id} | branch: ${p.branch_id} | name: ${p.full_name}`));

  // Check RLS on products for cashier
  const { data: cashierAuth, error: cErr } = await client.auth.signInWithPassword({ email: 'caixa.praia@giro.com', password: '123456' });
  if (cErr) {
    console.log('Login caixa.praia failed:', cErr.message);
  } else {
    console.log('Login caixa.praia succeeded! user id:', cashierAuth.user.id);
    const { data: prods, error: pErr } = await client.from('products').select('*');
    console.log(`caixa.praia sees ${prods ? prods.length : 0} products:`, pErr || '');
    if (prods) {
      prods.forEach(p => console.log(`   * ${p.name} (sku: ${p.sku}, branch: ${p.branch_id}, net: ${p.network_id})`));
    }
  }
}
run();
