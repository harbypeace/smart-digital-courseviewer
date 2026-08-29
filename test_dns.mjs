import dns from 'dns/promises';

async function checkDns() {
  const resolver = new dns.Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);

  const domains = [
    'courseviewer-cf-pages.pages.dev',
    'main.courseviewer-cf-pages.pages.dev',
    'lesson-viewer.abduh-merzah.workers.dev',
  ];

  for (const d of domains) {
    try {
      const addresses = await resolver.resolve4(d);
      console.log(`[Cloudflare/Google DNS] ${d} -> Resolved IP:`, addresses);
    } catch (e) {
      console.log(`[Cloudflare/Google DNS] ${d} -> Failed:`, e.code);
    }

    try {
      const localAddresses = await dns.resolve4(d);
      console.log(`[Local Windows DNS]     ${d} -> Resolved IP:`, localAddresses);
    } catch (e) {
      console.log(`[Local Windows DNS]     ${d} -> Failed:`, e.code);
    }
    console.log('---');
  }
}
checkDns();
