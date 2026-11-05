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
  console.error('[FAIL] Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não encontradas no .env.local');
  process.exit(1);
}

const USERS = {
  super_admin: { email: 'super@giro.com', pass: '123456' },
  network_admin: { email: 'admin.rede@giro.com', pass: '123456' },
  branch_admin: { email: 'gerente.centro@giro.com', pass: '123456' },
  cashier_centro: { email: 'caixa.centro@giro.com', pass: '123456' },
  cashier_praia: { email: 'caixa.praia@giro.com', pass: '123456' },
};

function isRpcMissing(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  return code === 'PGRST202' || msg.includes('could not find the function') || msg.includes('schema cache');
}

function checkMissingRpcAndHalt(err, rpcName) {
  if (isRpcMissing(err)) {
    console.error(`\n================================================================`);
    console.error(`[ALERTA CRÍTICO] A RPC "${rpcName}" não foi encontrada no Supabase!`);
    console.error(`Falta executar o arquivo supabase/migration_fase5_blindagem_e_rpcs.sql no SQL Editor.`);
    console.error(`================================================================\n`);
    process.exit(1);
  }
}

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

  return { client, user: data.user, profile, token: data.session.access_token };
}

async function runAudit() {
  console.log('================================================================');
  console.log('  TESTE DE AUDITORIA E BLINDAGEM - FASE 5 (GIRO MULTI-TENANT)   ');
  console.log('================================================================\n');

  const results = {
    bloco1: { status: 'PENDING', details: [] },
    bloco2: { status: 'PENDING', details: [] },
    bloco3: { status: 'PENDING', details: [] },
    bloco4: { status: 'PENDING', details: [] },
    bloco5: { status: 'PENDING', details: [] },
  };

  // Autenticação dos usuários necessários
  console.log('--> Autenticando usuários de teste...');
  const caixaCentro = await loginUser(USERS.cashier_centro.email, USERS.cashier_centro.pass);
  const caixaPraia = await loginUser(USERS.cashier_praia.email, USERS.cashier_praia.pass);
  const gerenteCentro = await loginUser(USERS.branch_admin.email, USERS.branch_admin.pass);
  console.log('[PASS] Usuários autenticados com sucesso.\n');

  const centroBranchId = caixaCentro.profile.branch_id;
  const centroNetId = caixaCentro.profile.network_id;

  // -------------------------------------------------------------------------
  // BLOCO 1: ISOLAMENTO RLS E ANTI-ESCALAÇÃO DE PRIVILÉGIO
  // -------------------------------------------------------------------------
  console.log('--- BLOCO 1: Isolamento RLS e Anti-Escalação de Privilégio ---');
  let b1Pass = true;

  // 1.1 Tentar alterar o próprio cargo de operador para super_admin
  const { error: updateProfErr } = await caixaCentro.client
    .from('profiles')
    .update({ role: 'super_admin' })
    .eq('id', caixaCentro.user.id);

  const { data: profAfterEscalation } = await caixaCentro.client
    .from('profiles')
    .select('role')
    .eq('id', caixaCentro.user.id)
    .single();

  const escalationBlocked = updateProfErr !== null || profAfterEscalation?.role !== 'super_admin';
  if (escalationBlocked) {
    console.log(`[PASS] 1.1 Anti-escalação: Operador impedido de virar super_admin (${updateProfErr?.message || 'Role permaneceu inalterado'})`);
    results.bloco1.details.push('Anti-escalação de privilégios validada');
  } else {
    console.error(`[FAIL] 1.1 Anti-escalação: Operador conseguiu alterar role para super_admin!`);
    b1Pass = false;
  }

  // 1.2 Caixa da Praia tentando ler vendas da Filial Centro
  const { data: salesCentroForPraia, error: salesErr } = await caixaPraia.client
    .from('sales')
    .select('id, branch_id')
    .eq('branch_id', centroBranchId);

  const praiaIsolated = (salesCentroForPraia?.length || 0) === 0;
  if (praiaIsolated) {
    console.log(`[PASS] 1.2 Isolamento de Filial: Caixa Praia visualizou 0 vendas da filial Centro`);
    results.bloco1.details.push('Isolamento horizontal entre filiais validado');
  } else {
    console.error(`[FAIL] 1.2 Isolamento de Filial: Caixa Praia acessou ${salesCentroForPraia.length} vendas de outra filial!`);
    b1Pass = false;
  }

  // 1.3 Inserção direta bloqueada em stock_movements e cash_transactions
  const { error: smInsertErr } = await caixaCentro.client
    .from('stock_movements')
    .insert([{ product_id: 1, branch_id: centroBranchId, quantity: 1, type: 'IN' }]);

  const { error: ctInsertErr } = await caixaCentro.client
    .from('cash_transactions')
    .insert([{ shift_id: 1, type: 'SUPRIMENTO', amount: 10 }]);

  if (smInsertErr && ctInsertErr) {
    console.log(`[PASS] 1.3 Inserção Direta: Bloqueada em stock_movements (${smInsertErr.code || smInsertErr.message}) e cash_transactions (${ctInsertErr.code || ctInsertErr.message})`);
    results.bloco1.details.push('Tabelas críticas blindadas como SELECT-only');
  } else {
    console.error(`[FAIL] 1.3 Inserção Direta: Falha no bloqueio RLS direto! smErr=${smInsertErr?.message} ctErr=${ctInsertErr?.message}`);
    b1Pass = false;
  }

  // 1.4 Verificar remoção de debug_get_policies
  const { error: debugErr } = await caixaCentro.client.rpc('debug_get_policies');
  if (debugErr) {
    console.log(`[PASS] 1.4 Segurança de Funções: debug_get_policies inacessível/removida com sucesso`);
    results.bloco1.details.push('Funções de depuração inseguras eliminadas');
  } else {
    console.error(`[FAIL] 1.4 Segurança de Funções: debug_get_policies ainda está acessível!`);
    b1Pass = false;
  }

  results.bloco1.status = b1Pass ? 'PASS' : 'FAIL';

  // -------------------------------------------------------------------------
  // BLOCO 2: TURNO ÚNICO, SANGRIA/SUPRIMENTO E FECHAMENTO
  // -------------------------------------------------------------------------
  console.log('\n--- BLOCO 2: Turno Único, Sangria/Suprimento e Fechamento ---');
  let b2Pass = true;

  // 2.1 Identificar Terminal e Turno Aberto na Filial Centro
  const { data: desks } = await caixaCentro.client
    .from('cash_desks')
    .select('*')
    .eq('branch_id', centroBranchId);

  let deskId = desks?.[0]?.id;
  if (!deskId) {
    const { data: newDesk, error: dErr } = await gerenteCentro.client
      .from('cash_desks')
      .insert([{ name: 'Caixa 01 - Centro', branch_id: centroBranchId }])
      .select().single();
    if (dErr) throw dErr;
    deskId = newDesk.id;
  }

  const { data: openShifts } = await caixaCentro.client
    .from('cash_shifts')
    .select('*')
    .eq('cash_desk_id', deskId)
    .eq('status', 'OPEN');

  let activeShift = openShifts?.[0];
  if (!activeShift) {
    const { data: createdShift, error: shiftErr } = await caixaCentro.client
      .from('cash_shifts')
      .insert([{
        user_id: caixaCentro.user.id,
        branch_id: centroBranchId,
        cash_desk_id: deskId,
        network_id: centroNetId,
        initial_amount: 100.00,
        status: 'OPEN',
        notes: 'Abertura para auditoria de testes'
      }])
      .select().single();
    if (shiftErr) throw shiftErr;
    activeShift = createdShift;
  }
  console.log(`[PASS] 2.1 Turno Aberto ativo no terminal #${deskId}: Turno #${activeShift.id}`);

  // 2.2 Tentar abrir um SEGUNDO turno OPEN no mesmo terminal
  const { error: duplicateShiftErr } = await caixaCentro.client
    .from('cash_shifts')
    .insert([{
      user_id: caixaCentro.user.id,
      branch_id: centroBranchId,
      cash_desk_id: deskId,
      network_id: centroNetId,
      initial_amount: 50.00,
      status: 'OPEN'
    }]);

  const duplicateBlocked = duplicateShiftErr && (duplicateShiftErr.code === '23505' || duplicateShiftErr.message.includes('unique'));
  if (duplicateBlocked) {
    console.log(`[PASS] 2.2 Turno Único: Segundo turno bloqueado por constraint única (código: ${duplicateShiftErr.code})`);
    results.bloco2.details.push('Restrição de terminal único por turno aberta validada');
  } else {
    console.error(`[FAIL] 2.2 Turno Único: Permitiu abrir segundo turno no mesmo caixa! err=${duplicateShiftErr?.message}`);
    b2Pass = false;
  }

  // 2.3 Executar Suprimento e Sangria via RPC register_cash_transaction
  const t0_tx = Date.now();
  const { data: supData, error: supErr } = await caixaCentro.client.rpc('register_cash_transaction', {
    p_shift_id: activeShift.id,
    p_type: 'SUPRIMENTO',
    p_amount: 50.00,
    p_reason: 'Troco inicial teste'
  });
  checkMissingRpcAndHalt(supErr, 'register_cash_transaction');

  const { data: sanData, error: sanErr } = await caixaCentro.client.rpc('register_cash_transaction', {
    p_shift_id: activeShift.id,
    p_type: 'SANGRIA',
    p_amount: 20.00,
    p_reason: 'Sangria de segurança teste'
  });
  const txDuration = Date.now() - t0_tx;

  if (!supErr && !sanErr) {
    console.log(`[PASS] 2.3 RPC register_cash_transaction: Suprimento (R$ 50) e Sangria (R$ 20) concluídos em ${txDuration}ms`);
    results.bloco2.details.push(`Transações de caixa registradas via RPC (${txDuration}ms)`);
  } else {
    console.error(`[FAIL] 2.3 RPC register_cash_transaction: supErr=${supErr?.message} sanErr=${sanErr?.message}`);
    b2Pass = false;
  }

  results.bloco2.status = b2Pass ? 'PASS' : 'FAIL';

  // -------------------------------------------------------------------------
  // BLOCO 3: VENDA, CUSTO HISTÓRICO E ESTORNO AUDITADO
  // -------------------------------------------------------------------------
  console.log('\n--- BLOCO 3: Venda, Custo Histórico e Estorno Auditado ---');
  let b3Pass = true;

  // Obter produto para teste pertencente à filial Centro
  const { data: prods } = await caixaCentro.client
    .from('products')
    .select('*')
    .eq('is_active', true)
    .gt('stock_quantity', 2)
    .limit(1);

  let testProd = prods?.[0];
  if (!testProd) {
    throw new Error('Nenhum produto ativo com estoque > 2 encontrado para teste.');
  }

  const initialStock = testProd.stock_quantity;
  const salePrice = Number(testProd.sale_price || testProd.price) || 25.00;

  // 3.1 Realizar venda em dinheiro via RPC create_complete_sale
  const t0_sale = Date.now();
  const { data: saleRes, error: saleErr } = await caixaCentro.client.rpc('create_complete_sale', {
    p_payment_method: 'Dinheiro',
    p_items: [{ product_id: testProd.id, quantity: 1, unit_price: salePrice }],
    p_user_id: caixaCentro.user.id,
    p_discount_amount: 0,
    p_shift_id: activeShift.id,
    p_branch_id: centroBranchId,
    p_cash_desk_id: deskId
  });
  checkMissingRpcAndHalt(saleErr, 'create_complete_sale');
  const saleDuration = Date.now() - t0_sale;

  let createdSaleId = null;
  if (!saleErr && saleRes) {
    createdSaleId = saleRes.sale_id || saleRes.id || saleRes;
    console.log(`[PASS] 3.1 RPC create_complete_sale: Venda #${createdSaleId} gerada em ${saleDuration}ms`);
    results.bloco3.details.push(`Venda completa via RPC (${saleDuration}ms)`);
  } else {
    console.error(`[FAIL] 3.1 RPC create_complete_sale: ${saleErr?.message}`);
    b3Pass = false;
  }

  // 3.2 Verificar unit_cost histórico em sale_items e movimentação de estoque origin = 'SALE'
  if (createdSaleId) {
    const { data: saleItems } = await caixaCentro.client
      .from('sale_items')
      .select('*')
      .eq('sale_id', createdSaleId);

    const unitCostSaved = saleItems?.[0] && Number(saleItems[0].unit_cost) > 0;

    const { data: smSale } = await caixaCentro.client
      .from('stock_movements')
      .select('*')
      .eq('product_id', testProd.id)
      .eq('origin', 'SALE')
      .order('id', { ascending: false })
      .limit(1);

    const smSaleRecorded = smSale?.length > 0;

    if (unitCostSaved && smSaleRecorded) {
      console.log(`[PASS] 3.2 Custo Histórico & CMV: Gravado unit_cost = R$ ${saleItems[0].unit_cost} e movimento origin = 'SALE'`);
      results.bloco3.details.push(`CMV histórico gravado (R$ ${saleItems[0].unit_cost}) e movimento SALE registrado`);
    } else {
      console.error(`[FAIL] 3.2 Custo Histórico: unitCostSaved=${unitCostSaved} smSaleRecorded=${smSaleRecorded}`);
      b3Pass = false;
    }

    // 3.3 Tentar cancelar a venda com o operador caixa.centro (deve ser bloqueado)
    const { error: opCancelErr } = await caixaCentro.client.rpc('cancel_sale', {
      p_sale_id: createdSaleId,
      p_reason: 'Tentativa não autorizada pelo operador',
      p_user_id: caixaCentro.user.id
    });

    if (opCancelErr) {
      console.log(`[PASS] 3.3 Bloqueio de Cancelamento: Operador impedido de cancelar venda (${opCancelErr.message})`);
      results.bloco3.details.push('Operadores de caixa impedidos de cancelar vendas');
    } else {
      console.error(`[FAIL] 3.3 Bloqueio de Cancelamento: Operador conseguiu cancelar a venda sem autorização!`);
      b3Pass = false;
    }

    // 3.4 Cancelar com o gerente da filial (branch_admin)
    const t0_cancel = Date.now();
    const { data: gerCancelRes, error: gerCancelErr } = await gerenteCentro.client.rpc('cancel_sale', {
      p_sale_id: createdSaleId,
      p_reason: 'Cancelamento autorizado pelo gerente em teste de auditoria',
      p_user_id: gerenteCentro.user.id
    });
    checkMissingRpcAndHalt(gerCancelErr, 'cancel_sale');
    const cancelDuration = Date.now() - t0_cancel;

    const { data: saleAfterCancel } = await gerenteCentro.client
      .from('sales')
      .select('status, canceled_by')
      .eq('id', createdSaleId)
      .single();

    const { data: prodAfterCancel } = await gerenteCentro.client
      .from('products')
      .select('stock_quantity')
      .eq('id', testProd.id)
      .single();

    const { data: smCancel } = await gerenteCentro.client
      .from('stock_movements')
      .select('*')
      .eq('product_id', testProd.id)
      .eq('origin', 'SALE_CANCEL')
      .order('id', { ascending: false })
      .limit(1);

    const cancelSuccess =
      !gerCancelErr &&
      saleAfterCancel?.status === 'CANCELED' &&
      saleAfterCancel?.canceled_by === gerenteCentro.user.id &&
      prodAfterCancel?.stock_quantity === initialStock &&
      smCancel?.length > 0;

    if (cancelSuccess) {
      console.log(`[PASS] 3.4 Cancelamento Gerencial: Venda #${createdSaleId} cancelada em ${cancelDuration}ms | canceled_by registrado | Estoque restaurado para ${initialStock} | origin = 'SALE_CANCEL'`);
      results.bloco3.details.push(`Cancelamento auditado executado pelo gerente (${cancelDuration}ms)`);
    } else {
      console.error(`[FAIL] 3.4 Cancelamento Gerencial: gerCancelErr=${gerCancelErr?.message} status=${saleAfterCancel?.status} stock=${prodAfterCancel?.stock_quantity}`);
      b3Pass = false;
    }
  }

  // 3.5 Fechar o turno aberto via RPC close_cash_shift
  const t0_close = Date.now();
  const { data: closeRes, error: closeErr } = await caixaCentro.client.rpc('close_cash_shift', {
    p_shift_id: activeShift.id,
    p_final_amount: 130.00,
    p_notes: 'Fechamento auditado de rotina'
  });
  checkMissingRpcAndHalt(closeErr, 'close_cash_shift');
  const closeDuration = Date.now() - t0_close;

  const { data: shiftClosed } = await caixaCentro.client
    .from('cash_shifts')
    .select('status, closed_by_user_id, system_amount, difference')
    .eq('id', activeShift.id)
    .single();

  const closeSuccess =
    !closeErr &&
    shiftClosed?.status === 'CLOSED' &&
    shiftClosed?.closed_by_user_id === caixaCentro.user.id &&
    shiftClosed?.system_amount !== null;

  if (closeSuccess) {
    console.log(`[PASS] 3.5 RPC close_cash_shift: Turno #${activeShift.id} encerrado em ${closeDuration}ms | closed_by=${shiftClosed.closed_by_user_id} | Saldo do Sistema=R$ ${shiftClosed.system_amount} | Dif=R$ ${shiftClosed.difference}`);
    results.bloco3.details.push(`Fechamento de turno calculado e auditado pelo banco (${closeDuration}ms)`);
  } else {
    console.error(`[FAIL] 3.5 RPC close_cash_shift: err=${closeErr?.message} status=${shiftClosed?.status}`);
    b3Pass = false;
  }

  results.bloco3.status = b3Pass ? 'PASS' : 'FAIL';

  // -------------------------------------------------------------------------
  // BLOCO 4: COMPRAS E AJUSTE MANUAL DE ESTOQUE
  // -------------------------------------------------------------------------
  console.log('\n--- BLOCO 4: Compras e Ajuste Manual de Estoque ---');
  let b4Pass = true;

  // 4.1 Entrada de Compra com Nota Fiscal via RPC create_complete_purchase
  const t0_pur = Date.now();
  const { data: purRes, error: purErr } = await gerenteCentro.client.rpc('create_complete_purchase', {
    p_branch_id: centroBranchId,
    p_supplier: 'Fornecedor Auditoria Teste',
    p_items: [{ product_id: testProd.id, quantity: 5, unit_cost: 12.00 }],
    p_invoice_number: 'NF-TESTE-001'
  });
  checkMissingRpcAndHalt(purErr, 'create_complete_purchase');
  const purDuration = Date.now() - t0_pur;

  const purchaseId = purRes?.purchase_id || purRes?.id || purRes;

  const { data: purRecord } = await gerenteCentro.client
    .from('purchases')
    .select('invoice_number, user_id')
    .eq('id', purchaseId)
    .single();

  const { data: prodAfterPur } = await gerenteCentro.client
    .from('products')
    .select('stock_quantity')
    .eq('id', testProd.id)
    .single();

  const { data: smPur } = await gerenteCentro.client
    .from('stock_movements')
    .select('*')
    .eq('product_id', testProd.id)
    .eq('origin', 'PURCHASE')
    .order('id', { ascending: false })
    .limit(1);

  const purchaseSuccess =
    !purErr &&
    purRecord?.invoice_number === 'NF-TESTE-001' &&
    purRecord?.user_id === gerenteCentro.user.id &&
    prodAfterPur?.stock_quantity === initialStock + 5 &&
    smPur?.length > 0;

  if (purchaseSuccess) {
    console.log(`[PASS] 4.1 RPC create_complete_purchase: Compra #${purchaseId} (${purDuration}ms) | NF: ${purRecord.invoice_number} | Estoque incrementado para ${prodAfterPur.stock_quantity} | origin = 'PURCHASE'`);
    results.bloco4.details.push(`Compra transacional com NF e usuário de auditoria (${purDuration}ms)`);
  } else {
    console.error(`[FAIL] 4.1 RPC create_complete_purchase: purErr=${purErr?.message} stock=${prodAfterPur?.stock_quantity}`);
    b4Pass = false;
  }

  // 4.2 Ajuste Manual de Estoque via RPC adjust_product_stock
  const t0_adj = Date.now();
  const { data: adjRes, error: adjErr } = await gerenteCentro.client.rpc('adjust_product_stock', {
    p_product_id: testProd.id,
    p_new_quantity: initialStock,
    p_reason: 'Ajuste de auditoria automatizada'
  });
  checkMissingRpcAndHalt(adjErr, 'adjust_product_stock');
  const adjDuration = Date.now() - t0_adj;

  const { data: prodAfterAdj } = await gerenteCentro.client
    .from('products')
    .select('stock_quantity')
    .eq('id', testProd.id)
    .single();

  const { data: smAdj } = await gerenteCentro.client
    .from('stock_movements')
    .select('*')
    .eq('product_id', testProd.id)
    .eq('origin', 'MANUAL_ADJUSTMENT')
    .order('id', { ascending: false })
    .limit(1);

  const adjustSuccess =
    !adjErr &&
    prodAfterAdj?.stock_quantity === initialStock &&
    smAdj?.length > 0;

  if (adjustSuccess) {
    console.log(`[PASS] 4.2 RPC adjust_product_stock: Estoque restaurado para ${initialStock} (${adjDuration}ms) | origin = 'MANUAL_ADJUSTMENT' | Motivo gravado`);
    results.bloco4.details.push(`Ajuste manual de estoque auditado (${adjDuration}ms)`);
  } else {
    console.error(`[FAIL] 4.2 RPC adjust_product_stock: adjErr=${adjErr?.message} stock=${prodAfterAdj?.stock_quantity}`);
    b4Pass = false;
  }

  results.bloco4.status = b4Pass ? 'PASS' : 'FAIL';

  // -------------------------------------------------------------------------
  // BLOCO 5: PROVISIONAMENTO E EXCLUSÃO DE USUÁRIO
  // -------------------------------------------------------------------------
  console.log('\n--- BLOCO 5: Provisionamento e Exclusão de Usuário ---');
  let b5Pass = true;

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const tempEmail = `teste.auditoria.${Date.now()}@giro.com`;
  const tempPass = 'SenhaAuditoria@2026';

  // 5.1 Cadastrar credencial em auth.users
  const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
    email: tempEmail,
    password: tempPass,
    options: { data: { full_name: 'Operador Temporário Audit' } }
  });

  if (signUpErr || !signUpData.user) {
    console.error(`[FAIL] 5.1 SignUp: ${signUpErr?.message}`);
    b5Pass = false;
  } else {
    const tempUserId = signUpData.user.id;
    console.log(`[PASS] 5.1 Criação de Credencial: Usuário auth criado (ID: ${tempUserId})`);

    // 5.2 Configurar perfil e confirmar email via RPC admin_configure_new_user com sessão de gerente.centro
    const t0_conf = Date.now();
    const { data: confRes, error: confErr } = await gerenteCentro.client.rpc('admin_configure_new_user', {
      p_user_id: tempUserId,
      p_full_name: 'Operador Auditado Confirmado',
      p_role: 'cashier_operator',
      p_branch_id: centroBranchId
    });
    checkMissingRpcAndHalt(confErr, 'admin_configure_new_user');
    const confDuration = Date.now() - t0_conf;

    if (confErr) {
      console.error(`[FAIL] 5.2 RPC admin_configure_new_user: ${confErr.message}`);
      b5Pass = false;
    } else {
      console.log(`[PASS] 5.2 RPC admin_configure_new_user: Perfil configurado e e-mail confirmado em ${confDuration}ms`);

      // 5.3 Testar login do usuário recém-criado
      const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
        email: tempEmail,
        password: tempPass
      });

      if (!loginErr && loginData.session?.access_token) {
        console.log(`[PASS] 5.3 Login de Usuário Novo: Autenticação imediata bem-sucedida`);
      } else {
        console.error(`[FAIL] 5.3 Login de Usuário Novo: ${loginErr?.message}`);
        b5Pass = false;
      }

      // 5.4 Excluir usuário via RPC admin_delete_user
      const t0_del = Date.now();
      const { data: delRes, error: delErr } = await gerenteCentro.client.rpc('admin_delete_user', {
        p_user_id: tempUserId
      });
      checkMissingRpcAndHalt(delErr, 'admin_delete_user');
      const delDuration = Date.now() - t0_del;

      const { data: profCheck } = await gerenteCentro.client
        .from('profiles')
        .select('*')
        .eq('id', tempUserId);

      const isDeleted = !delErr && profCheck?.length === 0;
      if (isDeleted) {
        console.log(`[PASS] 5.4 RPC admin_delete_user: Usuário removido de profiles e auth.users em ${delDuration}ms`);
        results.bloco5.details.push(`Ciclo de vida de usuário (criação, ativação e exclusão) auditado`);
      } else {
        console.error(`[FAIL] 5.4 RPC admin_delete_user: delErr=${delErr?.message} profCheck=${profCheck?.length}`);
        b5Pass = false;
      }
    }
  }

  results.bloco5.status = b5Pass ? 'PASS' : 'FAIL';

  console.log('\n================================================================');
  console.log('                 SUMÁRIO DOS TESTES DE BANCO                    ');
  console.log('================================================================');
  console.log(`Bloco 1 - RLS e Anti-Escalação:               [${results.bloco1.status}]`);
  console.log(`Bloco 2 - Turno Único e Transações de Caixa:   [${results.bloco2.status}]`);
  console.log(`Bloco 3 - Venda, CMV Histórico e Estorno:      [${results.bloco3.status}]`);
  console.log(`Bloco 4 - Compras e Ajuste de Estoque:         [${results.bloco4.status}]`);
  console.log(`Bloco 5 - Gestão e Exclusão de Usuários:       [${results.bloco5.status}]`);
  console.log('================================================================\n');

  const allPassed = Object.values(results).every((r) => r.status === 'PASS');
  if (!allPassed) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('\n[ERRO CRÍTICO NA EXECUÇÃO DO TESTE]:', err);
  process.exit(1);
});
