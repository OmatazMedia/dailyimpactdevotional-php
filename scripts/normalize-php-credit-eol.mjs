#!/usr/bin/env node
/**
 * One-off: the first run of add-omataz-php-credit.mjs injected the credit
 * block with LF line endings while the backend files are CRLF. This script
 * rewrites the injected block (from `<?php` up to the end of the credit
 * docblock) using each file's dominant EOL, so line endings stay consistent.
 *
 * Usage: node scripts/normalize-php-credit-eol.mjs
 */
import {readdirSync, readFileSync, writeFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';

const CREDIT_START = '/**\n * ══════════════════════════════════════════════════════════\n *   Omataz Media — Web Development & Design';

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.php')) acc.push(full);
  }
  return acc;
}

function dominantEol(src) {
  const crlf = (src.match(/\r\n/g) || []).length;
  const lf = (src.match(/(?<!\r)\n/g) || []).length; // bare \n not part of \r\n
  return crlf >= lf ? '\r\n' : '\n';
}

let fixed = 0;
for (const file of walk('backend')) {
  let src = readFileSync(file, 'utf8');
  if (!src.startsWith('<?php') || !src.includes('Omataz Media — Web Development & Design')) continue;
  const eol = dominantEol(src);
  if (eol === '\n') continue; // LF file — nothing to do
  // Find the credit docblock start right after the opening tag.
  const open = src.indexOf('<?php');
  const start = src.indexOf(CREDIT_START, open);
  if (start < 0) continue;
  const end = src.indexOf('\n */', start);
  if (end < 0) continue;
  const block = src.slice(open, end + 4); // includes `<?php` .. ` */`
  if (block.includes('\r\n')) { fixed++; continue; } // already CRLF
  const converted = block.replace(/\n/g, '\r\n');
  src = src.slice(0, open) + converted + src.slice(end + 4);
  writeFileSync(file, src);
  fixed++;
  console.log(`• normalized ${relative(process.cwd(), file)}`);
}
console.log(`\nDone — ${fixed} file(s) normalized to CRLF.`);
