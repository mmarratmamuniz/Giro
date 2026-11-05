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

async function verifyAll() {
  console.log('--- 1. Login como admin.rede@giro.com ---');
  const { data: auth } = await client.auth.signInWithPassword({
    email: 'admin.rede@giro.com',
    password: '123456'
  });

  const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } }
  });

  // Limpar filial de teste criada
  const { error: delErr } = await authClient
    .from('branches')
    .delete()
    .eq('name', 'Filial Teste RLS');
  console.log('Filial teste excluída com sucesso? ', delErr ? `Erro: ${delErr.message}` : 'SIM!');

  // 2. Verificar categorias
  const { data: categories, error: catErr } = await authClient
    .from('categories')
    .select('id, name');
  console.log('--- 2. Categorias cadastradas no banco: ---', categories);

  // 3. Testar cancel_sale e verificar se branch_id foi inserido no stock_movements
  console.log('--- 3. Testando cancel_sale com Caixa Centro ---');
  const { data: authCaixa } = await client.auth.signInWithPassword({
    email: 'caixa.centro@giro.com',
    password: '123456'
  });
  const caixaClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authCaixa.session.access_token}` } }
  });

  // Criar uma venda rápida para testar o cancelamento completo
  const prodRes = await caixaClient.from('products').select('id').eq('is_active', true).limit(1).single();
  const shiftRes = await caixaClient.from('cash_shifts').select('id, branch_id, cash_desk_id').eq('status', 'OPEN').limit(1).maybeSingle();

  if (prodRes.data) {
    const salePayload = {
      p_payment_method: 'Pix',
      p_items: [{ product_id: prodRes.data.id, quantity: 1 }],
      p_user_id: authCaixa.user.id,
      p_discount_amount: 0,
      p_shift_id: shiftRes.data?.id || null,
      p_branch_id: '13c4db46-4f09-4d28-8463-e6b8806718b4',
      p_cash_desk_id: shiftRes.data?.cash_desk_id || null
    };

    const { data: newSale, error: saleErr } = await caixaClient.rpc('create_complete_sale', salePayload);
    if (newSale?.sale_id) {
      console.log('Venda de teste criada: #', newSale.sale_id);
      const { data: cancelRes, error: cancelErr } = await caixaClient.rpc('cancel_sale', {
        p_sale_id: newSale.sale_id,
        p_reason: 'Auditoria de cancelamento com filial',
        p_user_id: authCaixa.user.id
      });
      console.log('Resultado cancel_sale:', cancelRes, 'Erro:', cancelErr);

      // Verificar se a movimentação SALE_CANCEL apareceu para o Caixa Centro
      const { data: movements } = await caixaClient
        .from('stock_movements')
        .select('*')
        .eq('origin', 'SALE_CANCEL')
        .order('id', { ascending: false })
        .limit(1);

      console.log('Movimentação auditada gerada para a filial:', movements);
    }
  }
}

verifyAll();
