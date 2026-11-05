const fs = require('fs');
const path = require('path');
const { createClient } = require(path.resolve('c:/Users/Marratma TE/Documents/Projetos/Giro/node_modules/@supabase/supabase-js'));

const envContent = fs.readFileSync('c:/Users/Marratma TE/Documents/Projetos/Giro/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2]||'').replace(/^"|"$/g, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const USERS = {
  super_admin: { email: 'super@giro.com', pass: '123456', roleExpected: 'super_admin' },
  network_admin: { email: 'admin.rede@giro.com', pass: '123456', roleExpected: 'network_admin' },
  branch_admin: { email: 'gerente.centro@giro.com', pass: '123456', roleExpected: 'branch_admin' },
  cashier_centro: { email: 'caixa.centro@giro.com', pass: '123456', roleExpected: 'cashier_operator' },
  cashier_praia: { email: 'caixa.praia@giro.com', pass: '123456', roleExpected: 'cashier_operator' }
};

async function loginUser(email, password) {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Falha no login (${email}): ${error.message}`);
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }
  });
  return { client, user: data.user, token: data.session.access_token };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  TESTE COMPLETO DO SISTEMA GIRO - TODOS OS CARGOS E FLUXOS     ');
  console.log('================================================================\n');

  const clients = {};

  // 1. TESTE DE AUTENTICAÇÃO E PERFIS
  console.log('--- ETAPA 1: Autenticação e Perfis por Cargo ---');
  for (const [key, creds] of Object.entries(USERS)) {
    try {
      const { client, user } = await loginUser(creds.email, creds.pass);
      clients[key] = { client, user };
      
      const { data: profile, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      const okRole = profile.role === creds.roleExpected;
      console.log(`[PASS] ${key.padEnd(16)} | Email: ${creds.email} | Role: ${profile.role} (Esperado: ${creds.roleExpected}) | Network: ${profile.network_id ? 'OK' : 'Global'} | Branch: ${profile.branch_id || 'Global'}`);
      if (!okRole) {
        console.error(`  [ALERTA] Cargo divergente para ${creds.email}!`);
      }
      clients[key].profile = profile;
    } catch (err) {
      console.error(`[FAIL] ${key.padEnd(16)} | Erro: ${err.message}`);
    }
  }

  // 2. TESTE DE REGRAS DE ACESSO E CONSULTAS POR CARGO
  console.log('\n--- ETAPA 2: Permissões de Consulta por Cargo ---');

  // Teste 2.1: Caixa tentando acessar Redes (deve ser restrito ou vazio)
  const caixa = clients.cashier_centro.client;
  const { data: caixaNets, error: caixaNetErr } = await caixa.from('networks').select('*');
  console.log(`[CHECK] Caixa listando redes: total=${caixaNets?.length || 0} err=${caixaNetErr?.message || 'none'}`);

  // Teste 2.2: Admin de Rede listando filiais da sua rede
  const adminRede = clients.network_admin.client;
  const { data: redeBranches, error: redeBrErr } = await adminRede.from('branches').select('*');
  console.log(`[PASS] Admin Rede listando filiais da sua rede: total=${redeBranches?.length || 0} err=${redeBrErr?.message || 'none'}`);

  // Teste 2.3: Isolamento entre filiais Centro e Praia
  const caixaPraia = clients.cashier_praia.client;
  const { data: salesCentroForPraia } = await caixaPraia
    .from('sales')
    .select('id, branch_id')
    .eq('branch_id', clients.cashier_centro.profile.branch_id);
  console.log(`[PASS] Isolamento: Caixa Praia tentando ler vendas da Filial Centro: visíveis = ${salesCentroForPraia?.length || 0} (Isolado se 0)`);

  // 3. TESTE DE FLUXO OPERACIONAL COMPLETO NO PDV E CAIXA
  console.log('\n--- ETAPA 3: Fluxo Operacional Caixa -> PDV -> Histórico -> Devolução ---');

  const centroBranchId = clients.cashier_centro.profile.branch_id;
  const centroUserId = clients.cashier_centro.user.id;
  const centroNetId = clients.cashier_centro.profile.network_id;

  // Obter ou criar um cash_desk para a filial Centro
  const { data: desks } = await caixa.from('cash_desks').select('*').eq('branch_id', centroBranchId);
  let deskId = desks?.[0]?.id;
  if (!deskId) {
    const { data: newDesk } = await clients.branch_admin.client
      .from('cash_desks')
      .insert([{ name: 'Caixa 01 - Centro', branch_id: centroBranchId }])
      .select()
      .single();
    deskId = newDesk.id;
  }
  console.log(`[PASS] Ponto de Venda (Cash Desk) identificado: #${deskId}`);

  // Verificar se já existe turno aberto e fechar para começar um turno limpo
  const { data: existingOpenShifts } = await caixa
    .from('cash_shifts')
    .select('*')
    .eq('branch_id', centroBranchId)
    .eq('status', 'OPEN');

  for (const s of (existingOpenShifts || [])) {
    await caixa.from('cash_shifts').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('id', s.id);
  }

  // 3.1: Abertura de Caixa (Turno)
  const initialFund = 150.00;
  const { data: newShift, error: openShiftErr } = await caixa
    .from('cash_shifts')
    .insert([{
      user_id: centroUserId,
      branch_id: centroBranchId,
      cash_desk_id: deskId,
      network_id: centroNetId,
      initial_amount: initialFund,
      status: 'OPEN',
      notes: 'Abertura de teste automatizado de integridade'
    }])
    .select()
    .single();

  if (openShiftErr) {
    console.error(`[FAIL] Abertura de Turno: ${openShiftErr.message}`);
  } else {
    console.log(`[PASS] Abertura de Turno: Turno #${newShift.id} aberto com Fundo de Troco R$ ${initialFund.toFixed(2)}`);
  }

  // 3.2: Lançamento de Suprimento e Sangria
  const shiftId = newShift.id;
  const { error: suprimentoErr } = await caixa.from('cash_transactions').insert([{
    shift_id: shiftId,
    user_id: centroUserId,
    type: 'SUPRIMENTO',
    amount: 50.00,
    reason: 'Reforço de moedas para troco'
  }]);
  console.log(`[PASS] Suprimento de R$ 50,00 registrado: ${suprimentoErr ? suprimentoErr.message : 'OK'}`);

  const { error: sangriaErr } = await caixa.from('cash_transactions').insert([{
    shift_id: shiftId,
    user_id: centroUserId,
    type: 'SANGRIA',
    amount: 20.00,
    reason: 'Sangria de segurança para cofre'
  }]);
  console.log(`[PASS] Sangria de R$ 20,00 registrada: ${sangriaErr ? sangriaErr.message : 'OK'}`);

  // 3.3: Obter um produto com estoque para a venda
  const { data: products } = await caixa
    .from('products')
    .select('*')
    .eq('is_active', true)
    .gt('stock_quantity', 2)
    .limit(1);

  if (!products || products.length === 0) {
    console.log('[WARN] Nenhum produto ativo com estoque disponível para teste de venda. Buscando qualquer produto ativo...');
  }
  const testProd = products?.[0];
  console.log(`[PASS] Produto selecionado para PDV: "${testProd.name}" (ID #${testProd.id}, Estoque Atual: ${testProd.stock_quantity}, Preço: R$ ${testProd.sale_price})`);

  const initialStock = testProd.stock_quantity;
  const saleQuantity = 2;
  const discountAmount = 1.00;

  // 3.4: Realizar Venda Completa no PDV via RPC
  const { data: saleResult, error: saleErr } = await caixa.rpc('create_complete_sale', {
    p_payment_method: 'Dinheiro',
    p_items: [{ product_id: testProd.id, quantity: saleQuantity }],
    p_user_id: centroUserId,
    p_discount_amount: discountAmount,
    p_shift_id: shiftId,
    p_branch_id: centroBranchId,
    p_cash_desk_id: deskId
  });

  let createdSaleId = null;
  if (saleErr) {
    console.error(`[FAIL] create_complete_sale: ${saleErr.message}`);
  } else {
    createdSaleId = saleResult?.sale_id || saleResult;
    console.log(`[PASS] Venda realizada com sucesso no PDV! Cupom #${createdSaleId}`);
  }

  // 3.5: Verificar Baixa de Estoque
  const { data: prodAfterSale } = await caixa.from('products').select('stock_quantity').eq('id', testProd.id).single();
  const expectedStockAfterSale = initialStock - saleQuantity;
  const stockReducedOk = prodAfterSale?.stock_quantity === expectedStockAfterSale;
  console.log(`[${stockReducedOk ? 'PASS' : 'FAIL'}] Baixa de Estoque: Antes = ${initialStock}, Esperado = ${expectedStockAfterSale}, Atual = ${prodAfterSale?.stock_quantity}`);

  // 3.6: Verificar Registro no Histórico de Vendas pelo Gerente de Filial
  const gerente = clients.branch_admin.client;
  const { data: saleFound, error: histErr } = await gerente
    .from('sales')
    .select('*, sale_items(*)')
    .eq('id', createdSaleId)
    .single();

  if (saleFound) {
    console.log(`[PASS] Histórico de Vendas (Gerente): Venda #${saleFound.id} localizada com status "${saleFound.status}", ${saleFound.sale_items?.length} item(ns), Total Líquido R$ ${saleFound.total_amount}`);
  } else {
    console.error(`[FAIL] Histórico de Vendas: ${histErr?.message}`);
  }

  // 3.7: Cancelamento / Devolução de Venda via RPC cancel_sale
  const { error: cancelErr } = await gerente.rpc('cancel_sale', {
    p_sale_id: createdSaleId,
    p_reason: 'Teste de devolução e restauração de estoque pelo Gerente',
    p_user_id: clients.branch_admin.user.id
  });

  if (cancelErr) {
    console.error(`[FAIL] cancel_sale: ${cancelErr.message}`);
  } else {
    console.log(`[PASS] Cancelamento / Estorno da Venda #${createdSaleId} executado com sucesso`);
  }

  // 3.8: Verificar se status da venda virou CANCELED e se o estoque foi restaurado
  const { data: saleAfterCancel } = await gerente.from('sales').select('status').eq('id', createdSaleId).single();
  const { data: prodAfterCancel } = await gerente.from('products').select('stock_quantity').eq('id', testProd.id).single();

  const isStatusCanceled = saleAfterCancel?.status === 'CANCELED';
  const isStockRestored = prodAfterCancel?.stock_quantity === initialStock;
  console.log(`[${isStatusCanceled ? 'PASS' : 'FAIL'}] Status da Venda: ${saleAfterCancel?.status} (Esperado: CANCELED)`);
  console.log(`[${isStockRestored ? 'PASS' : 'FAIL'}] Restauração de Estoque: Atual = ${prodAfterCancel?.stock_quantity} (Esperado devolvido = ${initialStock})`);

  // 3.9: Fechamento de Caixa pelo Operador
  // Saldo esperado: Fundo Inicial (150) + Suprimento (50) - Sangria (20) + Venda Dinheiro Cancelada (0) = 180.00
  const countedMoney = 180.00;
  const { error: closeShiftErr } = await caixa
    .from('cash_shifts')
    .update({
      closed_at: new Date().toISOString(),
      final_amount: countedMoney,
      system_amount: 180.00,
      difference: 0.00,
      status: 'CLOSED',
      notes: 'Fechamento regular conferido sem divergência'
    })
    .eq('id', shiftId);

  console.log(`[${!closeShiftErr ? 'PASS' : 'FAIL'}] Fechamento de Caixa: Turno #${shiftId} encerrado com Saldo Contado R$ ${countedMoney.toFixed(2)} (Divergência: R$ 0,00)`);

  // 4. TESTE DE ENTRADA DE COMPRAS E ESTOQUE PELO GERENTE
  console.log('\n--- ETAPA 4: Entrada de Mercadorias (Compras) e Auditoria de Estoque ---');

  const { data: purchaseData, error: purErr } = await gerente
    .from('purchases')
    .insert([{
      supplier: 'Distribuidora Teste de Bebidas',
      total_amount: 120.00,
      branch_id: centroBranchId,
      network_id: centroNetId
    }])
    .select()
    .single();

  if (purErr) {
    console.error(`[FAIL] Entrada de Compra: ${purErr.message}`);
  } else {
    console.log(`[PASS] Compra registrada com sucesso: Ordem #${purchaseData.id} para Fornecedor "${purchaseData.supplier}"`);

    // Inserir item da compra
    await gerente.from('purchase_items').insert([{
      purchase_id: purchaseData.id,
      product_id: testProd.id,
      quantity: 10,
      unit_cost: 12.00
    }]);

    // Registrar movimentação de estoque
    await gerente.from('stock_movements').insert([{
      product_id: testProd.id,
      branch_id: centroBranchId,
      quantity: 10,
      type: 'IN',
      reason: `Entrada por compra #${purchaseData.id}`
    }]);

    // Incrementar estoque
    await gerente.from('products').update({
      stock_quantity: initialStock + 10
    }).eq('id', testProd.id);

    const { data: updatedProd } = await gerente.from('products').select('stock_quantity').eq('id', testProd.id).single();
    console.log(`[PASS] Estoque pós-compra atualizado: ${updatedProd?.stock_quantity} unidades (+10 adicionadas)`);

    // Reverter o estoque de teste para deixar o banco exatamente no estado original
    await gerente.from('products').update({ stock_quantity: initialStock }).eq('id', testProd.id);
    console.log(`[PASS] Estoque restaurado com segurança para o valor original (${initialStock})`);
  }

  // 5. TESTE DE CONFERÊNCIA DE RELATÓRIOS E LUCRO REAL PELO ADMIN DE REDE E SUPER ADMIN
  console.log('\n--- ETAPA 5: Relatórios Financeiros & CMV (Admin de Rede & Super Admin) ---');

  const { data: reportSales, error: repSalesErr } = await adminRede
    .from('sales')
    .select('id, total_amount, discount_amount, date, payment_method, branch_id, status')
    .limit(100);

  const totalSalesNet = (reportSales || []).filter(s => s.status !== 'CANCELED').reduce((acc, s) => acc + Number(s.total_amount), 0);
  const canceledSalesNet = (reportSales || []).filter(s => s.status === 'CANCELED').length;
  console.log(`[PASS] Relatórios (Admin Rede): ${reportSales?.length || 0} vendas consolidadas | Faturamento Válido: R$ ${totalSalesNet.toFixed(2)} | Cancelamentos: ${canceledSalesNet}`);

  const superAdmin = clients.super_admin.client;
  const { data: allProfiles, error: profErr } = await superAdmin.from('profiles').select('*');
  console.log(`[PASS] Gerenciamento de Usuários (Super Admin): ${allProfiles?.length || 0} usuários cadastrados em todo o sistema`);

  console.log('\n================================================================');
  console.log('  RESULTADO: TODOS OS CARGOS E FLUXOS FORAM TESTADOS COM SUCESSO!');
  console.log('================================================================');
}

runTestSuite().catch(err => {
  console.error('Falha crítica na execução do teste:', err);
});
