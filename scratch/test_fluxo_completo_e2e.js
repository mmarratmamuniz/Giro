const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const { createClient } = require(path.join(rootDir, 'node_modules', '@supabase', 'supabase-js'));

const envContent = fs.readFileSync(path.join(rootDir, '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2] || '').replace(/^"|"$/g, '').trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('[FAIL] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausente no .env.local');
  process.exit(1);
}

const USERS = {
  super_admin: { email: 'super@giro.com', pass: '123456' },
  branch_admin: { email: 'gerente.centro@giro.com', pass: '123456' },
  cashier_centro: { email: 'caixa.centro@giro.com', pass: '123456' },
  cashier_praia: { email: 'caixa.praia@giro.com', pass: '123456' },
};

async function loginUser(email, password) {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Falha no login (${email}): ${error.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });

  const { data: profile, error: profErr } = await client
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profErr) throw new Error(`Falha ao obter perfil de ${email}: ${profErr.message}`);

  return { client, user: data.user, profile };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n❌ [ASSERTION FAILED]: ${message}`);
    process.exit(1);
  }
}

async function runE2E() {
  console.log('========================================================================');
  console.log('  SIMULAÇÃO E AUDITORIA COMPLETA DE FLUXO OPERACIONAL E2E (FILIAL CENTRO)');
  console.log('========================================================================\n');

  console.log('--> Autenticando operadores do teste...');
  const gerenteCentro = await loginUser(USERS.branch_admin.email, USERS.branch_admin.pass);
  const caixaCentro = await loginUser(USERS.cashier_centro.email, USERS.cashier_centro.pass);
  const caixaPraia = await loginUser(USERS.cashier_praia.email, USERS.cashier_praia.pass);
  console.log('✔ Usuários autenticados (Gerente Centro, Caixa Centro, Caixa Praia)\n');

  const centroBranchId = gerenteCentro.profile.branch_id;
  const centroNetId = gerenteCentro.profile.network_id;

  assert(centroBranchId, 'Filial Centro do Gerente não encontrada no perfil');
  assert(centroNetId, 'Rede da Filial Centro não encontrada no perfil');

  const stockAudit = [];
  const permissionsAudit = [];

  // =========================================================================
  // PASSO 1: CADASTRO DE PRODUTO NOVO E ESTOQUE INICIAL
  // =========================================================================
  console.log('--- PASSO 1: Cadastro de Produto Novo e Estoque Inicial ---');
  const testSku = 'E2E-' + Date.now();
  const testName = 'Cerveja Teste E2E 600ml';

  const { data: newProd, error: createProdErr } = await gerenteCentro.client
    .from('products')
    .insert([
      {
        sku: testSku,
        name: testName,
        cost_price: 5.0,
        sale_price: 10.0,
        stock_quantity: 0,
        min_stock: 5,
        branch_id: centroBranchId,
        network_id: centroNetId,
        is_active: true,
      },
    ])
    .select()
    .single();

  assert(!createProdErr && newProd, `Erro ao criar produto: ${createProdErr?.message}`);
  const productId = newProd.id;
  console.log(`✔ Produto #${productId} criado com estoque inicial 0. SKU: ${testSku}`);
  stockAudit.push({ step: '1. Criação do Produto', delta: '+0 un', balance: 0, note: 'Cadastro no catálogo' });

  // Ajuste de estoque inicial para 10 unidades
  const { data: adjData, error: adjErr } = await gerenteCentro.client.rpc('adjust_product_stock', {
    p_product_id: productId,
    p_new_quantity: 10,
    p_reason: 'Estoque inicial de cadastro E2E',
  });
  assert(!adjErr && adjData?.success, `Erro ao ajustar estoque: ${adjErr?.message}`);

  const { data: pAfterStep1 } = await gerenteCentro.client
    .from('products')
    .select('stock_quantity, cost_price')
    .eq('id', productId)
    .single();

  assert(pAfterStep1.stock_quantity === 10, `Estoque esperado 10, recebido ${pAfterStep1.stock_quantity}`);

  const { data: smStep1 } = await gerenteCentro.client
    .from('stock_movements')
    .select('*')
    .eq('product_id', productId)
    .eq('origin', 'MANUAL_ADJUSTMENT')
    .order('id', { ascending: false })
    .limit(1);

  assert(smStep1?.length > 0 && smStep1[0].quantity === 10, 'Movimentação MANUAL_ADJUSTMENT não encontrada ou quantidade incorreta');
  console.log(`✔ Estoque inicial ajustado para 10 unidades via RPC. Movimento registrado: ${smStep1[0].note}`);
  stockAudit.push({ step: '1. Ajuste Inicial', delta: '+10 un', balance: 10, note: 'RPC adjust_product_stock' });

  // =========================================================================
  // PASSO 2: ENTRADA DE COMPRA / FORNECEDOR (+20 un @ R$ 6,00)
  // =========================================================================
  console.log('\n--- PASSO 2: Entrada de Compra / Fornecedor (create_complete_purchase) ---');
  const invoiceNum = 'NF-E2E-999';
  const { data: purRes, error: purErr } = await gerenteCentro.client.rpc('create_complete_purchase', {
    p_branch_id: centroBranchId,
    p_supplier: 'Distribuidora E2E',
    p_items: [{ product_id: productId, quantity: 20, unit_cost: 6.0 }],
    p_invoice_number: invoiceNum,
  });

  assert(!purErr && purRes?.success, `Erro na RPC create_complete_purchase: ${purErr?.message}`);
  const purchaseId = purRes.purchase_id;

  // Verificações em products
  const { data: pAfterStep2 } = await gerenteCentro.client
    .from('products')
    .select('stock_quantity, cost_price')
    .eq('id', productId)
    .single();

  assert(pAfterStep2.stock_quantity === 30, `Estoque pós-compra esperado 30, obtido ${pAfterStep2.stock_quantity}`);
  assert(Number(pAfterStep2.cost_price) === 6.0, `Custo unitário esperado 6.00, obtido ${pAfterStep2.cost_price}`);

  // Verificação em purchases
  const { data: purRow } = await gerenteCentro.client
    .from('purchases')
    .select('*')
    .eq('id', purchaseId)
    .single();

  assert(Number(purRow.total_amount) === 120.0, `Total da compra esperado 120.00, obtido ${purRow.total_amount}`);
  assert(purRow.user_id === gerenteCentro.user.id, `User da compra divergente: esperado ${gerenteCentro.user.id}, obtido ${purRow.user_id}`);
  assert(purRow.invoice_number === invoiceNum, 'Número de NF não gravado corretamente');

  // Verificação em stock_movements
  const { data: smStep2 } = await gerenteCentro.client
    .from('stock_movements')
    .select('*')
    .eq('product_id', productId)
    .eq('origin', 'PURCHASE')
    .order('id', { ascending: false })
    .limit(1);

  assert(smStep2?.length > 0 && smStep2[0].quantity === 20, 'Movimentação origin = PURCHASE não encontrada ou quantidade divergente');
  console.log(`✔ Compra #${purchaseId} (${invoiceNum}) registrada com sucesso: +20 un @ R$ 6,00. Estoque: 30 un | Custo médio atualizado: R$ 6,00`);
  stockAudit.push({ step: '2. Entrada de Compra', delta: '+20 un', balance: 30, note: `NF: ${invoiceNum} (R$ 120,00)` });

  // =========================================================================
  // PASSO 3: ABERTURA DE TURNO DE CAIXA E TRAVA DE CONCORRÊNCIA
  // =========================================================================
  console.log('\n--- PASSO 3: Abertura de Turno de Caixa e Trava de Concorrência ---');
  const { data: desks } = await caixaCentro.client
    .from('cash_desks')
    .select('*')
    .eq('branch_id', centroBranchId);

  let deskId = desks?.[0]?.id;
  if (!deskId) {
    const { data: newDesk, error: dErr } = await gerenteCentro.client
      .from('cash_desks')
      .insert([{ name: 'Caixa 01 - Centro', branch_id: centroBranchId }])
      .select()
      .single();
    assert(!dErr, `Falha ao criar caixa: ${dErr?.message}`);
    deskId = newDesk.id;
  }

  // Fechar turnos abertos prévios no mesmo terminal para garantir ambiente limpo
  const { data: existingOpenShifts } = await caixaCentro.client
    .from('cash_shifts')
    .select('id')
    .eq('cash_desk_id', deskId)
    .eq('status', 'OPEN');

  for (const s of existingOpenShifts || []) {
    await caixaCentro.client
      .from('cash_shifts')
      .update({ status: 'CLOSED', closed_at: new Date().toISOString(), notes: 'Fechamento pré-teste E2E' })
      .eq('id', s.id);
  }

  // Abrir turno com fundo inicial de R$ 100,00
  const initialFund = 100.0;
  const { data: shift, error: openShiftErr } = await caixaCentro.client
    .from('cash_shifts')
    .insert([
      {
        user_id: caixaCentro.user.id,
        branch_id: centroBranchId,
        cash_desk_id: deskId,
        network_id: centroNetId,
        initial_amount: initialFund,
        status: 'OPEN',
        notes: 'Turno E2E - Auditoria Completa',
      },
    ])
    .select()
    .single();

  assert(!openShiftErr && shift, `Erro ao abrir turno: ${openShiftErr?.message}`);
  const shiftId = shift.id;
  console.log(`✔ Turno #${shiftId} aberto no terminal #${deskId} com fundo de troco R$ ${initialFund.toFixed(2)}`);

  // Testar concorrência: tentar abrir um SEGUNDO turno no mesmo terminal
  const { error: duplicateShiftErr } = await caixaCentro.client
    .from('cash_shifts')
    .insert([
      {
        user_id: caixaCentro.user.id,
        branch_id: centroBranchId,
        cash_desk_id: deskId,
        network_id: centroNetId,
        initial_amount: 50.0,
        status: 'OPEN',
      },
    ]);

  assert(
    duplicateShiftErr && (duplicateShiftErr.code === '23505' || duplicateShiftErr.message.includes('unique')),
    'FALHA: O banco permitiu dois turnos abertos simultâneos no mesmo terminal!'
  );
  console.log(`✔ Trava de concorrência validada: Segundo turno bloqueado por constraint única (código ${duplicateShiftErr.code})`);
  permissionsAudit.push({ test: 'Concorrência de Caixa (Turno Único por Terminal)', status: 'PASS', detail: 'Bloqueado por índice parcial 23505' });

  // =========================================================================
  // PASSO 4: MOVIMENTAÇÕES DE GAVETA (SUPRIMENTO E SANGRIA)
  // =========================================================================
  console.log('\n--- PASSO 4: Movimentações de Gaveta (Suprimento e Sangria) ---');
  // Suprimento de R$ 50,00
  const { data: supData, error: supErr } = await caixaCentro.client.rpc('register_cash_transaction', {
    p_shift_id: shiftId,
    p_type: 'SUPRIMENTO',
    p_amount: 50.0,
    p_reason: 'Reforço de moedas E2E',
  });
  assert(!supErr && supData?.success, `Erro no suprimento: ${supErr?.message}`);
  console.log('✔ Suprimento de R$ 50,00 registrado via RPC');

  // Sangria de R$ 30,00
  const { data: sanData, error: sanErr } = await caixaCentro.client.rpc('register_cash_transaction', {
    p_shift_id: shiftId,
    p_type: 'SANGRIA',
    p_amount: 30.0,
    p_reason: 'Retirada para cofre E2E',
  });
  assert(!sanErr && sanData?.success, `Erro na sangria: ${sanErr?.message}`);
  console.log('✔ Sangria de R$ 30,00 registrada via RPC');

  // Assertiva RLS: tentar inserir sangria direta via cliente
  const { error: directInsertErr } = await caixaCentro.client.from('cash_transactions').insert([
    {
      shift_id: shiftId,
      user_id: caixaCentro.user.id,
      type: 'SANGRIA',
      amount: 100.0,
      reason: 'Injeção direta não autorizada',
    },
  ]);

  assert(directInsertErr !== null, 'FALHA: O RLS permitiu inserção direta em cash_transactions sem passar pela RPC!');
  console.log(`✔ RLS validado: Inserção direta bloqueada em cash_transactions (${directInsertErr.code || directInsertErr.message})`);
  permissionsAudit.push({ test: 'Blindagem RLS cash_transactions (SELECT-only)', status: 'PASS', detail: `Bloqueado com código ${directInsertErr.code}` });

  // =========================================================================
  // PASSO 5: VENDAS NO PDV (DINHEIRO COM DESCONTO + PIX) E AUDITORIA DE CMV
  // =========================================================================
  console.log('\n--- PASSO 5: Vendas no PDV e Auditoria de CMV Histórico ---');

  // Venda A: 5 un em Dinheiro @ R$ 10,00 com desconto de R$ 5,00 -> Total Líquido R$ 45,00
  const { data: saleARes, error: saleAErr } = await caixaCentro.client.rpc('create_complete_sale', {
    p_payment_method: 'Dinheiro',
    p_items: [{ product_id: productId, quantity: 5, unit_price: 10.0 }],
    p_discount_amount: 5.0,
    p_shift_id: shiftId,
    p_branch_id: centroBranchId,
    p_cash_desk_id: deskId,
  });

  assert(!saleAErr && saleARes?.success, `Erro na Venda A: ${saleAErr?.message}`);
  const saleAId = saleARes.sale_id;
  assert(Number(saleARes.total_amount) === 45.0, `Total da Venda A divergente: esperado 45.00, obtido ${saleARes.total_amount}`);
  console.log(`✔ Venda A (#${saleAId}) concluída em Dinheiro: 5 un * R$ 10,00 (-) R$ 5,00 desc = R$ 45,00 líquido`);
  stockAudit.push({ step: '5. Venda A (Dinheiro)', delta: '-5 un', balance: 25, note: `Venda #${saleAId} líquida R$ 45,00` });

  // Venda B: 3 un em Pix @ R$ 10,00 sem desconto -> Total Líquido R$ 30,00
  const { data: saleBRes, error: saleBErr } = await caixaCentro.client.rpc('create_complete_sale', {
    p_payment_method: 'Pix',
    p_items: [{ product_id: productId, quantity: 3, unit_price: 10.0 }],
    p_discount_amount: 0.0,
    p_shift_id: shiftId,
    p_branch_id: centroBranchId,
    p_cash_desk_id: deskId,
  });

  assert(!saleBErr && saleBRes?.success, `Erro na Venda B: ${saleBErr?.message}`);
  const saleBId = saleBRes.sale_id;
  assert(Number(saleBRes.total_amount) === 30.0, `Total da Venda B divergente: esperado 30.00, obtido ${saleBRes.total_amount}`);
  console.log(`✔ Venda B (#${saleBId}) concluída em Pix: 3 un * R$ 10,00 = R$ 30,00 líquido`);
  stockAudit.push({ step: '5. Venda B (Pix)', delta: '-3 un', balance: 22, note: `Venda #${saleBId} líquida R$ 30,00` });

  // Assertiva de Estoque: Deve ter caído para 22 unidades
  const { data: pAfterStep5 } = await caixaCentro.client
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .single();

  assert(pAfterStep5.stock_quantity === 22, `Estoque após vendas esperado 22, obtido ${pAfterStep5.stock_quantity}`);

  // Assertiva de CMV: unit_cost gravado em sale_items deve ser 6.00 em ambas as vendas
  const { data: itemsA } = await caixaCentro.client.from('sale_items').select('*').eq('sale_id', saleAId);
  const { data: itemsB } = await caixaCentro.client.from('sale_items').select('*').eq('sale_id', saleBId);

  assert(Number(itemsA[0].unit_cost) === 6.0, `CMV Venda A divergente: esperado 6.00, obtido ${itemsA[0].unit_cost}`);
  assert(Number(itemsB[0].unit_cost) === 6.0, `CMV Venda B divergente: esperado 6.00, obtido ${itemsB[0].unit_cost}`);
  console.log(`✔ CMV Histórico validado: R$ ${itemsA[0].unit_cost}/un gravado com precisão em sale_items`);

  // Assertiva de Movimentações: 2 saídas origin = 'SALE'
  const { data: smSales } = await caixaCentro.client
    .from('stock_movements')
    .select('*')
    .eq('product_id', productId)
    .eq('origin', 'SALE')
    .order('id', { ascending: false })
    .limit(2);

  assert(smSales?.length === 2, `Esperado 2 registros de saída SALE, obtido ${smSales?.length}`);
  console.log(`✔ Movimentações de saída por venda auditadas no estoque`);

  // =========================================================================
  // PASSO 6: TESTE DE PERMISSÃO E ESTORNO DE VENDA (cancel_sale)
  // =========================================================================
  console.log('\n--- PASSO 6: Teste de Permissão e Estorno de Venda (cancel_sale) ---');

  // 6.1 Operador tenta cancelar Venda B (deve ser negado)
  const { error: opCancelErr } = await caixaCentro.client.rpc('cancel_sale', {
    p_sale_id: saleBId,
    p_reason: 'Tentativa indevida de cancelamento por operador',
  });
  assert(opCancelErr !== null, 'FALHA: Operador conseguiu cancelar a venda!');
  console.log(`✔ Permissão validada: Operador de caixa bloqueado de cancelar venda (${opCancelErr.message})`);
  permissionsAudit.push({ test: 'Bloqueio de Cancelamento por Operador', status: 'PASS', detail: opCancelErr.message });

  // 6.2 Operador de outra filial (Praia) tenta ler ou cancelar Venda A
  const { data: salesForPraia } = await caixaPraia.client
    .from('sales')
    .select('*')
    .eq('id', saleAId);
  assert((salesForPraia?.length || 0) === 0, 'FALHA: Caixa da Praia conseguiu enxergar venda da filial Centro!');

  const { error: praiaCancelErr } = await caixaPraia.client.rpc('cancel_sale', {
    p_sale_id: saleAId,
    p_reason: 'Tentativa de cancelamento de outra filial',
  });
  assert(praiaCancelErr !== null, 'FALHA: Operador de outra filial conseguiu cancelar venda!');
  console.log(`✔ Isolamento entre filiais validado: Caixa da Praia sem visibilidade ou permissão na venda`);
  permissionsAudit.push({ test: 'Isolamento Horizontal de Filiais (Visibilidade/Estorno)', status: 'PASS', detail: '0 registros visíveis, execução negada' });

  // 6.3 Gerente Centro cancela Venda B (Pix)
  const { data: gerCancelRes, error: gerCancelErr } = await gerenteCentro.client.rpc('cancel_sale', {
    p_sale_id: saleBId,
    p_reason: 'Cliente desistiu no teste E2E',
  });
  assert(!gerCancelErr && gerCancelRes?.success, `Erro ao cancelar venda pelo gerente: ${gerCancelErr?.message}`);

  // Verificar restauração de estoque: de 22 para 25
  const { data: pAfterCancel } = await gerenteCentro.client
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .single();

  assert(pAfterCancel.stock_quantity === 25, `Estoque pós-cancelamento esperado 25, obtido ${pAfterCancel.stock_quantity}`);

  // Verificar status e canceled_by em sales
  const { data: saleBAfterCancel } = await gerenteCentro.client
    .from('sales')
    .select('status, canceled_by')
    .eq('id', saleBId)
    .single();

  assert(saleBAfterCancel.status === 'CANCELED', `Status esperado CANCELED, obtido ${saleBAfterCancel.status}`);
  assert(saleBAfterCancel.canceled_by === gerenteCentro.user.id, `canceled_by esperado ${gerenteCentro.user.id}, obtido ${saleBAfterCancel.canceled_by}`);

  // Verificar stock_movements com origin = 'SALE_CANCEL'
  const { data: smCancel } = await gerenteCentro.client
    .from('stock_movements')
    .select('*')
    .eq('product_id', productId)
    .eq('origin', 'SALE_CANCEL')
    .order('id', { ascending: false })
    .limit(1);

  assert(smCancel?.length > 0 && smCancel[0].quantity === 3, 'Movimentação SALE_CANCEL (+3 un) não encontrada');
  console.log(`✔ Venda B (#${saleBId}) cancelada pelo Gerente. Estoque restaurado para 25 un | canceled_by auditado`);
  stockAudit.push({ step: '6. Estorno Venda B', delta: '+3 un', balance: 25, note: `Cancelamento Venda #${saleBId}` });

  // =========================================================================
  // PASSO 7: CONFERÊNCIA MATEMÁTICA DE CAIXA E FECHAMENTO (close_cash_shift)
  // =========================================================================
  console.log('\n--- PASSO 7: Conferência Matemática de Caixa e Fechamento ---');
  // Cálculo esperado na gaveta de DINHEIRO:
  // Inicial (100) + Suprimento (50) - Sangria (30) + Venda A Dinheiro (45) = 165.00
  // Informaremos valor contado de 160.00 (simulando que faltaram R$ 5,00)
  const countedAmount = 160.0;
  const { data: closeRes, error: closeErr } = await caixaCentro.client.rpc('close_cash_shift', {
    p_shift_id: shiftId,
    p_final_amount: countedAmount,
    p_notes: 'Teste E2E com falta simulada de R$ 5,00',
  });

  assert(!closeErr && closeRes?.success, `Erro ao fechar caixa: ${closeErr?.message}`);

  const { data: closedShift } = await caixaCentro.client
    .from('cash_shifts')
    .select('*')
    .eq('id', shiftId)
    .single();

  assert(closedShift.status === 'CLOSED', `Status esperado CLOSED, obtido ${closedShift.status}`);
  assert(Number(closedShift.system_amount) === 165.0, `system_amount esperado 165.00, obtido ${closedShift.system_amount}`);
  assert(Number(closedShift.final_amount) === 160.0, `final_amount esperado 160.00, obtido ${closedShift.final_amount}`);
  assert(Number(closedShift.difference) === -5.0, `difference esperada -5.00, obtida ${closedShift.difference}`);
  assert(closedShift.closed_by_user_id === caixaCentro.user.id, 'closed_by_user_id não preenchido com o operador correto');

  console.log(`✔ Fechamento auditado pelo banco:`);
  console.log(`   - Fundo Inicial:      R$ 100,00`);
  console.log(`   - (+) Suprimento:     R$  50,00`);
  console.log(`   - (-) Sangria:        R$  30,00`);
  console.log(`   - (+) Dinheiro PDV:   R$  45,00`);
  console.log(`   = Saldo Calculado:    R$ 165,00`);
  console.log(`   - Saldo Contado:      R$ 160,00`);
  console.log(`   = Diferença (Quebra): R$  -5,00`);

  // =========================================================================
  // PASSO 8: AUDITORIA DE DRE / LUCRO REAL E LIMPEZA
  // =========================================================================
  console.log('\n--- PASSO 8: Auditoria de DRE, Congelamento de CMV e Limpeza ---');

  // Testar congelamento do CMV se o custo do produto mudar no futuro
  await gerenteCentro.client
    .from('products')
    .update({ cost_price: 9.0 })
    .eq('id', productId);

  const { data: checkItemA } = await caixaCentro.client
    .from('sale_items')
    .select('unit_cost, unit_price, quantity')
    .eq('sale_id', saleAId)
    .single();

  assert(Number(checkItemA.unit_cost) === 6.0, `CMV corrompido! Esperado 6.00 congelado, obtido ${checkItemA.unit_cost}`);
  console.log(`✔ CMV Histórico à prova de futuro: Alteração de custo para R$ 9,00 manteve o CMV da Venda A intacto em R$ 6,00/un`);

  // Desativar produto para não poluir catálogo do PDV
  await gerenteCentro.client
    .from('products')
    .update({ is_active: false })
    .eq('id', productId);
  console.log(`✔ Limpeza: Produto de teste #${productId} desativado (is_active = false)`);

  // =========================================================================
  // EXIBIÇÃO DAS TABELAS CONSOLIDADAS DO RELATÓRIO
  // =========================================================================
  console.log('\n========================================================================');
  console.log('                          RELATÓRIO CONSOLIDADO                         ');
  console.log('========================================================================\n');

  console.log('1. EVOLUÇÃO DO ESTOQUE:');
  console.table(stockAudit);

  console.log('\n2. CONCILIAÇÃO FINANCEIRA DO CAIXA:');
  console.table([
    { Rubrica: 'Fundo Inicial', Operacao: '(+)', Valor: 'R$ 100,00' },
    { Rubrica: 'Suprimento de Moedas', Operacao: '(+)', Valor: 'R$ 50,00' },
    { Rubrica: 'Sangria para Cofre', Operacao: '(-)', Valor: 'R$ 30,00' },
    { Rubrica: 'Venda A (Dinheiro c/ Desconto)', Operacao: '(+)', Valor: 'R$ 45,00' },
    { Rubrica: 'Venda B (Pix Cancelada)', Operacao: '(=)', Valor: 'R$ 0,00' },
    { Rubrica: 'Saldo Esperado (Sistema)', Operacao: '(=)', Valor: 'R$ 165,00' },
    { Rubrica: 'Saldo Físico Contado', Operacao: '(=)', Valor: 'R$ 160,00' },
    { Rubrica: 'Diferença de Caixa (Falta)', Operacao: '(=)', Valor: 'R$ -5,00' },
  ]);

  console.log('\n3. DEMONSTRATIVO DE RESULTADO (DRE DO TESTE):');
  console.table([
    { Item: 'Receita Bruta Total (Vendas A + B)', Valor: 'R$ 80,00' },
    { Item: 'Descontos Concedidos (Venda A)', Valor: '(-) R$ 5,00' },
    { Item: 'Vendas Canceladas / Estornos (Venda B)', Valor: '(-) R$ 30,00' },
    { Item: 'Receita Líquida Realizada', Valor: '(=) R$ 45,00' },
    { Item: 'CMV Histórico (5 un * R$ 6,00)', Valor: '(-) R$ 30,00' },
    { Item: 'Lucro Bruto Real', Valor: '(=) R$ 15,00' },
    { Item: 'Margem Bruta Real', Valor: '33.3%' },
  ]);

  console.log('\n4. MATRIZ DE SEGURANÇA E RLS:');
  console.table(permissionsAudit);

  console.log('\n========================================================================');
  console.log('  TESTE E2E EXECUTADO COM SUCESSO TOTAL - NENHUMA DIVERGÊNCIA ENCONTRADA!');
  console.log('========================================================================');
}

runE2E().catch((err) => {
  console.error('\n❌ [ERRO CRÍTICO NO TESTE E2E]:', err);
  process.exit(1);
});

