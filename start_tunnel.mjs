import { startTunnel } from 'untun';

async function main() {
  const tunnel = await startTunnel({ port: 8788 });
  const url = await tunnel.getURL();
  console.log('════════════════════════════════════════════════════════');
  console.log('🚀 LIVE PUBLIC CLOUDFLARE TUNNEL URL:');
  console.log(url);
  console.log('════════════════════════════════════════════════════════');
}
main();
