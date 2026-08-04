import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
console.log('script root:', root);
function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(f)) out.push(p);
  }
  return out;
}

// Collect action= values with their surrounding endpoint reference
const files = walk(path.join(root, 'src'));
console.log('walked files:', files.length);
const byEndpoint = {};
let totalRefs = 0;
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  // Find each "action=" occurrence and look backward for an endpoint filename
  for (const m of t.matchAll(/action=([a-z-]+)['"`]/g)) {
    totalRefs++;
    const before = t.slice(Math.max(0, m.index - 300), m.index);
    const epMatch = before.match(/([a-z-]+\.php)/g);
    const ep = epMatch ? epMatch[epMatch.length - 1] : 'UNKNOWN-ENDPOINT';
    (byEndpoint[ep] ??= new Set()).add(m[1]);
  }
}
console.log('frontend action refs:', totalRefs);
for (const [ep, acts] of Object.entries(byEndpoint)) {
  console.log(' ', ep, '->', [...acts].sort().join(', '));
}

// Compare with PHP handlers
let problems = 0;
for (const [ep, acts] of Object.entries(byEndpoint)) {
  const phpFile = path.join(root, 'backend/api', ep);
  if (!fs.existsSync(phpFile)) {
    console.log(`MISSING PHP FILE: ${ep}`);
    problems++;
    continue;
  }
  const php = fs.readFileSync(phpFile, 'utf8');
  const handled = new Set([...php.matchAll(/\$action === '([a-z-]+)'/g)].map((m) => m[1]));
  for (const a of acts) {
    if (!handled.has(a)) {
      console.log(`UNHANDLED ACTION: ${ep} -> ${a}`);
      problems++;
    }
  }
}
console.log(problems === 0 ? 'action parity: ALL OK' : `action parity: ${problems} PROBLEM(S)`);
