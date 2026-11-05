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

async function inspectProfiles() {
  const { data: auth } = await client.auth.signInWithPassword({
    email: 'super@giro.com',
    password: '123456'
  });
  const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } }
  });

  const { data, error } = await authClient
    .from('profiles')
    .select('*');

  console.log('Perfis no banco:', data?.map(p => ({
    email: p.email,
    role: p.role,
    tenant_id: p.tenant_id,
    network_id: p.network_id,
    branch_id: p.branch_id
  })));
  if (error) console.error('Erro:', error);
}

inspectProfiles();
