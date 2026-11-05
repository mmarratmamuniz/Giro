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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  // Test if anon or authenticated can select from pg_policies via postgrest if exposed or check error
  const { data, error } = await supabase.from('pg_policies').select('*');
  console.log('Direct select pg_policies:', data, error ? error.message : '');

  // Check if we can create a view or check debug
  const { data: cols } = await supabase.from('sales').select('*').limit(1);
  console.log('Sample sales row keys:', cols ? Object.keys(cols[0] || {}) : 'none');
}

check();
