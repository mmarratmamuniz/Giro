const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2]||'').replace(/^"|"$/g, '').trim();
});
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkCounts() {
  await client.auth.signInWithPassword({ email: 'super@giro.com', password: '123456' });
  const { data: si } = await client.from('sale_items').select('id, sale_id, product_id');
  console.log('sale_items count:', si?.length);
  const { data: s } = await client.from('sales').select('id');
  console.log('sales count:', s?.length);
}
checkCounts();

