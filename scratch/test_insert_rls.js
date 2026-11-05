const fs = require('fs');
const path = require('path');
const { createClient } = require(path.resolve('c:/Users/Marratma TE/Documents/Projetos/Giro/node_modules/@supabase/supabase-js'));

const envContent = fs.readFileSync('c:/Users/Marratma TE/Documents/Projetos/Giro/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2]||'').replace(/^"|"$/g, '');
});

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testInsertBranch() {
  console.log('--- Testando inserção em branches como admin.rede@giro.com ---');
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'admin.rede@giro.com',
    password: '123456'
  });
  if (authErr) return console.error('Auth error:', authErr);

  const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } }
  });

  const { data, error } = await authClient.from('branches').insert({
    name: 'Filial Teste RLS',
    network_id: '7b2b34ef-0c99-4125-816b-a0e67fdfa552',
    unit_id: 'ede81f39-8ad2-4cf3-8698-bb77cb448882'
  }).select();

  console.log('Resultado insert branch:', data);
  console.log('Erro insert branch:', error);
}

testInsertBranch();
