const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
for (const line of env.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let key = match[1];
    let value = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
    envVars[key] = value;
  }
}
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: sales, error: sErr } = await supabase.from('sales').select('*').order('id', { ascending: false }).limit(5);
  console.log('SALES:', JSON.stringify(sales, null, 2));

  const { data: shifts, error: shErr } = await supabase.from('cash_shifts').select('*').order('id', { ascending: false }).limit(5);
  console.log('SHIFTS:', JSON.stringify(shifts, null, 2));

  const { data: branches } = await supabase.from('branches').select('*');
  console.log('BRANCHES:', JSON.stringify(branches, null, 2));

  const { data: prods } = await supabase.from('products').select('id, name, branch_id, network_id, stock_quantity').limit(20);
  console.log('PRODUCTS:', JSON.stringify(prods, null, 2));
}
run();
