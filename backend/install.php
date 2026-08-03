<?php
/**
 * Daily Impact Devotional - Multi-Step Installer
 * 
 * STEP 1 → System Requirements (pre-flight checks)
 * STEP 2 → Database Configuration
 * STEP 3 → Admin Account
 * STEP 4 → Review & Confirm
 * STEP 5 → Installation & Post-Install Verification
 * 
 * Delete this file after installation for security.
 */

// ─── Helper Functions ──────────────────────────────────────────────────────

function boolIcon($val): string { return $val ? '✅' : '❌'; }

function checkDirWritable(string $dir): bool {
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    if (!is_dir($dir)) return false;
    $test = rtrim($dir, '/') . '/.perm_test_' . uniqid();
    $ok = @file_put_contents($test, 'ok');
    @unlink($test);
    return $ok !== false;
}

function filePermissionStr(string $path): string {
    if (!file_exists($path)) return 'N/A';
    return substr(sprintf('%o', fileperms($path)), -4);
}

// ─── State ─────────────────────────────────────────────────────────────────

$configFile = __DIR__ . '/config/db.php';
$uploadBase = __DIR__ . '/../upload';
$headersDir = $uploadBase . '/headers';
$devotionalsDir = $uploadBase . '/devotional';
$htaccessPath = __DIR__ . '/../.htaccess';
$apiHtaccess = __DIR__ . '/api/.htaccess';
$sqlPath = __DIR__ . '/database.sql';
$configDir = __DIR__ . '/config';

$error   = '';
$success = '';
$installed = false;

// ─── Pre-Flight Checks ─────────────────────────────────────────────────────

$checks = [
    'php_version' => [
        'label' => 'PHP 8.0 or higher',
        'pass'  => version_compare(PHP_VERSION, '8.0', '>='),
        'detail'=> PHP_VERSION,
    ],
];

foreach (['pdo', 'pdo_mysql', 'json', 'mbstring', 'session', 'fileinfo', 'curl', 'openssl'] as $ext) {
    $checks['ext_' . $ext] = [
        'label' => "PHP Extension: $ext",
        'pass'  => extension_loaded($ext),
        'detail'=> extension_loaded($ext) ? 'Loaded' : 'MISSING',
    ];
}

$pw = checkDirWritable($uploadBase);
$checks['uploads_dir'] = [
    'label' => 'Uploads directory writable',
    'pass'  => $pw,
    'detail'=> $pw ? 'Writable' : 'NOT writable — files will not save',
];

$hw = checkDirWritable($headersDir);
$checks['headers_dir'] = [
    'label' => 'Headers subdirectory writable',
    'pass'  => $hw,
    'detail'=> $hw ? 'Writable' : 'NOT writable',
];

$dw = checkDirWritable($devotionalsDir);
$checks['devotionals_dir'] = [
    'label' => 'Devotionals subdirectory writable',
    'pass'  => $dw,
    'detail'=> $dw ? 'Writable' : 'NOT writable',
];

$checks['htaccess'] = [
    'label' => '.htaccess file present (Apache routing)',
    'pass'  => file_exists($htaccessPath),
    'detail'=> file_exists($htaccessPath) ? filesize($htaccessPath) . ' bytes' : 'MISSING',
];

$checks['api_htaccess'] = [
    'label' => 'API .htaccess present (API routing)',
    'pass'  => file_exists($apiHtaccess),
    'detail'=> file_exists($apiHtaccess) ? 'Found' : 'MISSING',
];

$checks['config_writable'] = [
    'label' => 'Config directory writable (for db.php)',
    'pass'  => is_dir($configDir) && is_writable($configDir),
    'detail'=> is_writable($configDir) ? 'Writable' : 'NOT writable',
];

$checks['database_sql'] = [
    'label' => 'database.sql schema file present',
    'pass'  => file_exists($sqlPath),
    'detail'=> file_exists($sqlPath) ? 'Found' : 'MISSING',
];

$allPreflightPass = true;
foreach ($checks as $c) {
    if (isset($c['pass']) && !$c['pass']) $allPreflightPass = false;
}

// ─── AJAX detection ───────────────────────────────────────────────────────
$isAjax = !empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';

