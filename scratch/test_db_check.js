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

async function checkTables() {
  console.log('=== TESTE 1: Login de Teste ===');
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: 'caixa.praia@giro.com',
    password: '123456'
  });

  if (authErr) {
    console.log('Erro de autenticação:', authErr.message);
  } else {
    console.log('Usuário autenticado:', authData.user.email, 'ID:', authData.user.id);
  }

  const tables = [
    'networks',
    'units',
    'branches',
    'categories',
    'products',
    'purchases',
    'purchase_items',
    'sales',
    'sale_items',
    'stock_movements',
    'cash_registers',
    'cash_shifts',
    'cash_transactions',
    'profiles'
  ];

  console.log('\n=== TESTE 2: Verificação de Tabelas com Usuário Autenticado ===');
  for (const table of tables) {
    const { data, error, count } = await client.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ Tabela [${table}]: ERRO ->`, error.message, `(code: ${error.code})`);
    } else {
      console.log(`✅ Tabela [${table}]: OK (total registros acessíveis: ${count})`);
    }
  }

  console.log('\n=== TESTE 3: Verificação de RPCs / Funções ===');
  const res7 = await client.rpc('create_complete_sale', {
    p_payment_method: 'money',
    p_items: [],
    p_user_id: authData?.user?.id || null,
    p_discount_amount: 0,
    p_shift_id: null,
    p_branch_id: null,
    p_cash_desk_id: null
  });
  console.log('RPC create_complete_sale com 7 parâmetros ->', res7.error ? res7.error.message : 'OK', res7.data);

  const prodSample = await client.from('products').select('*').limit(1);
  console.log('Colunas de products:', prodSample.data ? Object.keys(prodSample.data[0]) : 'vazio');

  const dbgPol = await client.rpc('debug_get_policies');
  console.log('Políticas no banco (debug_get_policies):', dbgPol.error ? dbgPol.error.message : `${dbgPol.data?.length} políticas ativas`);

}

checkTables();
