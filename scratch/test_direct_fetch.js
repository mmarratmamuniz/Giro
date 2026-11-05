async function testFetch() {
  try {
    const res = await fetch('https://aqtbmfgixlggbuwtorld.supabase.co/auth/v1/health');
    console.log('Status health:', res.status);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    console.error('Fetch error:', err.cause || err);
  }
}

testFetch();
