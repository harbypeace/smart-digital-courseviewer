import toml from 'fs';

async function checkCloudflare() {
  const token = 'cfoat_WNTUhe9Vl51V_hdKr6752M5bGvxXOrdzUrX6YSymKMI.g_t9y60I4hgofq_WUx3tJO8YKUVBCNuy4W_BaCtMczc';
  const accountId = '656055b2b0eea86b43dd2fd4853c100f';

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 1. List Zones
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/zones', { headers });
    const json = await res.json();
    console.log('--- Zones in Account ---');
    if (json.result && json.result.length > 0) {
      json.result.forEach(z => console.log(`Zone: ${z.name} (id: ${z.id}, status: ${z.status})`));
    } else {
      console.log('No custom domain zones found.');
    }
  } catch (e) {
    console.log('Zone check failed:', e.message);
  }

  // 2. Get Pages Project details
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/courseviewer-cf-pages`, { headers });
    const json = await res.json();
    console.log('\n--- Pages Project Details ---');
    console.log('Name:', json.result?.name);
    console.log('Subdomain:', json.result?.subdomain);
    console.log('Domains:', json.result?.domains);
    console.log('Canonical Deployment URL:', json.result?.canonical_deployment?.url);
  } catch (e) {
    console.log('Pages check failed:', e.message);
  }

  // 3. Get Workers subdomain
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, { headers });
    const json = await res.json();
    console.log('\n--- Workers Subdomain ---');
    console.log('Subdomain:', json.result?.subdomain);
  } catch (e) {
    console.log('Workers subdomain check failed:', e.message);
  }
}
checkCloudflare();
