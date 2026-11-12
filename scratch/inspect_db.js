const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2]||'').replace(/^"|"$/g, '').trim();
});

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspect() {
  const { data: login, error: loginErr } = await client.auth.signInWithPassword({
    email: 'super@giro.com',
    password: '123456'
  });
  if (loginErr) {
    console.error('Login error:', loginErr);
    return;
  }
  console.log('Logged in as Super Admin:', login.user.id);

  const { data: networks } = await client.from('networks').select('*');
  console.log('NETWORKS:', JSON.stringify(networks, null, 2));

  const { data: branches } = await client.from('branches').select('*');
  console.log('BRANCHES:', JSON.stringify(branches, null, 2));

  const { data: categories } = await client.from('categories').select('*');
  console.log('CATEGORIES:', JSON.stringify(categories, null, 2));
}

inspect();

