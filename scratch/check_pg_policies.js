const path = require('path');
const { createClient } = require(path.resolve('c:/Users/Marratma TE/Documents/Projetos/Giro/node_modules/@supabase/supabase-js'));
const fs = require('fs');

const envPath = 'c:/Users/Marratma TE/Documents/Projetos/Giro/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

async function checkPgPolicies() {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // Authenticate first
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email: 'caixa.centro@giro.com',
    password: '123456'
  });

  console.log('Session user ID:', auth?.user?.id);
  console.log('Session token present:', !!auth?.session?.access_token);

  // Test with authenticated client by passing token explicitly in headers
  const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`
      }
    }
  });

  // Check current_user_role() RPC
  const { data: roleData, error: roleErr } = await authClient.rpc('current_user_role');
  console.log('current_user_role() RPC result:', roleData, roleErr ? roleErr.message : '');

  const { data: branchData, error: branchErr } = await authClient.rpc('current_user_branch_id');
  console.log('current_user_branch_id() RPC result:', branchData, branchErr ? branchErr.message : '');

  // Query sales with explicit auth token
  const { data: sales, error: salesErr } = await authClient.from('sales').select('id, branch_id, total_amount');
  console.log('Sales returned with explicit auth token:', sales?.length, salesErr ? salesErr.message : '');
  sales?.forEach(s => console.log('  -> Sale #' + s.id + ' branch: ' + s.branch_id));

  // Query debug_get_policies
  const { data: dbg, error: dbgErr } = await supabase.rpc('debug_get_policies');
  console.log('debug_get_policies available:', !!dbg, dbgErr ? dbgErr.message : '');
  if (dbg) {
    console.log('Active policies on sales:', dbg.filter(x => x.table === 'sales'));
    console.log('Active policies on purchases:', dbg.filter(x => x.table === 'purchases'));
  }
}

checkPgPolicies();
