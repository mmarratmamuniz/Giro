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
  console.error('[FAIL] Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não encontradas.');
  process.exit(1);
}

const USERS = {
  super_admin: { email: 'super@giro.com', pass: '123456' },
  network_admin: { email: 'admin.rede@giro.com', pass: '123456' },
  branch_admin: { email: 'gerente.centro@giro.com', pass: '123456' },
  cashier_centro: { email: 'caixa.centro@giro.com', pass: '123456' },
  cashier_praia: { email: 'caixa.praia@giro.com', pass: '123456' },
};

async function createAuthenticatedClient(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Falha no login de ${email}: ${error.message}`);
  const { data: profile } = await client.from('profiles').select('*').eq('id', data.user.id).single();
  return { client, user: data.user, profile };
}

const testResults = [];

function recordTest(num, name, passed, detail) {
  testResults.push({
    test: `Teste ${num}: ${name}`,
    status: passed ? 'PASS' : 'FAIL',
    detail,
  });
  const tag = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
  console.log(`${tag} Teste ${num}: ${name} -> ${detail}`);
}

async function runHierarchyAudit() {
  console.log('========================================================================');
  console.log('       AUDITORIA E TESTE PRÁTICO DE HIERARQUIA E CONTROLE DE ACESSO     ');
  console.log('========================================================================\n');

  let testUserId = null;
  const tempEmail = `caixa.teste.${Date.now()}@giro.com`;
  const tempPass = 'Senha@123456';

  try {
    // 0. Obter clientes autenticados
    const caixaCentro = await createAuthenticatedClient(USERS.cashier_centro.email, USERS.cashier_centro.pass);
    const caixaPraia = await createAuthenticatedClient(USERS.cashier_praia.email, USERS.cashier_praia.pass);
    const gerenteCentro = await createAuthenticatedClient(USERS.branch_admin.email, USERS.branch_admin.pass);
    const adminRede = await createAuthenticatedClient(USERS.network_admin.email, USERS.network_admin.pass);
    const superAdmin = await createAuthenticatedClient(USERS.super_admin.email, USERS.super_admin.pass);

    const centroBranchId = gerenteCentro.profile.branch_id;
    const praiaBranchId = caixaPraia.profile.branch_id;
    const centroNetId = gerenteCentro.profile.network_id;

    // -------------------------------------------------------------------------
    // TESTE 1: Bloqueio de Operador de Caixa
    // -------------------------------------------------------------------------
    console.log('\n--- 1. TESTE DE BLOQUEIO DO OPERADOR DE CAIXA ---');
    const dummyId = '00000000-0000-0000-0000-000000000001';

    const { error: opConfigErr } = await caixaCentro.client.rpc('admin_configure_new_user', {
      p_user_id: dummyId,
      p_full_name: 'Tentativa Invasão',
      p_role: 'branch_admin',
    });
    const opConfigBlocked = !!opConfigErr && (opConfigErr.message.includes('Permissão negada') || opConfigErr.message.includes('Acesso negado'));

    const { error: opDelErr } = await caixaCentro.client.rpc('admin_delete_user', {
      p_user_id: dummyId,
    });
    const opDelBlocked = !!opDelErr && (opDelErr.message.includes('Permissão negada') || opDelErr.message.includes('Acesso negado'));

    recordTest(
      1,
      'Bloqueio de Operador de Caixa (admin_configure e admin_delete)',
      opConfigBlocked && opDelBlocked,
      `admin_configure: ${opConfigErr?.message || 'Permitido (ERRO)'} | admin_delete: ${opDelErr?.message || 'Permitido (ERRO)'}`
    );

    // -------------------------------------------------------------------------
    // TESTE 2: Trava de Escopo do Gerente de Filial
    // -------------------------------------------------------------------------
    console.log('\n--- 2. TESTE DE TRAVA DE ESCOPO DO GERENTE DE FILIAL ---');

    // Tentativa 2.1: Gerente tentando atribuir cargo superior (network_admin)
    const { error: gerHigherRoleErr } = await gerenteCentro.client.rpc('admin_configure_new_user', {
      p_user_id: dummyId,
      p_full_name: 'Tentativa Cargo Superior',
      p_role: 'network_admin',
      p_branch_id: centroBranchId,
    });
    const higherRoleBlocked = !!gerHigherRoleErr && gerHigherRoleErr.message.includes('Permissão negada');

    // Tentativa 2.2: Gerente tentando criar usuário em outra filial (Praia)
    const { data: crossBranchRes, error: gerCrossBranchErr } = await gerenteCentro.client.rpc('admin_configure_new_user', {
      p_user_id: dummyId,
      p_full_name: 'Tentativa Outra Filial',
      p_role: 'cashier_operator',
      p_branch_id: praiaBranchId,
    });
    // Ou falha com erro de permissão ou a RPC sobrescreve e força a própria filial Centro
    const crossBranchBlocked =
      (!!gerCrossBranchErr && gerCrossBranchErr.message.includes('Permissão negada')) ||
      (crossBranchRes && crossBranchRes.branch_id === centroBranchId);

    recordTest(
      2,
      'Trava de Escopo do Gerente de Filial (Anti-escalação e Anti-cross-branch)',
      higherRoleBlocked && crossBranchBlocked,
      `Cargo superior: ${gerHigherRoleErr?.message} | Cross-branch: ${gerCrossBranchErr ? gerCrossBranchErr.message : `Forçado para própria filial (${crossBranchRes?.branch_id})`}`
    );

    // -------------------------------------------------------------------------
    // TESTE 3: Criação Válida pelo Gerente de Filial
    // -------------------------------------------------------------------------
    console.log('\n--- 3. TESTE DE CRIAÇÃO VÁLIDA PELO GERENTE DE FILIAL ---');
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
      email: tempEmail,
      password: tempPass,
    });

    if (signUpErr || !signUpData.user) {
      throw new Error(`Falha no signUp do usuário de teste: ${signUpErr?.message}`);
    }
    testUserId = signUpData.user.id;

    // Configurar o novo usuário via gerente.centro
    const { data: confData, error: confErr } = await gerenteCentro.client.rpc('admin_configure_new_user', {
      p_user_id: testUserId,
      p_full_name: 'Caixa Teste Automatizado',
      p_role: 'cashier_operator',
      p_branch_id: centroBranchId,
    });

    if (confErr) {
      throw new Error(`Falha no admin_configure_new_user pelo gerente: ${confErr.message}`);
    }

    // Login imediato do novo usuário
    const { data: newLoginData, error: newLoginErr } = await anonClient.auth.signInWithPassword({
      email: tempEmail,
      password: tempPass,
    });

    const loginSuccess = !newLoginErr && !!newLoginData.user;

    // Cliente autenticado com a nova conta
    const newClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await newClient.auth.signInWithPassword({ email: tempEmail, password: tempPass });

    const { data: newProf } = await newClient.from('profiles').select('*').eq('id', testUserId).single();
    const correctBranch = newProf?.branch_id === centroBranchId;

    // Verificar se o novo caixa só vê vendas da sua filial
    const { data: salesCentro } = await newClient.from('sales').select('id, branch_id').eq('branch_id', praiaBranchId);
    const isolatedSales = (salesCentro?.length || 0) === 0;

    recordTest(
      3,
      'Criação Válida, Ativação Imediata e Isolamento do Novo Operador',
      loginSuccess && correctBranch && isolatedSales,
      `Login: ${loginSuccess ? 'Sucesso' : newLoginErr?.message} | Filial: ${newProf?.branch_id} | Vendas Praia visíveis: ${salesCentro?.length || 0}`
    );

    // -------------------------------------------------------------------------
    // TESTE 4: Bloqueio de Exclusão Cruzada
    // -------------------------------------------------------------------------
    console.log('\n--- 4. TESTE DE BLOQUEIO DE EXCLUSÃO CRUZADA ---');

    // Tentativa 4.1: Operador de outra filial tentando excluir o usuário da Filial Centro
    const { error: crossDelOpErr } = await caixaPraia.client.rpc('admin_delete_user', {
      p_user_id: testUserId,
    });
    const crossDelOpBlocked = !!crossDelOpErr && crossDelOpErr.message.includes('Permissão negada');

    // Tentativa 4.2: Se houvesse gerente de outra filial, mas testamos com caixaPraia que não pode excluir
    recordTest(
      4,
      'Bloqueio de Exclusão Cruzada (Usuário de outra filial)',
      crossDelOpBlocked,
      `Tentativa caixa.praia: ${crossDelOpErr?.message}`
    );

    // -------------------------------------------------------------------------
    // TESTE 5: Trava de Admin de Rede contra Super Admin
    // -------------------------------------------------------------------------
    console.log('\n--- 5. TESTE DE TRAVA DE ADMIN DE REDE CONTRA SUPER ADMIN ---');

    // Tentativa 5.1: admin.rede tentando promover alguém a super_admin
    const { error: netPromoteErr } = await adminRede.client.rpc('admin_configure_new_user', {
      p_user_id: testUserId,
      p_full_name: 'Tentativa Promoção Super Admin',
      p_role: 'super_admin',
    });
    const netPromoteBlocked = !!netPromoteErr && netPromoteErr.message.includes('Não é permitido atribuir o cargo super_admin');

    // Tentativa 5.2: admin.rede tentando excluir a conta do super@giro.com
    const { error: netDelSuperErr } = await adminRede.client.rpc('admin_delete_user', {
      p_user_id: superAdmin.user.id,
    });
    const netDelSuperBlocked = !!netDelSuperErr && netDelSuperErr.message.includes('Apenas super_admin pode excluir contas de super_admin');

    recordTest(
      5,
      'Trava de Admin de Rede contra Super Admin (Promoção e Exclusão)',
      netPromoteBlocked && netDelSuperBlocked,
      `Promoção: ${netPromoteErr?.message} | Exclusão super: ${netDelSuperErr?.message}`
    );

    // -------------------------------------------------------------------------
    // TESTE 6: Limpeza com Gerente de Filial
    // -------------------------------------------------------------------------
    console.log('\n--- 6. TESTE DE EXCLUSÃO VÁLIDA / LIMPEZA COM GERENTE ---');

    const { data: delData, error: delErr } = await gerenteCentro.client.rpc('admin_delete_user', {
      p_user_id: testUserId,
    });

    const delSuccess = !delErr && delData?.success === true;

    // Confirmar que o perfil sumiu de profiles
    const { data: checkProf } = await superAdmin.client.from('profiles').select('*').eq('id', testUserId).maybeSingle();
    const removedFromDb = checkProf === null;

    recordTest(
      6,
      'Limpeza e Exclusão Válida pelo Gerente da Filial',
      delSuccess && removedFromDb,
      `admin_delete_user: ${delSuccess ? 'Sucesso' : delErr?.message} | Perfil pós-deleção: ${removedFromDb ? 'Não existe (removido)' : 'Ainda presente'}`
    );

  } catch (err) {
    console.error('❌ Erro fatal durante a execução:', err);
  }

  console.log('\n========================================================================');
  console.log('             TABELA FINAL DE RESULTADOS DA HIERARQUIA                   ');
  console.log('========================================================================');
  console.table(testResults);

  const allPassed = testResults.length === 6 && testResults.every((r) => r.status === 'PASS');
  if (allPassed) {
    console.log('\n✔ TODOS OS 6 TESTES DE HIERARQUIA E ISOLAMENTO PASSARAM COM SUCESSO TOTAL!');
  } else {
    console.log('\n❌ Alguns testes falharam. Avalie a tabela acima.');
  }
}

runHierarchyAudit();