// ─── Handle Form Submission ────────────────────────────────────────────────

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$allPreflightPass) {
        $error = 'Pre-flight checks failed. Fix the ❌ items above and refresh.';
        if ($isAjax) { header('Content-Type: application/json'); echo json_encode(['success'=>false,'message'=>$error]); exit; }
    } else {
        $host   = $_POST['db_host'] ?? 'localhost';
        $name   = $_POST['db_name'] ?? 'dailyimpact_devotional';
        $user   = $_POST['db_user'] ?? '';
        $pass   = $_POST['db_pass'] ?? '';
        $adminEmail = $_POST['admin_email'] ?? 'admin@ministries.org';
        $adminPass  = $_POST['admin_password'] ?? '';
        $adminName  = $_POST['admin_name'] ?? 'Admin';

        if (empty($user) || empty($adminPass)) {
            $error = 'Database username and admin password are required.';
            if ($isAjax) { header('Content-Type: application/json'); echo json_encode(['success'=>false,'message'=>$error]); exit; }
        } elseif (strlen($adminPass) < 6) {
            $error = 'Admin password must be at least 6 characters.';
            if ($isAjax) { header('Content-Type: application/json'); echo json_encode(['success'=>false,'message'=>$error]); exit; }
        } else {
            try {
                $testPdo = new PDO("mysql:host=$host;charset=utf8mb4", $user, $pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                ]);
                $testPdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                $testPdo->exec("USE `$name`");

                // ── Write config file (preserve ALL functions) ────────
                $escapedPass = addslashes($pass);
                // Load the config template: the existing db.php if present (preserves
                // any local credential edits), otherwise the pristine template shipped
                // alongside the installer (config/db.php.dist). The dist file guarantees
                // a fresh install gets the complete current function set (httpMethod(),
                // AES secret encryption, decrypt-aware getSettings()).
                if (file_exists($configFile)) {
                    $configContent = file_get_contents($configFile);
                    // If the existing config is from an older deployment (missing the
                    // current helper set), fall back to the pristine template.
                    if (!is_string($configContent) || strpos($configContent, 'function httpMethod') === false) {
                        $distFile = __DIR__ . '/config/db.php.dist';
                        $restored = is_file($distFile) ? file_get_contents($distFile) : false;
                        if (is_string($restored) && $restored !== '') {
                            $configContent = $restored;
                        }
                    }
                } else {
                    // No existing file — restore the full, current template.
                    $distFile = __DIR__ . '/config/db.php.dist';
                    $configContent = is_file($distFile) ? file_get_contents($distFile) : '';
                }
                // Update ONLY the credential lines — leave everything else intact
                $configContent = preg_replace(
                    ['/\$db_host\s*=\s*[\'\"][^\'\"]*[\'\"]\s*;/', '/\$db_name\s*=\s*[\'\"][^\'\"]*[\'\"]\s*;/', '/\$db_user\s*=\s*[\'\"][^\'\"]*[\'\"]\s*;/', '/\$db_pass\s*=\s*[\'\"][^\'\"]*[\'\"]\s*;/'],
                    ["\$db_host = '{$host}';", "\$db_name = '{$name}';", "\$db_user = '{$user}';", "\$db_pass = '{$escapedPass}';"],
                    $configContent
                );
                file_put_contents($configFile, $configContent);

                require_once $configFile;
                $pdo = new PDO("mysql:host=$host;dbname=$name;charset=utf8mb4", $user, $pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]);

                // ── Run schema ─────────────────────────────────────────
                $schema = file_get_contents($sqlPath);
                if ($schema) {
                    $schema = preg_replace('/--.*$/m', '', $schema);
                    $schema = preg_replace('/\n\s*\n/', "\n", $schema);
                    try {
                        $pdo->exec($schema);
                    } catch (PDOException $e) {
                        foreach (explode(';', $schema) as $stmt) {
                            $stmt = trim($stmt);
                            if (!empty($stmt)) {
                                try { $pdo->exec($stmt); } catch (PDOException $e2) { /* ignore "already exists" */ }
                            }
                        }
                    }
                }

                // ── Create admin user ───────────────────────────────────
                $hash = password_hash($adminPass, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare("UPDATE admin_users SET password_hash = ?, name = ?, email = ? WHERE email = 'admin@ministries.org' OR id = 1");
                $stmt->execute([$hash, $adminName, $adminEmail]);
                if ($stmt->rowCount() === 0) {
                    $pdo->prepare("INSERT IGNORE INTO admin_users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')")
                        ->execute([$adminEmail, $hash, $adminName]);
                }

                // ── Ensure upload and session dirs exist ───────────────
                foreach ([$uploadBase, $uploadBase . '/headers', $uploadBase . '/devotional'] as $d) {
                    if (!is_dir($d)) @mkdir($d, 0777, true);
                }
                $sessionDir = __DIR__ . '/../tmp/sessions';
                if (!is_dir($sessionDir)) @mkdir($sessionDir, 0777, true);

                // ── POST-INSTALL VERIFICATION ───────────────────────────
                $postTests = [];

                $postTests['db_connect'] = ['label'=>'Database connection', 'pass'=>true, 'detail'=>"Connected to '$name'"];

                $expectedTables = ['settings','devotionals','header_mappings','foreword_posts','donations','login_logs','admin_users','telegram_log','mail_queue','uploaded_files'];
                $actualTables = [];
                try {
                    $stmt = $pdo->query("SHOW TABLES");
                    $actualTables = $stmt->fetchAll(PDO::FETCH_COLUMN);
                } catch (Exception $e) {}
                foreach ($expectedTables as $tbl) {
                    $exists = in_array($tbl, $actualTables);
                    $rowCount = 0;
                    if ($exists) {
                        try { $rowCount = (int)$pdo->query("SELECT COUNT(*) FROM `$tbl`")->fetchColumn(); } catch (Exception $e) {}
                    }
                    $postTests['table_' . $tbl] = [
                        'label' => "Table: $tbl",
                        'pass'  => $exists,
                        'detail'=> $exists ? "Exists — $rowCount rows" : 'MISSING',
                    ];
                }

                $adminExists = false;
                try {
                    $stmt = $pdo->prepare("SELECT COUNT(*) FROM admin_users WHERE email = ?");
                    $stmt->execute([$adminEmail]);
                    $adminExists = (int)$stmt->fetchColumn() > 0;
                } catch (Exception $e) {}
                $postTests['admin_user'] = [
                    'label' => "Admin account ($adminEmail)",
                    'pass'  => $adminExists,
                    'detail'=> $adminExists ? 'Created' : 'Failed',
                ];

                $ww = checkDirWritable($uploadBase);
                $postTests['uploads_writable'] = ['label'=>'Uploads writable', 'pass'=>$ww, 'detail'=>$ww ? 'OK' : 'FAILED'];
                
                $hh = checkDirWritable($headersDir);
                $postTests['headers_writable'] = ['label'=>'Headers subdir writable', 'pass'=>$hh, 'detail'=>$hh ? 'OK' : 'FAILED'];
                
                $dd = checkDirWritable($devotionalsDir);
                $postTests['devotionals_writable'] = ['label'=>'Devotionals subdir writable', 'pass'=>$dd, 'detail'=>$dd ? 'OK' : 'FAILED'];

                $postTests['htaccess_final'] = ['label'=>'.htaccess file', 'pass'=>file_exists($htaccessPath), 'detail'=>file_exists($htaccessPath) ? filePermissionStr($htaccessPath) : 'MISSING'];

                // API health test
                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $apiUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . '/backend/api/health.php';
                $ch = @curl_init($apiUrl);
                $apiOk = false; $apiDetail = '';
                if ($ch) {
                    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>5, CURLOPT_CONNECTTIMEOUT=>3]);
                    $resp = @curl_exec($ch);
                    $httpCode = @curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    $curlErr = curl_error($ch);
                    @curl_close($ch);
                    if ($httpCode >= 200 && $httpCode < 300) {
                        $data = json_decode($resp, true);
                        $apiOk = ($data['status'] ?? '') === 'ok';
                        $apiDetail = "HTTP $httpCode — " . ($data['status'] ?? '');
                    } else {
                        $apiDetail = "HTTP $httpCode" . ($curlErr ? " ($curlErr)" : '');
                    }
                } else { $apiDetail = 'cURL unavailable'; }
                $postTests['api_health'] = ['label'=>'API health (/backend/api/health.php)', 'pass'=>$apiOk, 'detail'=>$apiDetail];

                // DB write test
                $testDevId = 'test_' . uniqid();
                $devWriteOk = false;
                try {
                    $pdo->prepare("INSERT INTO devotionals (id, date, year, title, author) VALUES (?,?,?,?,?)")->execute([$testDevId, 'Test', 2025, 'Install Test', 'System']);
                    $pdo->prepare("DELETE FROM devotionals WHERE id = ?")->execute([$testDevId]);
                    $devWriteOk = true;
                } catch (Exception $e) {}
                $postTests['devotional_write'] = ['label'=>'Database write test', 'pass'=>$devWriteOk, 'detail'=>$devWriteOk ? 'Insert+Delete OK' : 'Failed'];

                $allPostPass = true;
                foreach ($postTests as $pt) { if (!$pt['pass']) $allPostPass = false; }

                $installed = true;
                $success = $allPostPass
                    ? '✅ Installation complete — all systems operational!'
                    : '✅ Installation complete — but some checks need attention ⚠️';

                if ($isAjax) {
                    header('Content-Type: application/json');
                    echo json_encode([
                        'success' => true,
                        'message' => $success,
                        'allPass' => $allPostPass,
                        'adminEmail' => $adminEmail,
                        'tests' => array_values(array_map(function($t) { return ['label'=>$t['label'],'pass'=>$t['pass'],'detail'=>$t['detail']]; }, $postTests)),
                    ]);
                    exit;
                }

            } catch (PDOException $e) { $error = 'Database error: ' . $e->getMessage(); if ($isAjax) { header('Content-Type: application/json'); echo json_encode(['success'=>false,'message'=>$error]); exit; } }
              catch (Exception $e) { $error = 'Error: ' . $e->getMessage(); if ($isAjax) { header('Content-Type: application/json'); echo json_encode(['success'=>false,'message'=>$error]); exit; } }
        }
    }
}

