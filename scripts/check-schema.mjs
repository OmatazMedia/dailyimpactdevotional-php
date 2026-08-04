import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sql = fs.readFileSync(path.join(root, 'backend/database.sql'), 'utf8');

// ── Parse CREATE TABLE definitions (table -> Set of columns) ──
const tables = {};
for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS `(\w+)`\s*\(([\s\S]*?)\)\s*ENGINE=/g)) {
  const name = m[1];
  const cols = new Set();
  for (const cm of m[2].matchAll(/`(\w+)`\s+[^\n,]+/g)) cols.add(cm[1]);
  tables[name] = cols;
}
console.log('tables in schema:', Object.keys(tables).sort().join(', '));

// ── Walk PHP files ──
const problems = [];
let tableRefs = 0;
function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.php$/.test(f)) out.push(p);
  }
  return out;
}

// strip string literals AND comments so we only match real SQL
function stripStrings(php) {
  let s = php.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/\/\/[^\n]*/g, ' ');
  s = s.replace(/#[^\n]*/g, ' ');
  return s;
}

for (const f of walk(path.join(root, 'backend'))) {
  const rel = path.relative(root, f);
  const php = fs.readFileSync(f, 'utf8');
  const noStrings = stripStrings(php);

  // FROM/JOIN/INTO/UPDATE <table>
  for (const m of noStrings.matchAll(/\b(FROM|JOIN|INTO|UPDATE|TABLE|DELETE FROM)\s+([a-z_][a-z0-9_]*)\b/gi)) {
    const tbl = m[2];
    tableRefs++;
    if (!tables[tbl]) problems.push(`${rel}: table '${tbl}' (${m[1]}) not in schema`);
  }

  // INSERT INTO t (col, col, ...)
  for (const m of noStrings.matchAll(/INSERT INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
    const tbl = m[1];
    if (!tables[tbl]) continue;
    for (const cm of m[2].matchAll(/`?([a-z_][a-z0-9_]*)`?/gi)) {
      const col = cm[1];
      if (['SELECT', 'INSERT', 'VALUES', 'INTO'].includes(col.toUpperCase())) continue;
      if (!tables[tbl].has(col)) problems.push(`${rel}: INSERT column '${col}' on ${tbl} not in schema`);
    }
  }

  // WHERE/SET/ON col = ... near each known table mention
  for (const [tbl, cols] of Object.entries(tables)) {
    if (!noStrings.includes(tbl)) continue;
    const re = new RegExp('\\b' + tbl + '\\b[\\s\\S]{0,300}?\\b(WHERE|ON|SET)\\s+([a-z_][a-z0-9_]*)', 'gi');
    for (const m of noStrings.matchAll(re)) {
      const col = m[2];
      if (!cols.has(col)) problems.push(`${rel}: column '${col}' referenced near table ${tbl} not in schema`);
    }
  }
}
console.log('table references found:', tableRefs);
console.log(problems.length === 0 ? 'SCHEMA CONTRACT: ALL OK' : '\n' + [...new Set(problems)].join('\n'));
