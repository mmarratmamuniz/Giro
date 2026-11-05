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

async function testPageQueries() {
  await client.auth.signInWithPassword({
    email: 'caixa.praia@giro.com',
    password: '123456'
  });

  const tests = [
    {
      name: 'Caixa - turnos e caixas',
      fn: async () => {
        const shifts = await client.from('cash_shifts').select('*, cash_desk:cash_desks(*)');
        const transactions = await client.from('cash_transactions').select('*');
        return { shiftsErr: shifts.error?.message, transErr: transactions.error?.message };
      }
    },
    {
      name: 'PDV - produtos e turnos abertos',
      fn: async () => {
        const prods = await client.from('products').select('*').eq('is_active', true);
        const activeShift = await client.from('cash_shifts').select('*, cash_desk:cash_desks(*)').eq('status', 'open');
        return { prodsErr: prods.error?.message, shiftErr: activeShift.error?.message, totalProds: prods.data?.length };
      }
    },
    {
      name: 'Histórico - vendas com itens e produtos',
      fn: async () => {
        const sales = await client.from('sales').select('*, branch:branches(name), cash_desk:cash_desks(name), sale_items(*, products(name, sku))').order('date', { ascending: false }).limit(10);
        return { salesErr: sales.error?.message, count: sales.data?.length, sampleItems: sales.data?.[0]?.sale_items };
      }
    },
    {
      name: 'Relatórios - agregações de vendas e produtos',
      fn: async () => {
        const sales = await client.from('sales').select('id, total_amount, discount_amount, date, payment_method, branch_id');
        const movements = await client.from('stock_movements').select('*, product:products(name, cost_price, sale_price)');
        return { salesErr: sales.error?.message, moveErr: movements.error?.message };
      }
    },
    {
      name: 'Estoque - produtos com categoria',
      fn: async () => {
        const prods = await client.from('products').select('*, category:categories(name)');
        return { prodsErr: prods.error?.message, count: prods.data?.length };
      }
    },
    {
      name: 'Compras - compras com fornecedor e itens',
      fn: async () => {
        const purchases = await client.from('purchases').select('*, purchase_items(*, product:products(name))');
        return { purchasesErr: purchases.error?.message, count: purchases.data?.length };
      }
    },
    {
      name: 'Redes e Filiais - hierarquia',
      fn: async () => {
        const net = await client.from('networks').select('*');
        const units = await client.from('units').select('*');
        const branches = await client.from('branches').select('*');
        return { netErr: net.error?.message, unitsErr: units.error?.message, branchesErr: branches.error?.message };
      }
    }
  ];

  console.log('=== TESTE DE CONSULTAS REAIS DO FRONTEND ===\n');
  for (const t of tests) {
    try {
      const res = await t.fn();
      console.log(`[${t.name}]:`, JSON.stringify(res));
    } catch (e) {
      console.log(`[${t.name}] EXCEÇÃO:`, e.message);
    }
  }
}

testPageQueries();
