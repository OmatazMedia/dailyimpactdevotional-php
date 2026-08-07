#!/usr/bin/env node
/**
 * Omataz Media — PHP credit header injector.
 *
 * Prepends the developer credit block after the opening `<?php` tag in every
 * file passed on the command line (or every PHP file under backend/ by
 * default). Skips files that already carry the credit, so it is safe to run
 * repeatedly — including on other projects.
 *
 * Usage:
 *   node scripts/add-omataz-php-credit.mjs                       (backend only)
 *   node scripts/add-omataz-php-credit.mjs src/a.php src/b.php   (specific)
 */
import {readdirSync, readFileSync, writeFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';

const CREDIT = `/**
 * ══════════════════════════════════════════════════════════
 *   Omataz Media — Web Development & Design
 *   Website   : https://www.omatazmedia.com.ng
 *   Email     : hello@omatazmedia.com.ng
 *   Phone     : +234 9024599289, +234 7037373304
 *   WhatsApp  : https://wa.me/message/M3QUHNVONY6NK1
 *   Social    : @omatazmedia — Facebook · Instagram · X · YouTube
 *   GitHub    : https://github.com/omatazmedia
 *   Contact   : Johnson Toluwani
 * ══════════════════════════════════════════════════════════
 */
`;

const MARKER = 'Omataz Media — Web Development & Design';

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (entry.endsWith('.php')) {
      acc.push(full);
    }
  }
  return acc;
}

const args = process.argv.slice(2);
const files = args.length > 0 ? args : walk('backend');

function dominantEol(src) {
  const crlf = (src.match(/\r\n/g) || []).length;
  const lf = (src.match(/(?<!\r)\n/g) || []).length; // bare \n not part of \r\n
  return crlf >= lf ? '\r\n' : '\n';
}

let changed = 0;
for (const file of files) {
  let src = readFileSync(file, 'utf8');
  if (src.includes(MARKER)) {
    console.log(`• skip  ${relative(process.cwd(), file)} (already credited)`);
    continue;
  }
  if (!src.startsWith('<?php')) {
    console.log(`• skip  ${relative(process.cwd(), file)} (no opening <?php)`);
    continue;
  }
  const eol = dominantEol(src);
  const block = eol === '\r\n' ? CREDIT.replace(/\n/g, '\r\n') : CREDIT;
  src = '<?php' + eol + block + src.slice('<?php'.length);
  writeFileSync(file, src);
  changed++;
  console.log(`• added ${relative(process.cwd(), file)} (${eol === '\r\n' ? 'CRLF' : 'LF'})`);
}

console.log(`\nDone — ${changed} file(s) credited.`);
