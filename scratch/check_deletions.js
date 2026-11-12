const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2]||'').replace(/^"|"$/g, '').trim();
});
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkDeletions() {
  await client.auth.signInWithPassword({ email: 'super@giro.com', password: '123456' });
  const res1 = await client.from('sale_items').delete().gte('id', 0);
  console.log('Delete sale_items:', res1);
  const res2 = await client.from('sales').delete().gte('id', 0);
  console.log('Delete sales:', res2);
  const res3 = await client.from('products').delete().gte('id', 0);
  console.log('Delete products:', res3);
}
checkDeletions();

