const fs = require('fs');
const path = require('path');
const { createClient } = require(path.resolve('c:/Users/Marratma TE/Documents/Projetos/Giro/node_modules/@supabase/supabase-js'));

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

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testCancel() {
  console.log('--- Testando login com Caixa Centro ---');
  const { data: auth, error: authErr } = await client.auth.signInWithPassword({
    email: 'caixa.centro@giro.com',
    password: '123456'
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }
  console.log('Autenticado com sucesso. Token:', auth.session.access_token.slice(0, 15) + '...');

  const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`
      }
    }
  });

  const { data: sales, error: salesErr } = await authClient
    .from('sales')
    .select('id, branch_id, status, total_amount')
    .eq('status', 'COMPLETED')
    .limit(1);

  if (salesErr || !sales || !sales.length) {
    console.log('Nenhuma venda encontrada para testar cancelamento:', salesErr);
    return;
  }

  const sale = sales[0];
  console.log('Tentando cancelar venda #', sale.id, 'Branch:', sale.branch_id);

  const { data: cancelResult, error: cancelErr } = await authClient.rpc('cancel_sale', {
    p_sale_id: sale.id,
    p_reason: 'Teste de auditoria',
    p_user_id: auth.user.id
  });

  console.log('Resultado do cancel_sale:', cancelResult);
  console.log('Erro cancel_sale:', cancelErr);
}

testCancel();
