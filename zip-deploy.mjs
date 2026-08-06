// One-off helper: zips cpanel-upload/ into dailyimpact-devotional-cpanel.zip
// with the folder's *contents* at the archive root (extract straight into public_html).
//
// Uses Windows' built-in bsdtar (C:\Windows\System32\tar.exe) which supports the
// zip format via the -a auto-detect flag — reliable on this machine, no npm deps.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(__dirname, 'cpanel-upload');
const outFile = path.join(__dirname, 'dailyimpact-devotional-cpanel.zip');

if (!fs.existsSync(sourceDir)) {
  console.error('cpanel-upload folder not found — run the assembly step first.');
  process.exit(1);
}

// Ensure the upload-folder hardening file ships in every deploy (it lives in
// upload/.htaccess; upload/ is runtime-created so the file must be copied in
// whenever cpanel-upload is rebuilt).
const srcUploadHtaccess = path.join(__dirname, 'upload', '.htaccess');
const dstUploadHtaccess = path.join(sourceDir, 'upload', '.htaccess');
if (fs.existsSync(srcUploadHtaccess)) {
  fs.mkdirSync(path.dirname(dstUploadHtaccess), { recursive: true });
  fs.copyFileSync(srcUploadHtaccess, dstUploadHtaccess);
  console.log('📋 upload/.htaccess copied into cpanel-upload/');
} else {
  console.warn('⚠️  upload/.htaccess not found — upload hardening will be MISSING from the zip.');
}

// execSync on Windows defaults to cmd.exe, which needs %WINDIR% and quoted paths.
const bsdtar = '%WINDIR%\\System32\\tar.exe';
const command = `${bsdtar} -a -cf "${outFile}" -C "${sourceDir}" .`;
execSync(command, { shell: 'cmd.exe', stdio: 'inherit' });

const sizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
console.log(`✅ Created ${path.relative(__dirname, outFile)} (${sizeMB} MB)`);
