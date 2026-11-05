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

async function testRlsUser(email, password, roleDesc) {
  console.log(`\n================================================================`);
  console.log(`🔐 TESTANDO CONTEXTO AUTENTICADO: ${email} (${roleDesc})`);
  console.log(`================================================================`);

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    console.error(`❌ Erro ao autenticar ${email}:`, authError.message);
    return;
  }

  console.log(`✅ Autenticado como ${email} (UID: ${authData.user.id})`);

  const authClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${authData.session.access_token}`
      }
    }
  });

  // 1. Tentar ler vendas
  const { data: sales, error: salesErr } = await authClient.from('sales').select('id, branch_id, total_amount');
  console.log(`  📊 Vendas visíveis via SDK: ${sales ? sales.length : 0} linha(s)`, salesErr ? `(Erro: ${salesErr.message})` : '');
  if (sales && sales.length > 0) {
    sales.forEach(s => console.log(`     -> Venda #${s.id} | Filial: ${s.branch_id} | Total: R$ ${s.total_amount}`));
  }

  // 2. Tentar ler compras
  const { data: purchases, error: purErr } = await authClient.from('purchases').select('id, branch_id, supplier, total_amount');
  console.log(`  📦 Compras visíveis via SDK: ${purchases ? purchases.length : 0} linha(s)`, purErr ? `(Erro: ${purErr.message})` : '');
  if (purchases && purchases.length > 0) {
    purchases.forEach(p => console.log(`     -> Compra #${p.id} | Filial: ${p.branch_id} | Fornecedor: ${p.supplier}`));
  }

  // 3. Tentar ler perfis
  const { data: profiles, error: profErr } = await authClient.from('profiles').select('email, role, branch_id');
  console.log(`  👥 Perfis visíveis via SDK: ${profiles ? profiles.length : 0} linha(s)`, profErr ? `(Erro: ${profErr.message})` : '');
  if (profiles && profiles.length > 0) {
    profiles.forEach(p => console.log(`     -> [${p.role}] ${p.email}`));
  }

  await supabase.auth.signOut();
}

async function runPenetrationAudit() {
  console.log('🚀 INICIANDO AUDITORIA DE SEGURANÇA E RLS NATIVO...');
  
  // Testar com Caixa Centro (não deve ver Praia nem Compras nem Super Admin)
  await testRlsUser('caixa.centro@giro.com', '123456', 'Operador Caixa Centro');

  // Testar com Caixa Praia (não deve ver Centro nem Compras)
  await testRlsUser('caixa.praia@giro.com', '123456', 'Operador Caixa Praia');

  // Testar com Gerente Centro (vê dados do Centro e compras do Centro)
  await testRlsUser('gerente.centro@giro.com', '123456', 'Gerente Loja Centro');

  // Testar com Super Admin (vê tudo)
  await testRlsUser('super@giro.com', '123456', 'Super Administrador Giro');

  console.log('\n================================================================');
  console.log('🏁 AUDITORIA FINALIZADA');
  console.log('================================================================');
}

runPenetrationAudit();
