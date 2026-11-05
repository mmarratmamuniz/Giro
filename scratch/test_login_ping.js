const fs = require('fs');
const path = require('path');
const { createClient } = require(path.resolve('c:/Users/Marratma TE/Documents/Projetos/Giro/node_modules/@supabase/supabase-js'));

const envContent = fs.readFileSync('c:/Users/Marratma TE/Documents/Projetos/Giro/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2]||'').replace(/^"|"$/g, '');
});

console.log('Testing Supabase URL:', env.NEXT_PUBLIC_SUPABASE_URL);

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testLogin() {
  try {
    const start = Date.now();
    const { data, error } = await client.auth.signInWithPassword({
      email: 'caixa.praia@giro.com',
      password: '123456'
    });
    console.log(`Tempo: ${Date.now() - start}ms`);
    if (error) {
      console.log('Error from Supabase:', error);
    } else {
      console.log('Login bem-sucedido! User ID:', data.user.id);
    }
  } catch (err) {
    console.error('Exceção ao chamar Supabase:', err);
  }
}

testLogin();