// ─── AJAX Action Handlers ──────────────────────────────────────────────────

$action = $_GET['action'] ?? '';
if ($action === 'test_db') {
    header('Content-Type: application/json');
    $host = $_GET['host'] ?? 'localhost';
    $name = $_GET['name'] ?? 'dailyimpact_devotional';
    $user = $_GET['user'] ?? '';
    $pass = $_GET['pass'] ?? '';

    try {
        $testPdo = new PDO("mysql:host=$host;charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $testPdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $testPdo->exec("USE `$name`");
        $testPdo->exec("CREATE TABLE IF NOT EXISTS _install_test (id INT AUTO_INCREMENT PRIMARY KEY, val VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        $testPdo->exec("INSERT INTO _install_test (val) VALUES ('daily-impact-write-test-ok')");
        $insertId = $testPdo->lastInsertId();
        $stmt = $testPdo->query("SELECT val, created_at FROM _install_test WHERE id = $insertId");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $readback = $row['val'] ?? '';
        $testPdo->exec("DROP TABLE _install_test");

        echo json_encode([
            'success' => true,
            'message' => '✅ Connection OK — write, read & delete all passed!',
            'details' => [
                'connect' => 'Connected to MySQL',
                'write' => "Inserted row #$insertId",
                'read' => "Read back: \"$readback\"",
                'delete' => 'Test table dropped',
            ]
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => '❌ ' . $e->getMessage()]);
    }
    exit;
}

if ($action === 'test_upload') {
    header('Content-Type: application/json');
    $results = [];
    $allOk = true;
    foreach (['uploads' => $uploadBase, 'headers' => $headersDir, 'devotionals' => $devotionalsDir] as $label => $dir) {
        $r = ['label' => $label, 'dir' => $dir];
        if (!is_dir($dir)) @mkdir($dir, 0777, true);
        $testContent = 'Daily Impact RW Test - ' . date('Y-m-d H:i:s');
        $testFile = rtrim($dir, '/') . '/.rwtest_' . uniqid() . '.txt';
        $writeOk = @file_put_contents($testFile, $testContent);
        $r['write'] = $writeOk !== false;
        $readContent = @file_get_contents($testFile);
        $r['read'] = ($readContent === $testContent);
        $r['delete'] = @unlink($testFile);
        $r['pass'] = $r['write'] && $r['read'] && $r['delete'];
        if (!$r['pass']) $allOk = false;
        $results[$label] = $r;
    }
    echo json_encode(['success' => $allOk, 'results' => $results]);
    exit;
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Install - Daily Impact Devotional</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a; color: #e2e8f0;
    min-height: 100vh; display: flex; align-items: flex-start; justify-content: center;
    padding: 2rem 1rem;
}
.container { width: 100%; max-width: 680px; }

/* ── Cards ── */
.card {
    background: rgba(30,41,59,0.85); backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
    padding: 2rem; margin-bottom: 1.5rem;
}

/* ── Steps Progress Bar ── */
.steps-bar {
    display: flex; align-items: center; justify-content: center;
    gap: 0; margin-bottom: 2rem;
}
.step-dot {
    display: flex; align-items: center; justify-content: center;
    width: 2.5rem; height: 2.5rem; border-radius: 50%;
    font-size: 0.8rem; font-weight: 800;
    border: 2px solid rgba(255,255,255,0.15);
    color: #64748b; background: transparent;
    transition: all 0.3s; position: relative; z-index: 1;
}
.step-dot.active {
    border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,0.15);
    box-shadow: 0 0 0 4px rgba(59,130,246,0.1);
}
.step-dot.completed {
    border-color: #10b981; color: #10b981; background: rgba(16,185,129,0.15);
}
.step-line {
    flex: 0 0 3rem; height: 2px;
    background: rgba(255,255,255,0.1);
    transition: background 0.3s;
}
.step-line.completed { background: #10b981; }

/* ── Step Content ── */
.step { display: none; }
.step.active { display: block; }

h1 {
    font-size: 1.5rem; font-weight: 800; margin-bottom: 0.25rem;
    background: linear-gradient(to right, #60a5fa, #c084fc);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.subtitle { color: #94a3b8; font-size: 0.85rem; margin-bottom: 1.5rem; }
.section-title {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #60a5fa;
    margin-bottom: 1rem; padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}

/* ── Check Items ── */
.check-item {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.45rem 0; font-size: 0.85rem;
    border-bottom: 1px solid rgba(255,255,255,0.03);
}
.check-item:last-child { border-bottom: none; }
.check-icon { font-size: 1.1rem; width: 1.5rem; text-align: center; }
.check-label { flex: 1; }
.check-detail { font-size: 0.75rem; color: #64748b; font-family: 'SF Mono','Consolas',monospace; text-align: right; max-width: 40%; overflow-wrap: break-word; word-break: break-word; }
.check-detail.pass { color: #34d399; }
.check-detail.fail { color: #f87171; }

/* ── Form ── */
.form-group { margin-bottom: 1rem; }
label { display: block; margin-bottom: 0.35rem; color: #94a3b8; font-size: 0.8rem; font-weight: 600; }
.password-wrapper { position: relative; display: flex; align-items: center; }
.password-wrapper input { padding-right: 2.6rem; }
.password-toggle {
    position: absolute; right: 0.4rem; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer; font-size: 1.15rem;
    padding: 0.2rem; line-height: 1; opacity: 0.5;
    transition: opacity 0.2s; border-radius: 4px;
}
.password-toggle:hover { opacity: 1; background: rgba(255,255,255,0.05); }

.test-result {
    margin-top: 0.75rem; padding: 0.6rem 0.9rem;
    border-radius: 8px; font-size: 0.8rem;
    display: none; line-height: 1.5;
    overflow-wrap: break-word; word-break: break-word;
}
.test-result.show { display: block; }
.test-result.pass {
    background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25);
    color: #34d399;
}
.test-result.fail {
    background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.25);
    color: #f87171;
}
.test-result.loading {
    background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.25);
    color: #60a5fa;
}
.test-result pre {
    margin: 0.3rem 0 0; font-family: 'SF Mono','Consolas',monospace;
    font-size: 0.75rem; opacity: 0.8;
    white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word;
}
.btn-test {
    background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25);
    color: #34d399; padding: 0.5rem 1rem; border-radius: 8px;
    font-weight: 600; font-size: 0.8rem; cursor: pointer;
    transition: all 0.2s;
}
.btn-test:hover { background: rgba(16,185,129,0.22); }
.btn-test:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Progress Overlay ── */
.progress-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(15,23,42,0.93); backdrop-filter: blur(8px);
    z-index: 1000; align-items: center; justify-content: center;
}
.progress-overlay.active { display: flex; }
.progress-card {
    text-align: center; padding: 2.5rem;
    background: rgba(30,41,59,0.9); border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.08);
    max-width: 400px; width: 90%;
}
.progress-spinner {
    width: 44px; height: 44px;
    border: 3px solid rgba(59,130,246,0.2);
    border-top: 3px solid #3b82f6;
    border-radius: 50%;
    animation: progressSpin 0.8s linear infinite;
    margin: 0 auto 1.25rem;
}
@keyframes progressSpin { to { transform: rotate(360deg); } }
.progress-label { font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; color: #e2e8f0; }
.progress-bar-track {
    height: 10px; background: rgba(255,255,255,0.08); border-radius: 5px;
    overflow: hidden; margin-bottom: 0.5rem;
}
.progress-bar-fill {
    height: 100%; width: 0%; border-radius: 5px;
    background: linear-gradient(to right, #3b82f6, #10b981);
    transition: width 0.4s ease;
}
.progress-percent { font-size: 1.5rem; font-weight: 800; color: #60a5fa; font-variant-numeric: tabular-nums; }
.progress-step { font-size: 0.75rem; color: #64748b; margin-top: 0.5rem; font-family: 'SF Mono','Consolas',monospace; }

input {
    width: 100%; padding: 0.65rem 0.9rem; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(15,23,42,0.6); color: #f8fafc; outline: none;
    font-size: 0.9rem; transition: border-color 0.2s;
}
input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
input.error { border-color: #f87171; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

/* ── Buttons ── */
.btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    padding: 0.7rem 1.5rem; border: none; border-radius: 8px;
    font-weight: 700; font-size: 0.9rem; cursor: pointer;
    transition: all 0.2s; text-decoration: none;
}
.btn-primary { background: #3b82f6; color: white; }
.btn-primary:hover { background: #2563eb; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.btn-success { background: #10b981; color: white; }
.btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #e2e8f0; }
.btn-outline:hover { background: rgba(255,255,255,0.05); }
.btn-ghost { background: transparent; color: #94a3b8; }
.btn-ghost:hover { color: #e2e8f0; }
.btn-group { display: flex; justify-content: space-between; margin-top: 1.5rem; gap: 0.75rem; }

/* ── Messages ── */
.error-box {
    background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);
    color: #f87171; padding: 0.75rem 1rem; border-radius: 8px;
    margin-bottom: 1rem; font-size: 0.85rem;
}
.success-box {
    background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3);
    color: #34d399; padding: 0.75rem 1rem; border-radius: 8px;
    margin-bottom: 1rem; font-size: 0.85rem; text-align: center;
}
.warn-box {
    background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3);
    color: #fbbf24; padding: 0.75rem 1rem; border-radius: 8px;
    margin-bottom: 1rem; font-size: 0.85rem;
}

hr { border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 1.5rem 0; }
.note { color: #64748b; font-size: 0.8rem; margin-top: 1rem; text-align: center; }
code { background: rgba(15,23,42,0.6); padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
.flex { display: flex; gap: 0.75rem; justify-content: center; }
.mt-2 { margin-top: 0.75rem; }
.mt-3 { margin-top: 1rem; }
.text-center { text-align: center; }

/* ── Review Table ── */
.review-table { width: 100%; font-size: 0.85rem; }
.review-table td { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.review-table td:first-child { color: #94a3b8; width: 40%; }
.review-table td:last-child { font-weight: 600; }
</style>
</head>
<body>
<div class="container">

<?php if ($installed && !empty($postTests)): ?>

    <!-- ═══ STEP 5: RESULTS ═══ -->
    <div class="card">
        <div style="text-align:center; margin-bottom:1.5rem;">
            <div style="font-size:3rem; margin-bottom:0.75rem;">🎉</div>
            <h1 style="background:none; -webkit-text-fill-color:unset; color:#f8fafc;">Installation Complete!</h1>
            <div class="success-box" style="margin-top:0.75rem;"><?= $success ?></div>
        </div>

        <div class="section-title">📋 Post-Install Verification</div>
        <?php foreach ($postTests as $pt): ?>
            <div class="check-item">
                <span class="check-icon"><?= boolIcon($pt['pass']) ?></span>
                <span class="check-label"><?= htmlspecialchars($pt['label']) ?></span>
                <span class="check-detail <?= $pt['pass'] ? 'pass' : 'fail' ?>"><?= htmlspecialchars($pt['detail']) ?></span>
            </div>
        <?php endforeach; ?>

        <hr>
        <p class="text-center" style="color:#94a3b8; font-size:0.85rem; margin-bottom:1rem;">
            <strong>Admin Login:</strong> <?= htmlspecialchars($adminEmail) ?>
        </p>
        <?php
        $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
        // install.php now lives in backend/ — the app root is one level up.
        $appRoot = $scriptDir === '/' ? '' : rtrim(dirname($scriptDir), '/');
        $backendUrl = $scriptDir === '/' ? '' : $scriptDir;
        ?>
        <div class="flex">
            <a href="<?= $appRoot ?>/" class="btn btn-primary btn-sm">🏠 Homepage</a>
            <a href="<?= $appRoot ?>/admin/login" class="btn btn-success btn-sm">🔐 Admin Login</a>
            <a href="<?= $backendUrl ?>/debug.php" class="btn btn-outline btn-sm">🩺 Diagnostics</a>
        </div>
        <p class="note mt-3">⚠️ Delete <code>install.php</code> from your server now.</p>
    </div>

<?php else: ?>

    <!-- ═══ WIZARD: STEPS 1–4 ═══ -->

    <?php if ($error): ?>
        <div class="error-box"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <div class="card">
        <div style="text-align:center; margin-bottom:0.5rem;">
            <h1>🚀 Daily Impact Devotional</h1>
            <p class="subtitle" style="margin-bottom:0;">System Installer</p>
        </div>

        <!-- Progress Bar -->
        <div class="steps-bar" id="stepsBar">
            <div class="step-dot active" data-step="1">1</div>
            <div class="step-line" data-step="1-2"></div>
            <div class="step-dot" data-step="2">2</div>
            <div class="step-line" data-step="2-3"></div>
            <div class="step-dot" data-step="3">3</div>
            <div class="step-line" data-step="3-4"></div>
            <div class="step-dot" data-step="4">4</div>
        </div>

        <form id="installForm" method="POST">

            <!-- ══ STEP 1: System Requirements ══ -->
            <div class="step active" data-step="1">
                <div class="section-title">🔍 Step 1: System Requirements</div>
                <div style="margin-bottom:1rem;">
                    <?php foreach ($checks as $c): ?>
                        <div class="check-item">
                            <span class="check-icon"><?= boolIcon($c['pass']) ?></span>
                            <span class="check-label"><?= htmlspecialchars($c['label']) ?></span>
                            <span class="check-detail <?= $c['pass'] ? 'pass' : 'fail' ?>"><?= htmlspecialchars($c['detail']) ?></span>
                        </div>
                    <?php endforeach; ?>
                </div>
                <?php if (!$allPreflightPass): ?>
                    <div class="warn-box">⚠️ Fix the ❌ items above, then refresh the page to re-run checks.</div>
                <?php endif; ?>

                <!-- File upload read/write test -->
                <button type="button" class="btn-test" onclick="testUpload(this)" style="margin-bottom:1rem;">📁 Test File Write/Read/Delete</button>
                <div id="uploadTestResult" class="test-result"></div>

                <div class="btn-group">
                    <span></span>
                    <button type="button" class="btn btn-primary" onclick="goStep(2)" <?= !$allPreflightPass ? 'disabled' : '' ?>>
                        Continue → Database Setup
                    </button>
                </div>
            </div>

            <!-- ══ STEP 2: Database Configuration ══ -->
            <div class="step" data-step="2">
                <div class="section-title">🔌 Step 2: Database Connection</div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Host</label>
                        <input type="text" name="db_host" value="<?= htmlspecialchars($_POST['db_host'] ?? 'localhost') ?>" placeholder="localhost">
                    </div>
                    <div class="form-group">
                        <label>Database Name</label>
                        <input type="text" name="db_name" value="<?= htmlspecialchars($_POST['db_name'] ?? 'dailyimpact_devotional') ?>" placeholder="dailyimpact_devotional">
                    </div>
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" name="db_user" required value="<?= htmlspecialchars($_POST['db_user'] ?? '') ?>" placeholder="DB username">
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <div class="password-wrapper">
                            <input type="password" name="db_pass" id="db_pass" value="<?= htmlspecialchars($_POST['db_pass'] ?? '') ?>" placeholder="DB password">
                            <button type="button" class="password-toggle" onclick="togglePw('db_pass','dbPwEye')" aria-label="Toggle password visibility">
                                <span id="dbPwEye">👁️</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Database connection test -->
                <button type="button" class="btn-test" onclick="testDB(this)">🔌 Test Database Connection</button>
                <div id="dbTestResult" class="test-result"></div>

                <div class="btn-group">
                    <button type="button" class="btn btn-ghost" onclick="goStep(1)">← Back</button>
                    <button type="button" class="btn btn-primary" onclick="goStep(3)">Continue → Admin Account</button>
                </div>
            </div>

            <!-- ══ STEP 3: Admin Account ══ -->
            <div class="step" data-step="3">
                <div class="section-title">👤 Step 3: Admin Account</div>
                <div class="form-group">
                    <label>Admin Email</label>
                    <input type="email" name="admin_email" id="admin_email" required
                           value="<?= htmlspecialchars($_POST['admin_email'] ?? 'admin@ministries.org') ?>"
                           placeholder="admin@example.com">
                </div>
                <div class="grid-2">
                    <div class="form-group">
                        <label>Admin Name</label>
                        <input type="text" name="admin_name" value="<?= htmlspecialchars($_POST['admin_name'] ?? 'Admin') ?>" placeholder="Admin">
                    </div>
                    <div class="form-group">
                        <label>Password (min 6 chars)</label>
                        <div class="password-wrapper">
                            <input type="password" name="admin_password" id="admin_password" required minlength="6" placeholder="Enter password">
                            <button type="button" class="password-toggle" onclick="togglePw('admin_password','adminPwEye')" aria-label="Toggle password visibility">
                                <span id="adminPwEye">👁️</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="btn-group">
                    <button type="button" class="btn btn-ghost" onclick="goStep(2)">← Back</button>
                    <button type="button" class="btn btn-primary" onclick="goStep(4)">Review → Confirm</button>
                </div>
            </div>

            <!-- ══ STEP 4: Review & Confirm ══ -->
            <div class="step" data-step="4">
                <div class="section-title">✅ Step 4: Review & Install</div>
                <p style="color:#94a3b8; font-size:0.85rem; margin-bottom:1rem;">Please review your settings before installation.</p>
                <table class="review-table">
                    <tr><td>Database Host</td><td id="review_host">localhost</td></tr>
                    <tr><td>Database Name</td><td id="review_name">dailyimpact_devotional</td></tr>
                    <tr><td>Database User</td><td id="review_user">—</td></tr>
                    <tr><td>Admin Email</td><td id="review_email">—</td></tr>
                    <tr><td>Admin Name</td><td id="review_name_field">Admin</td></tr>
                    <tr><td>Uploads Directory</td><td><?= htmlspecialchars($uploadBase) ?></td></tr>
                </table>

                <?php if (file_exists($configFile)): ?>
                    <div class="warn-box mt-2">⚠️ Existing config found. Installing will overwrite it.</div>
                <?php endif; ?>

                <div class="btn-group">
                    <button type="button" class="btn btn-ghost" onclick="goStep(3)">← Back</button>
                    <button type="button" class="btn btn-success" id="installBtn" onclick="startInstall(this)">
                        ⚡ Install Now
                    </button>
                </div>
            </div>

        </form>
    </div>

    <p class="note">
        Creates database, runs migrations, sets up admin account, then runs 20+ post-install tests.
    </p>

<?php endif; ?>
</div>

<!-- ═══ PROGRESS OVERLAY ═══ -->
<div id="installProgress" class="progress-overlay">
    <div class="progress-card">
        <div class="progress-spinner" id="progressSpinner"></div>
        <div class="progress-label" id="progressLabel">Starting installation...</div>
        <div class="progress-bar-track">
            <div class="progress-bar-fill" id="progressFill"></div>
        </div>
        <div class="progress-percent" id="progressPercent">0%</div>
        <div class="progress-step" id="progressStep">Connecting...</div>
    </div>
</div>

<script>
// ── Global functions (accessible from inline onclick) ──
function togglePw(inputId, eyeId) {
    const input = document.getElementById(inputId);
    const eye = document.getElementById(eyeId);
    if (!input || !eye) return;
    if (input.type === 'password') {
        input.type = 'text';
        eye.textContent = '\uD83D\uDE48';
    } else {
        input.type = 'password';
        eye.textContent = '\uD83D\uDC41\uFE0F';
    }
}

async function testDB(btn) {
    const result = document.getElementById('dbTestResult');
    result.className = 'test-result show loading';
    result.innerHTML = '\u23F3 Testing database connection...';
    btn.disabled = true;

    const host = encodeURIComponent(document.querySelector('[name="db_host"]').value || 'localhost');
    const name = encodeURIComponent(document.querySelector('[name="db_name"]').value || 'dailyimpact_devotional');
    const user = encodeURIComponent(document.querySelector('[name="db_user"]').value || '');
    const pass = encodeURIComponent(document.querySelector('[name="db_pass"]').value || '');

    try {
        const res = await fetch('?action=test_db&host=' + host + '&name=' + name + '&user=' + user + '&pass=' + pass);
        const json = await res.json();
        if (json.success) {
            result.className = 'test-result show pass';
            let html = json.message;
            if (json.details) {
                html += '<pre>';
                for (const [k, v] of Object.entries(json.details)) {
                    html += '\u2705 ' + v + '\\n';
                }
                html += '<\/pre>';
            }
            result.innerHTML = html;
        } else {
            result.className = 'test-result show fail';
            result.innerHTML = json.message || 'Unknown error';
        }
    } catch (e) {
        result.className = 'test-result show fail';
        result.innerHTML = '\u274C Could not reach server: ' + e.message;
    }
    btn.disabled = false;
}

async function testUpload(btn) {
    const result = document.getElementById('uploadTestResult');
    result.className = 'test-result show loading';
    result.innerHTML = '\u23F3 Testing file system...';
    btn.disabled = true;

    try {
        const res = await fetch('?action=test_upload');
        const json = await res.json();
        if (json.success) {
            result.className = 'test-result show pass';
            let html = '\u2705 All directories passed write\/read\/delete tests!<pre>';
            for (const [label, r] of Object.entries(json.results)) {
                const status = r.pass ? '\u2705' : '\u274C';
                html += status + ' ' + label + ': write=' + (r.write?'OK':'FAIL') + ' read=' + (r.read?'OK':'FAIL') + ' delete=' + (r.delete?'OK':'FAIL') + '\\n';
            }
            html += '<\/pre>';
            result.innerHTML = html;
        } else {
            result.className = 'test-result show fail';
            let html = '\u274C Some tests failed:<pre>';
            for (const [label, r] of Object.entries(json.results)) {
                const status = r.pass ? '\u2705' : '\u274C';
                html += status + ' ' + label + ': write=' + (r.write?'OK':'FAIL') + ' read=' + (r.read?'OK':'FAIL') + ' delete=' + (r.delete?'OK':'FAIL') + '\\n';
            }
            html += '<\/pre>';
            result.innerHTML = html;
        }
    } catch (e) {
        result.className = 'test-result show fail';
        result.innerHTML = '\u274C Could not reach server: ' + e.message;
    }
    btn.disabled = false;
}

// ── AJAX Install with Progress Bar ──
async function startInstall(btn) {
    btn.disabled = true;
    const overlay = document.getElementById('installProgress');
    overlay.classList.add('active');

    const form = document.getElementById('installForm');
    const formData = new FormData(form);

    // Progress steps — runs on a timer but ONLY shows real completion after server responds
    const steps = [
        { pct: 8,  label: 'Connecting to database...', step: 'Connecting...' },
        { pct: 20, label: 'Creating database...', step: 'Creating database...' },
        { pct: 35, label: 'Writing configuration file...', step: 'Writing config...' },
        { pct: 50, label: 'Running schema migration...', step: 'Running migrations...' },
        { pct: 65, label: 'Creating admin account...', step: 'Creating admin...' },
        { pct: 78, label: 'Setting up upload directories...', step: 'Setting up uploads...' },
    ];
    let si = 0;
    let doneText = '';
    const advance = () => {
        if (si < steps.length) {
            const s = steps[si]; si++;
            document.getElementById('progressFill').style.width = s.pct + '%';
            document.getElementById('progressPercent').textContent = s.pct + '%';
            document.getElementById('progressLabel').textContent = s.label;
            document.getElementById('progressStep').textContent = s.step;
        } else if (!doneText) {
            // Server still processing — show pulsing wait state
            document.getElementById('progressLabel').textContent = 'Completing installation...';
            document.getElementById('progressStep').textContent = 'Waiting for server \u25CF \u25CF \u25CF';
        }
    };
    advance();
    const interval = setInterval(advance, 1000);

    try {
        const res = await fetch('', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: formData });
        clearInterval(interval);
        doneText = 'done';

        if (!res.ok) {
            overlay.classList.remove('active');
            alert('Server error: HTTP ' + res.status);
            btn.disabled = false;
            return;
        }

        const json = await res.json();

        // Only show 100% AFTER server responds
        document.getElementById('progressFill').style.width = '100%';
        document.getElementById('progressPercent').textContent = '100%';
        document.getElementById('progressSpinner').style.display = 'none';

        if (json.success) {
            document.getElementById('progressLabel').textContent = '\u2705 Installation complete!';
            document.getElementById('progressStep').textContent = 'All done!';
        } else {
            document.getElementById('progressLabel').textContent = '\u274C Installation failed';
            document.getElementById('progressStep').textContent = 'See details below';
        }

        await new Promise(r => setTimeout(r, 600));
        overlay.classList.remove('active');

        if (json.success) {
            try {
                renderResults(json);
            } catch (renderErr) {
                // renderResults failed — show error inline so page isn't blank
                console.error('renderResults error:', renderErr);
                const container = document.querySelector('.container');
                if (container) {
                    const scriptDir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
                    const appRoot = scriptDir.lastIndexOf('/') === 0 ? '' : scriptDir.substring(0, scriptDir.lastIndexOf('/'));
                    const homePath = appRoot ? appRoot + '/' : '/';
                    const adminPath = appRoot ? appRoot + '/admin/login' : '/admin/login';
                    container.insertAdjacentHTML('afterbegin',
                        '<div class="error-box">' +
                        '<strong>\u2705 Installation saved to database!</strong><br>' +
                        'The results display had an error (' + (renderErr.message || 'unknown') + '), but all data was written. ' +
                        'You can <a href="' + homePath + '" style="color:#fbbf24;font-weight:bold;">visit the homepage</a> ' +
                        'or <a href="' + adminPath + '" style="color:#34d399;font-weight:bold;">log in to the admin dashboard</a>.' +
                        '</div>'
                    );
                }
            }
        } else {
            // Show error inline instead of alert
            const stepsContainer = document.querySelector('.step[data-step]');
            if (stepsContainer) {
                const errDiv = document.createElement('div');
                errDiv.className = 'error-box';
                errDiv.textContent = 'Installation failed: ' + json.message;
                document.querySelector('.card').insertBefore(errDiv, document.querySelector('.card').firstChild);
            }
            btn.disabled = false;
        }
    } catch (e) {
        clearInterval(interval);
        doneText = 'done';
        overlay.classList.remove('active');
        document.getElementById('progressLabel').textContent = '\u274C Connection error';
        document.getElementById('progressStep').textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-box';
        errDiv.textContent = 'Network error: ' + e.message + '. Your server may have timed out. Try refreshing and installing again.';
        document.querySelector('.card').insertBefore(errDiv, document.querySelector('.card').firstChild);
        btn.disabled = false;
    }
}

function renderResults(data) {
    const card = document.querySelector('.card');
    if (card) card.style.display = 'none';
    const note = document.querySelector('.note');
    if (note) note.style.display = 'none';

    const container = document.querySelector('.container');

    // Compute dynamic base URL once — install.php lives in backend/,
    // so the app root is one level above the script directory.
    const scriptDir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    const appRoot = scriptDir.lastIndexOf('/') === 0 ? '' : scriptDir.substring(0, scriptDir.lastIndexOf('/'));
    const homePath = appRoot ? appRoot + '/' : '/';
    const adminPath = appRoot ? appRoot + '/admin/login' : '/admin/login';
    const debugPath = scriptDir ? scriptDir + '/debug.php' : '/debug.php';

    const testsHtml = (data.tests || []).map(t =>
        '<div class="check-item">' +
        '<span class="check-icon">' + (t.pass ? '\u2705' : '\u274C') + '</span>' +
        '<span class="check-label">' + (t.label || '') + '</span>' +
        '<span class="check-detail ' + (t.pass ? 'pass' : 'fail') + '">' + (t.detail || '') + '</span>' +
        '</div>'
    ).join('');

    container.insertAdjacentHTML('beforeend',
        '<div class="card" id="resultsCard">' +
        '<div style="text-align:center; margin-bottom:1.5rem;">' +
        '<div style="font-size:3rem; margin-bottom:0.75rem;">\uD83C\uDF89</div>' +
        '<h1 style="background:none; -webkit-text-fill-color:unset; color:#f8fafc;">Installation Complete!</h1>' +
        '<div class="success-box" style="margin-top:0.75rem;">' + (data.message || '') + '</div>' +
        '</div>' +
        '<div class="section-title">\uD83D\uDCCB Post-Install Verification</div>' +
        testsHtml +
        '<hr>' +
        '<p class="text-center" style="color:#94a3b8; font-size:0.85rem; margin-bottom:1rem;">' +
        '<strong>Admin Login:</strong> ' + (data.adminEmail || '') +
        '</p>' +
        '</div>' +
        '<div class="flex">' +
        '<a href="' +        homePath + '" class="btn btn-primary">\uD83C\uDFE0 Go Home</a>' +
        '<a href="' + adminPath + '" class="btn btn-success">\uD83D\uDD10 Login to Dashboard</a>' +
        '<a href="' + debugPath + '" class="btn btn-outline">\uD83D\uDC89 Diagnostics</a>' +
        '</div>' +
        '<p class="note mt-3">\u26A0\uFE0F Delete <code>install.php</code> from your server now.</p>'
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

(function() {
    // ── Step Navigation ──
    function goStep(n) {
        // Update dots
        document.querySelectorAll('.step-dot').forEach(d => {
            const s = parseInt(d.dataset.step);
            d.classList.toggle('active', s === n);
            d.classList.toggle('completed', s < n);
        });
        // Update lines
        document.querySelectorAll('.step-line').forEach(l => {
            const max = parseInt(l.dataset.step.split('-')[1]);
            l.classList.toggle('completed', max <= n);
        });
        // Update steps
        document.querySelectorAll('.step').forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.step) === n);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // ── Validation on step 3 → 4 ──
    const oldGoStep = goStep;
    window.goStep = function(n) {
        // Validate admin fields when going to step 4
        if (n === 4) {
            const pass = document.getElementById('admin_password');
            const dbUser = document.querySelector('[name="db_user"]');
            let errorStep = 0;

            if (!dbUser.value.trim()) { dbUser.classList.add('error'); errorStep = 2; }
            else { dbUser.classList.remove('error'); }

            if (!pass.value || pass.value.length < 6) {
                pass.classList.add('error');
                if (errorStep === 0 || errorStep > 3) errorStep = 3;
            } else { pass.classList.remove('error'); }

            if (errorStep > 0) { oldGoStep(errorStep); return; }

            // Populate review fields
            document.getElementById('review_host').textContent = document.querySelector('[name="db_host"]').value || 'localhost';
            document.getElementById('review_name').textContent = document.querySelector('[name="db_name"]').value || 'dailyimpact_devotional';
            document.getElementById('review_user').textContent = document.querySelector('[name="db_user"]').value || '(empty)';
            document.getElementById('review_email').textContent = document.getElementById('admin_email').value || '(empty)';
            document.getElementById('review_name_field').textContent = document.querySelector('[name="admin_name"]').value || 'Admin';
        }
        oldGoStep(n);
    };

    // ── Keyboard: Enter submits, doesn't advance step ──
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const activeStep = document.querySelector('.step.active');
            if (activeStep && parseInt(activeStep.dataset.step) < 4) {
                e.preventDefault();
                // Don't advance — user must click the button
            }
        }
    });

    // ── Sync review data when returning to step 4 ──
    // (handles back-button from PHP error)
    const step4 = document.querySelector('.step[data-step="4"]');
    if (step4 && !step4.classList.contains('active')) {
        // Form was submitted with errors — we're showing step the error state
        // Show errors in appropriate step
        <?php if ($error): ?>
            const errMsg = <?= json_encode($error) ?>;
            if (errMsg.includes('database') || errMsg.includes('Connection')) {
                goStep(2);
            } else if (errMsg.includes('password') || errMsg.includes('email')) {
                goStep(3);
            } else {
                goStep(1);
            }
        <?php endif; ?>
    }
})();
</script>
</body>
</html>
