const BASE = 'http://127.0.0.1:8788';

const CLASSROOMS_TO_TEST = [
  { subject: 'adb10p1', unit: 'u1', lesson: 'l1', id: '1v_nRmh_wh', label: 'أدب 10 - درس 1' },
  { subject: 'adb10p1', unit: 'u1', lesson: 'l2', id: 'FtoY-ugPEF', label: 'أدب 10 - درس 2' },
  { subject: 'adb10p1', unit: 'u1', lesson: 'l3', id: 'Gd3-ORVDr8', label: 'أدب 10 - درس 3' },
  { subject: 'bio10p1', unit: 'u1', lesson: 'l1', id: 'KbOpmXdyXa', label: 'أحياء 10 - درس 1' },
  { subject: 'bio10p1', unit: 'u1', lesson: 'l2', id: 'ha_S-1rMCe', label: 'أحياء 10 - درس 2' },
  { subject: 'chm11p1', unit: 'u1', lesson: 'l1', id: 'fiKPGkSoOb', label: 'كيمياء 11 - درس 1' },
  { subject: 'phy10p1', unit: 'u1', lesson: 'l1', id: 'dMLnMKX3RM', label: 'فيزياء 10 - درس 1' },
  { subject: 'math10p1', unit: 'u1', lesson: 'l1', id: '4qmbpHtVkV', label: 'رياضيات 10 - درس 1' },
];

async function testClassroom(c) {
  const url = `${BASE}/api/classroom-data?subject=${c.subject}&unit=${c.unit}&lesson=${c.lesson}&id=${c.id}`;
  const t0 = performance.now();
  try {
    const res = await fetch(url);
    const duration = Math.round(performance.now() - t0);
    const json = await res.json();
    const stageName = json.data?.stage?.name || 'No Stage Name';
    const scenesCount = json.data?.scenes?.length || 0;
    const ok = res.ok && scenesCount > 0;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${c.label} (${c.id})`);
    console.log(`       Status: HTTP ${res.status} (${duration}ms) | Key: ${json.key}`);
    console.log(`       Stage: "${stageName}" | Scenes: ${scenesCount}\n`);
    return ok;
  } catch (err) {
    console.log(`[FAIL] ${c.label} (${c.id}): ${err.message}\n`);
    return false;
  }
}

async function main() {
  console.log('--- Testing Multiple Classroom IDs in Cloudflare Pages ---\n');
  let passed = 0;
  for (const c of CLASSROOMS_TO_TEST) {
    const ok = await testClassroom(c);
    if (ok) passed++;
  }
  console.log(`==================================================`);
  console.log(`📊 Result: ${passed}/${CLASSROOMS_TO_TEST.length} classrooms resolved successfully.`);
  console.log(`==================================================`);
}

main();
