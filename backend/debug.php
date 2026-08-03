<?php
/**
 * Daily Impact Devotional - Diagnostic Page
 * 
 * Visit /backend/debug.php from your browser to check system health.
 * Protected by admin session — only logged-in admins can access.
 * 
 * What it checks:
 *   ✅ PHP version & loaded extensions
 *   ✅ Database connection & table row counts
 *   ✅ Upload directory existence & writability
 *   ✅ Upload directory contents (file listing per month folder)
 *   ✅ API endpoint health (calls each endpoint and shows response)
 *   ✅ PHP error log (last 50 lines)
 *   ✅ Admin session status
 */

// ─── Bootstrap ──────────────────────────────────────────────────────────────

// Increase limits for this page
ini_set('max_execution_time', 60);
ini_set('memory_limit', '256M');

// Attempt to load config for DB access
$configLoaded = false;
$dbConnected = false;
$pdo = null;
$configError = '';

try {
    $configPath = __DIR__ . '/config/db.php';
    if (file_exists($configPath)) {
        require_once $configPath;
        $configLoaded = true;
    } else {
        $configError = 'config/db.php not found. Run install.php first.';
    }
} catch (Exception $e) {
    $configError = $e->getMessage();
}

// Start session with security (config/db.php now has secureSession)
$isAdmin = false;
if ($configLoaded && function_exists('secureSession')) {
    $isAdmin = secureSession(3600);  // 60 min idle timeout, IP/UA binding
}
if (session_status() === PHP_SESSION_NONE) {
    session_start();
    $isAdmin = isset($_SESSION['admin_id']);
}

// Release session lock early for better concurrency
session_write_close();

// ─── Helper Functions ──────────────────────────────────────────────────────

function formatBytes(int $bytes, int $decimals = 2): string {
    if ($bytes <= 0) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $i = floor(log($bytes, 1024));
    return number_format($bytes / pow(1024, $i), $decimals) . ' ' . $units[$i];
}

function boolIcon($val): string {
    return $val ? '✅' : '❌';
}

function secToStr($sec): string {
    if ($sec < 1) return round($sec * 1000) . 'ms';
    return round($sec, 2) . 's';
}

function filePermissionStr(string $path): string {
    if (!file_exists($path)) return 'N/A';
    return substr(sprintf('%o', fileperms($path)), -4);
}

function isReallyWritable(string $path): bool {
    if (!is_dir($path)) return false;
    $testFile = rtrim($path, '/') . '/.permission_test_' . uniqid();
    $result = @file_put_contents($testFile, 'test');
    @unlink($testFile);
    return $result !== false;
}



// ─── Gather Data ───────────────────────────────────────────────────────────

$results = [];

// 1. PHP & Server Info
$results['php'] = [
    'PHP Version'     => PHP_VERSION,
    'Server Software' => $_SERVER['SERVER_SOFTWARE'] ?? 'N/A',
    'Server API'      => PHP_SAPI,
    'Document Root'   => $_SERVER['DOCUMENT_ROOT'] ?? 'N/A',
    'Script Path'     => __FILE__,
    'Memory Limit'    => ini_get('memory_limit'),
    'Upload Max Size' => ini_get('upload_max_filesize'),
    'Post Max Size'   => ini_get('post_max_size'),
    'Max Exec Time'   => ini_get('max_execution_time') . 's',
    'Display Errors'  => ini_get('display_errors'),
    'Error Log'       => ini_get('error_log') ?: 'Not configured',
];

// Required PHP extensions
$requiredExts = ['pdo', 'pdo_mysql', 'json', 'mbstring', 'session', 'fileinfo'];
$extStatus = [];
foreach ($requiredExts as $ext) {
    $extStatus[$ext] = extension_loaded($ext);
}
$results['extensions'] = $extStatus;

// 2. Database Connection & Table Status
$dbConnected = false;
$dbInfo = ['connected' => false, 'error' => null, 'tables' => [], 'size' => 0];
if ($configLoaded && isset($pdo) && $pdo !== null) {
    try {
        // Test query
        $pdo->query('SELECT 1');
        $dbConnected = true;
        $dbInfo['connected'] = true;

        // Get tables
        $stmt = $pdo->query('SHOW TABLE STATUS');
        $tables = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $totalSize = 0;
        foreach ($tables as $t) {
            $rowCount = 0;
            try {
                $cnt = $pdo->query("SELECT COUNT(*) FROM `{$t['Name']}`");
                $rowCount = (int)$cnt->fetchColumn();
            } catch (Exception $e) {
                $rowCount = -1;
            }
            $tableSize = ($t['Data_length'] ?? 0) + ($t['Index_length'] ?? 0);
            $totalSize += $tableSize;
            $dbInfo['tables'][] = [
                'name'    => $t['Name'],
                'engine'  => $t['Engine'] ?? '?',
                'rows'    => $rowCount,
                'size'    => $tableSize,
                'size_fmt'=> formatBytes($tableSize),
                'collation' => $t['Collation'] ?? '?',
            ];
        }
        $dbInfo['size'] = $totalSize;
        $dbInfo['size_fmt'] = formatBytes($totalSize);
    } catch (Exception $e) {
        $dbInfo['error'] = $e->getMessage();
    }
} elseif ($configError) {
    $dbInfo['error'] = $configError;
} else {
    $dbInfo['error'] = 'PDO not available or config not loaded';
}
$results['database'] = $dbInfo;

// 3. Upload Directories
$uploadBase = defined('UPLOADS_DIR') ? UPLOADS_DIR : (__DIR__ . '/../upload');
$headersDir  = defined('HEADERS_DIR') ? HEADERS_DIR : ($uploadBase . '/headers');
$devotionalsDir = defined('DEVOTIONALS_DIR') ? DEVOTIONALS_DIR : ($uploadBase . '/devotionals');

$uploadInfo = [
    'base' => [
        'path'       => $uploadBase,
        'exists'     => is_dir($uploadBase),
        'writable'   => is_dir($uploadBase) ? isReallyWritable($uploadBase) : false,
        'perms'      => is_dir($uploadBase) ? filePermissionStr($uploadBase) : 'N/A',
    ],
    'headers' => [
        'path'       => $headersDir,
        'exists'     => is_dir($headersDir),
        'writable'   => is_dir($headersDir) ? isReallyWritable($headersDir) : false,
        'perms'      => is_dir($headersDir) ? filePermissionStr($headersDir) : 'N/A',
        'month_folders' => [],
    ],
    'devotionals' => [
        'path'       => $devotionalsDir,
        'exists'     => is_dir($devotionalsDir),
        'writable'   => is_dir($devotionalsDir) ? isReallyWritable($devotionalsDir) : false,
        'perms'      => is_dir($devotionalsDir) ? filePermissionStr($devotionalsDir) : 'N/A',
        'month_folders' => [],
    ],
];

// List month folders
foreach (['headers' => &$uploadInfo['headers'], 'devotionals' => &$uploadInfo['devotionals']] as $key => &$info) {
    $dirPath = $key === 'headers' ? $headersDir : $devotionalsDir;
    if (is_dir($dirPath)) {
        $items = scandir($dirPath);
        if ($items) {
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') continue;
                $itemPath = $dirPath . '/' . $item;
                if (is_dir($itemPath)) {
                    $files = scandir($itemPath);
                    $fileCount = 0;
                    $totalSize = 0;
                    if ($files) {
                        foreach ($files as $f) {
                            if ($f === '.' || $f === '..') continue;
                            $fPath = $itemPath . '/' . $f;
                            if (is_file($fPath)) {
                                $fileCount++;
                                $totalSize += filesize($fPath);
                            }
                        }
                    }
                    $info['month_folders'][] = [
                        'name'       => $item,
                        'file_count' => $fileCount,
                        'total_size' => formatBytes($totalSize),
                        'writable'   => isReallyWritable($itemPath),
                        'perms'      => filePermissionStr($itemPath),
                    ];
                } elseif (is_file($itemPath)) {
                    $info['month_folders'][] = [
                        'name'       => $item,
                        'file_count' => 1,
                        'total_size' => formatBytes(filesize($itemPath)),
                        'writable'   => is_writable($itemPath),
                        'perms'      => filePermissionStr($itemPath),
                    ];
                }
            }
        }
    }
}
unset($info);

$results['uploads'] = $uploadInfo;

// 4. API Endpoint Tests
$apiBase = rtrim((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . '/backend/api', '/');
$endpoints = [
    'GET /backend/api/health.php'       => '/health.php',
    'GET /backend/api/settings.php'     => '/settings.php',
    'GET /backend/api/devotionals.php'  => '/devotionals.php',
    'GET /backend/api/headers.php'      => '/headers.php',
    'GET /backend/api/foreword.php'     => '/foreword.php',
    'GET /backend/api/admin.php?action=check' => '/admin.php?action=check',
];

$apiResults = [];
foreach ($endpoints as $label => $path) {
    $url = $apiBase . $path;
    $start = microtime(true);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_HEADER         => true,
        CURLOPT_NOBODY         => false,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $curlError = curl_error($ch);
    $elapsed = microtime(true) - $start;
    curl_close($ch);

    $body = '';
    if ($response && !$curlError) {
        $body = substr($response, $headerSize);
    }

    $parsed = null;
    if ($body) {
        $parsed = json_decode($body, true);
    }

    $apiResults[$label] = [
        'url'        => $url,
        'http_code'  => $httpCode,
        'time'       => secToStr($elapsed),
        'content_type' => $contentType,
        'curl_error' => $curlError ?: null,
        'body_size'  => strlen($body) . ' bytes',
        'is_json'    => $parsed !== null,
        'parsed'     => $parsed,
    ];
}
$results['api_tests'] = $apiResults;

// 5. PHP Error Log (last 50 lines)
$errorLogPath = ini_get('error_log');
// Resolve relative paths to absolute using __DIR__
if ($errorLogPath && !empty($errorLogPath) && $errorLogPath[0] !== '/' && $errorLogPath[0] !== '\\' && !preg_match('/^[A-Z]:/i', $errorLogPath)) {
    $resolved = realpath(__DIR__ . '/' . $errorLogPath);
    if ($resolved) $errorLogPath = $resolved;
}
$errorLogLines = [];
if ($errorLogPath && file_exists($errorLogPath) && is_readable($errorLogPath)) {
    $file = new SplFileObject($errorLogPath);
    $file->seek(PHP_INT_MAX);
    $totalLines = $file->key();
    $startLine = max(0, $totalLines - 50);
    $file->seek($startLine);
    while ($file->valid() && $file->key() <= $totalLines) {
        $line = $file->fgets();
        if ($line !== false && trim($line) !== '') {
            $errorLogLines[] = trim($line);
        }
        $file->next();
    }
}
$results['error_log'] = [
    'path'   => $errorLogPath ?: 'Not configured',
    'exists' => $errorLogPath ? file_exists($errorLogPath) : false,
    'lines'  => $errorLogLines,
    'count'  => count($errorLogLines),
];

// 6. File system (recently modified files in the project)
$recentFiles = [];
$projectDirs = [__DIR__ . '/api', __DIR__ . '/config', __DIR__];
foreach ($projectDirs as $dir) {
    if (!is_dir($dir)) continue;
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS)
    );
    foreach ($items as $item) {
        if ($item->isFile() && $item->getMTime() > time() - 86400 * 7) { // last 7 days
            $recentFiles[] = [
                'path' => str_replace(__DIR__, '', $item->getPathname()),
                'size' => formatBytes($item->getSize()),
                'mtime'=> date('Y-m-d H:i:s', $item->getMTime()),
            ];
        }
    }
}
usort($recentFiles, fn($a, $b) => $b['mtime'] <=> $a['mtime']);
$results['recent_files'] = array_slice($recentFiles, 0, 30);

// 7. Session Info
$results['session'] = [
    'has_session'   => session_status() === PHP_SESSION_ACTIVE,
    'is_admin'      => $isAdmin,
    'session_id'    => session_id() ? substr(session_id(), 0, 8) . '...' : 'N/A',
    'admin_email'   => $_SESSION['admin_email'] ?? null,
    'admin_id'      => $_SESSION['admin_id'] ?? null,
    'cookie_params' => session_get_cookie_params(),
];

// 8. .htaccess check
$htaccessPath = __DIR__ . '/../.htaccess';
$results['htaccess'] = [
    'exists'  => file_exists($htaccessPath),
    'readable'=> file_exists($htaccessPath) && is_readable($htaccessPath),
    'size'    => file_exists($htaccessPath) ? formatBytes(filesize($htaccessPath)) : 'N/A',
    'lines'   => file_exists($htaccessPath) ? count(file($htaccessPath)) : 0,
];

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diagnostic - Daily Impact Devotional</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            padding: 2rem;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 {
            font-size: 1.8rem;
            font-weight: 800;
            margin-bottom: 0.25rem;
        }
        .subtitle { color: #94a3b8; font-size: 0.9rem; margin-bottom: 2rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.25rem; }
        .card {
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            padding: 1.25rem;
            overflow: hidden;
        }
        .card.full { grid-column: 1 / -1; }
        .card-title {
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #60a5fa;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.35rem 0;
            font-size: 0.85rem;
            border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .stat-row:last-child { border-bottom: none; }
        .stat-label { color: #94a3b8; }
        .stat-value { font-weight: 600; font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; font-size: 0.8rem; max-width: 55%; text-align: right; word-break: break-all; }
        .stat-value.ok { color: #34d399; }
        .stat-value.warn { color: #fbbf24; }
        .stat-value.err { color: #f87171; }
        .stat-value.info { color: #60a5fa; }

        table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        th, td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); }
        th { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; }
        td { font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace; font-size: 0.78rem; }

        pre {
            background: rgba(15, 23, 42, 0.6);
            border-radius: 6px;
            padding: 0.75rem;
            font-size: 0.72rem;
            max-height: 400px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-all;
            line-height: 1.5;
        }
        .error-line { color: #f87171; }
        .muted { color: #64748b; }

        .badge {
            display: inline-block;
            padding: 0.1rem 0.45rem;
            border-radius: 9999px;
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        .badge-ok { background: rgba(16,185,129,0.2); color: #34d399; }
        .badge-err { background: rgba(239,68,68,0.2); color: #f87171; }
        .badge-warn { background: rgba(245,158,11,0.2); color: #fbbf24; }

        .summary-bar {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 1.5rem;
        }
        .summary-item {
            flex: 1;
            min-width: 150px;
            background: rgba(30, 41, 59, 0.6);
            border-radius: 10px;
            padding: 0.75rem 1rem;
            text-align: center;
        }
        .summary-number { font-size: 1.5rem; font-weight: 800; }
        .summary-label { font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }

        details { margin-top: 0.5rem; }
        details summary { cursor: pointer; color: #60a5fa; font-size: 0.8rem; padding: 0.25rem 0; }
        details summary:hover { color: #93c5fd; }

        .json-view { max-height: 300px; overflow: auto; }
        .api-row { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .api-row:last-child { border-bottom: none; }

        .btn-refresh {
            display: inline-block;
            padding: 0.5rem 1.25rem;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            text-decoration: none;
        }
        .btn-refresh:hover { background: #2563eb; }

        .success-banner {
            background: rgba(16,185,129,0.15);
            border: 1px solid rgba(16,185,129,0.3);
            color: #34d399;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
        }
        .error-banner {
            background: rgba(239,68,68,0.15);
            border: 1px solid rgba(239,68,68,0.3);
            color: #f87171;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">

        <?php if (!$isAdmin): ?>
            <!-- Public view: basic diagnostics (no DB/sensitive data) -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
                <div>
                    <h1>🩺 Diagnostics</h1>
                    <p class="subtitle">Daily Impact Devotional — Basic System Check</p>
                </div>
                <a href="?refresh=1" class="btn-refresh">🔄 Refresh</a>
            </div>

            <div class="error-banner">
                Viewing basic diagnostics only. 
                <a href="/admin/login" style="color: #fbbf24; font-weight: bold;">Log in as admin</a> 
                for full database, API tests, error logs, and session info.
            </div>

            <div class="grid">
                <!-- PHP & Server Info (public) -->
                <div class="card">
                    <div class="card-title">🐘 PHP &amp; Server</div>
                    <?php foreach ($results['php'] as $label => $val): ?>
                        <div class="stat-row">
                            <span class="stat-label"><?= $label ?></span>
                            <span class="stat-value info"><?= htmlspecialchars((string)$val) ?></span>
                        </div>
                    <?php endforeach; ?>
                </div>

                <!-- Extensions (public) -->
                <div class="card">
                    <div class="card-title">🔌 Required Extensions</div>
                    <?php foreach ($results['extensions'] as $ext => $loaded): ?>
                        <div class="stat-row">
                            <span class="stat-label"><?= $ext ?></span>
                            <span class="stat-value <?= $loaded ? 'ok' : 'err' ?>"><?= $loaded ? 'Loaded' : 'MISSING' ?></span>
                        </div>
                    <?php endforeach; ?>
                </div>

                <!-- .htaccess (public) -->
                <div class="card">
                    <div class="card-title">📄 .htaccess</div>
                    <?php foreach ($results['htaccess'] as $label => $val): ?>
                        <div class="stat-row">
                            <span class="stat-label"><?= ucfirst($label) ?></span>
                            <span class="stat-value <?= $val ? 'ok' : 'err' ?>"><?= htmlspecialchars((string)$val) ?></span>
                        </div>
                    <?php endforeach; ?>
                    <?php if ($results['htaccess']['exists'] && $results['htaccess']['readable']): ?>
                        <details>
                            <summary>View contents</summary>
                            <pre><?= htmlspecialchars(file_get_contents($htaccessPath)) ?></pre>
                        </details>
                    <?php endif; ?>
                </div>

                <!-- Send CORS Headers check (public) -->
                <div class="card">
                    <div class="card-title">🗄️ Database Status</div>
                    <?php if ($configLoaded): ?>
                        <div class="stat-row">
                            <span class="stat-label">Config loaded</span>
                            <span class="stat-value ok">✅ Yes</span>
                        </div>
                        <div class="stat-row">
                            <span class="stat-label">Config path</span>
                            <span class="stat-value info" style="font-size:0.7rem;"><?= htmlspecialchars($configPath) ?></span>
                        </div>
                        <?php if ($dbConnected): ?>
                            <div class="stat-row">
                                <span class="stat-label">Connected</span>
                                <span class="stat-value ok">✅ Yes</span>
                            </div>
                        <?php else: ?>
                            <div class="stat-row">
                                <span class="stat-label">Connected</span>
                                <span class="stat-value err">❌ No</span>
                            </div>
                            <?php if ($dbInfo['error']): ?>
                                <div class="stat-row">
                                    <span class="stat-label">Error</span>
                                    <span class="stat-value err" style="font-size:0.7rem;"><?= htmlspecialchars($dbInfo['error']) ?></span>
                                </div>
                            <?php endif; ?>
                        <?php endif; ?>
                    <?php else: ?>
                        <div class="stat-row">
                            <span class="stat-label">Config loaded</span>
                            <span class="stat-value err">❌ No — <?= htmlspecialchars($configError) ?></span>
                        </div>
                    <?php endif; ?>
                    <div style="margin-top:0.75rem; font-size:0.78rem; color:#64748b;">
                        🔒 <strong>Table details &amp; row counts</strong> require admin login.
                    </div>
                </div>
            </div>

            <!-- Uploads (public — useful for troubleshooting) -->
            <div class="card full">
                <div class="card-title">📁 Upload Directories</div>
                <table>
                    <thead>
                        <tr>
                            <th>Path</th>
                            <th>Exists</th>
                            <th>Writable</th>
                            <th>Permissions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($uploadInfo as $key => $info): ?>
                            <tr>
                                <td><strong><?= strtoupper($key) ?></strong><br><span class="muted" style="font-size:0.7rem;"><?= htmlspecialchars($info['path']) ?></span></td>
                                <td><?= boolIcon($info['exists']) ?></td>
                                <td><?= boolIcon($info['writable']) ?></td>
                                <td><?= $info['perms'] ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                <?php if (!$uploadInfo['base']['exists']): ?>
                    <p style="margin-top: 0.75rem; color: #f87171; font-size: 0.85rem;">
                        ⚠️ Uploads base directory does not exist. Run <code>install.php</code> to create it.
                    </p>
                <?php elseif (!$uploadInfo['base']['writable']): ?>
                    <p style="margin-top: 0.75rem; color: #fbbf24; font-size: 0.85rem;">
                        ⚠️ Uploads directory exists but is <strong>not writable</strong> by PHP. Set permissions to 755 or 777.
                    </p>
                <?php endif; ?>
                <div style="margin-top:0.75rem; font-size:0.78rem; color:#64748b;">
                    🔒 <strong>Month folder contents &amp; file listings</strong> require admin login.
                </div>
            </div>

            <!-- Quick Help (public) -->
            <div class="card full">
                <div class="card-title">💡 Quick Troubleshooting Guide</div>
                <div style="font-size: 0.85rem; line-height: 1.6; color: #cbd5e1;">
                    <p><strong>🔴 Homepage is blank</strong> → Check if <code>.htaccess</code> exists (see card above). Try visiting <code>/index.html</code> directly. If that works, mod_rewrite isn't enabled.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 API returns 404</strong> → The <code>backend/api/.htaccess</code> routes requests to PHP files. Try <code>/backend/api/health.php</code> (with full filename). If that works, the rewrite rules need fixing.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 Uploads fail silently</strong> → Check the Uploads card above. If the directory isn't writable, files go nowhere. Set permissions to 755 or 777.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 Login not working</strong> → Check that the database is connected (see Database card). If config file is missing, run <code>backend/install.php</code>.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 Need more details?</strong> → Log in as admin above to see full database tables, API endpoint tests, and PHP error logs.</p>
                </div>
            </div>

            <div style="text-align: center; margin-top: 2rem; padding: 1rem; border-top: 1px solid rgba(255,255,255,0.06); color: #64748b; font-size: 0.8rem;">
                Daily Impact Devotional — Basic Diagnostics &bull; Generated <?= date('Y-m-d H:i:s') ?>
            </div>

        <?php else: ?>
            <!-- Admin view: full diagnostic -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
                <div>
                    <h1>🩺 Diagnostic</h1>
                    <p class="subtitle">Daily Impact Devotional — System Health & Debug</p>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <span class="badge badge-ok">
                        Admin Authenticated
                    </span>
                    <a href="?<?= http_build_query($_GET) ?>" class="btn-refresh">🔄 Refresh</a>
                </div>
            </div>

        <?php if ($dbConnected): ?>
            <div class="success-banner">✅ Database connected — <?= count($dbInfo['tables'] ?? []) ?> tables, <?= $dbInfo['size_fmt'] ?? '0 B' ?> total</div>
        <?php else: ?>
            <div class="error-banner">❌ Database not connected — <?= htmlspecialchars($dbInfo['error'] ?? 'Unknown error') ?></div>
        <?php endif; ?>

        <?php
        $uploadErr = !$uploadInfo['base']['exists'] || !$uploadInfo['base']['writable'];
        ?>
        <?php if ($uploadErr): ?>
            <div class="error-banner">❌ Upload directory issue — check the Uploads card below for details</div>
        <?php elseif ($uploadInfo['base']['writable']): ?>
            <div class="success-banner">✅ Uploads directory writable</div>
        <?php endif; ?>

        <!-- Summary Bar -->
        <div class="summary-bar">
            <div class="summary-item">
                <div class="summary-number <?= $dbConnected ? 'ok' : 'err' ?>"><?= $dbConnected ? 'OK' : 'ERR' ?></div>
                <div class="summary-label">Database</div>
            </div>
            <div class="summary-item">
                <div class="summary-number <?= $uploadInfo['base']['writable'] ? 'ok' : 'err' ?>"><?= $uploadInfo['base']['writable'] ? 'OK' : 'ERR' ?></div>
                <div class="summary-label">Uploads Writable</div>
            </div>
            <div class="summary-item">
                <div class="summary-number"><?= count($results['api_tests'] ?? []) ?></div>
                <div class="summary-label">API Endpoints Tested</div>
            </div>
            <div class="summary-item">
                <div class="summary-number <?= $isAdmin ? 'ok' : 'warn' ?>"><?= $isAdmin ? 'Active' : 'Guest' ?></div>
                <div class="summary-label">Session</div>
            </div>
            <div class="summary-item">
                <div class="summary-number"><?= count($results['error_log']['lines'] ?? []) ?></div>
                <div class="summary-label">Recent Errors</div>
            </div>
        </div>

        <!-- Cards Grid -->
        <div class="grid">

            <!-- PHP & Server Info -->
            <div class="card">
                <div class="card-title">🐘 PHP & Server</div>
                <?php foreach ($results['php'] as $label => $val): ?>
                    <div class="stat-row">
                        <span class="stat-label"><?= $label ?></span>
                        <span class="stat-value info"><?= htmlspecialchars((string)$val) ?></span>
                    </div>
                <?php endforeach; ?>
            </div>

            <!-- Extensions -->
            <div class="card">
                <div class="card-title">🔌 Required Extensions</div>
                <?php foreach ($results['extensions'] as $ext => $loaded): ?>
                    <div class="stat-row">
                        <span class="stat-label"><?= $ext ?></span>
                        <span class="stat-value <?= $loaded ? 'ok' : 'err' ?>"><?= $loaded ? 'Loaded' : 'MISSING' ?></span>
                    </div>
                <?php endforeach; ?>
            </div>

            <!-- Session -->
            <div class="card">
                <div class="card-title">🔐 Session</div>
                <?php foreach ($results['session'] as $label => $val): ?>
                    <div class="stat-row">
                        <span class="stat-label"><?= ucfirst(str_replace('_', ' ', $label)) ?></span>
                        <span class="stat-value <?= $val ? 'ok' : 'muted' ?>"><?= htmlspecialchars((string)($val ?? 'N/A')) ?></span>
                    </div>
                <?php endforeach; ?>
            </div>

            <!-- .htaccess -->
            <div class="card">
                <div class="card-title">📄 .htaccess</div>
                <?php foreach ($results['htaccess'] as $label => $val): ?>
                    <div class="stat-row">
                        <span class="stat-label"><?= ucfirst($label) ?></span>
                        <span class="stat-value <?= $val ? 'ok' : 'err' ?>"><?= htmlspecialchars((string)$val) ?></span>
                    </div>
                <?php endforeach; ?>
                <?php if ($results['htaccess']['exists'] && $results['htaccess']['readable']): ?>
                    <details>
                        <summary>View contents</summary>
                        <pre><?= htmlspecialchars(file_get_contents($htaccessPath)) ?></pre>
                    </details>
                <?php endif; ?>
            </div>

            <!-- Database Tables -->
            <div class="card full">
                <div class="card-title">🗄️ Database Tables</div>
                <?php if ($dbConnected && !empty($dbInfo['tables'])): ?>
                    <table>
                        <thead>
                            <tr>
                                <th>Table</th>
                                <th>Engine</th>
                                <th>Rows</th>
                                <th>Size</th>
                                <th>Collation</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($dbInfo['tables'] as $t): ?>
                                <tr>
                                    <td><strong><?= htmlspecialchars($t['name']) ?></strong></td>
                                    <td><?= $t['engine'] ?></td>
                                    <td><?= $t['rows'] >= 0 ? number_format($t['rows']) : '<span class="stat-value err">Error</span>' ?></td>
                                    <td><?= $t['size_fmt'] ?></td>
                                    <td class="muted"><?= $t['collation'] ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <div style="margin-top: 0.5rem; text-align: right; font-size: 0.8rem; color: #94a3b8;">
                        <strong>Total:</strong> <?= count($dbInfo['tables']) ?> tables, <?= $dbInfo['size_fmt'] ?>
                    </div>
                <?php else: ?>
                    <p class="stat-value err"><?= htmlspecialchars($dbInfo['error'] ?? 'No tables found') ?></p>
                <?php endif; ?>
            </div>

            <!-- Uploads -->
            <div class="card full">
                <div class="card-title">📁 Upload Directories</div>

                <table>
                    <thead>
                        <tr>
                            <th>Path</th>
                            <th>Exists</th>
                            <th>Writable</th>
                            <th>Permissions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($uploadInfo as $key => $info): ?>
                            <tr>
                                <td><strong><?= strtoupper($key) ?></strong><br><span class="muted" style="font-size:0.7rem;"><?= htmlspecialchars($info['path']) ?></span></td>
                                <td><?= boolIcon($info['exists']) ?></td>
                                <td><?= boolIcon($info['writable']) ?></td>
                                <td><?= $info['perms'] ?></td>
                            </tr>
                            <?php if (!empty($info['month_folders'])): ?>
                                <tr>
                                    <td colspan="4" style="padding: 0;">
                                        <details>
                                            <summary style="padding: 0.3rem 0.6rem;">
                                                📂 Month folders (<?= count($info['month_folders']) ?>)
                                            </summary>
                                            <table style="margin: 0;">
                                                <thead>
                                                    <tr>
                                                        <th>Folder / File</th>
                                                        <th>Files</th>
                                                        <th>Total Size</th>
                                                        <th>Writable</th>
                                                        <th>Perms</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <?php foreach ($info['month_folders'] as $mf): ?>
                                                        <tr>
                                                            <td><?= htmlspecialchars($mf['name']) ?></td>
                                                            <td><?= $mf['file_count'] ?></td>
                                                            <td><?= $mf['total_size'] ?></td>
                                                            <td><?= boolIcon($mf['writable']) ?></td>
                                                            <td><?= $mf['perms'] ?></td>
                                                        </tr>
                                                    <?php endforeach; ?>
                                                </tbody>
                                            </table>
                                        </details>
                                    </td>
                                </tr>
                            <?php endif; ?>
                        <?php endforeach; ?>
                    </tbody>
                </table>

                <?php if (!$uploadInfo['base']['exists']): ?>
                    <p style="margin-top: 0.75rem; color: #f87171; font-size: 0.85rem;">
                        ⚠️ Uploads base directory does not exist. Run <code>install.php</code> to create it, or manually:
                        <code style="display: block; margin-top: 0.25rem; background: rgba(15,23,42,0.6); padding: 0.5rem; border-radius: 4px;">
                            mkdir -p <?= htmlspecialchars($uploadBase) ?>/headers && chmod 777 <?= htmlspecialchars($uploadBase) ?>/headers<br>
                            mkdir -p <?= htmlspecialchars($uploadBase) ?>/devotionals && chmod 777 <?= htmlspecialchars($uploadBase) ?>/devotionals
                        </code>
                    </p>
                <?php elseif (!$uploadInfo['base']['writable']): ?>
                    <p style="margin-top: 0.75rem; color: #fbbf24; font-size: 0.85rem;">
                        ⚠️ Uploads directory exists but is <strong>not writable</strong> by PHP. In cPanel File Manager, right-click
                        the <code>uploads</code> folder → <strong>Change Permissions</strong> → set to <strong>755</strong> or <strong>777</strong>.
                    </p>
                <?php endif; ?>
            </div>

            <!-- API Tests -->
            <div class="card full">
                <div class="card-title">🌐 API Endpoint Tests</div>
                <?php foreach ($results['api_tests'] as $label => $api): ?>
                    <div class="api-row">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                            <div>
                                <strong style="font-size: 0.85rem;"><?= $label ?></strong>
                                <span class="muted" style="font-size: 0.7rem; margin-left: 0.5rem;"><?= htmlspecialchars($api['url']) ?></span>
                            </div>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <span class="stat-value <?= $api['http_code'] >= 200 && $api['http_code'] < 300 ? 'ok' : 'err' ?>">
                                    HTTP <?= $api['http_code'] ?>
                                </span>
                                <span class="muted" style="font-size: 0.7rem;"><?= $api['time'] ?></span>
                            </div>
                        </div>
                        <?php if ($api['curl_error']): ?>
                            <div style="color: #f87171; font-size: 0.78rem; margin-bottom: 0.25rem;">
                                ⚠️ cURL Error: <?= htmlspecialchars($api['curl_error']) ?>
                            </div>
                        <?php endif; ?>
                        <?php if ($api['is_json'] && $api['parsed'] !== null): ?>
                            <details>
                                <summary>View JSON response (<?= $api['body_size'] ?>)</summary>
                                <pre class="json-view"><?php
                                    // Pretty print with syntax hint
                                    echo htmlspecialchars(json_encode($api['parsed'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
                                ?></pre>
                            </details>
                        <?php elseif (!$api['curl_error']): ?>
                            <span class="muted" style="font-size: 0.75rem;">Non-JSON response (<?= $api['body_size'] ?>)</span>
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
            </div>

            <!-- Error Log -->
            <div class="card full">
                <div class="card-title">⚠️ PHP Error Log (last <?= count($results['error_log']['lines']) ?> entries)</div>
                <div class="stat-row">
                    <span class="stat-label">Log Path</span>
                    <span class="stat-value muted"><?= htmlspecialchars($results['error_log']['path']) ?></span>
                </div>
                <?php if (!empty($results['error_log']['lines'])): ?>
                    <pre><?php
                        foreach ($results['error_log']['lines'] as $line) {
                            $cls = '';
                            if (stripos($line, 'error') !== false || stripos($line, 'fatal') !== false || stripos($line, 'exception') !== false) {
                                $cls = 'error-line';
                            }
                            echo '<span class="' . $cls . '">' . htmlspecialchars($line) . "</span>\n";
                        }
                    ?></pre>
                <?php else: ?>
                    <p class="muted" style="font-size: 0.85rem;">No recent errors found.</p>
                <?php endif; ?>
            </div>

            <!-- Recently Modified Files -->
            <div class="card full">
                <div class="card-title">📂 Recently Modified Files (last 7 days)</div>
                <?php if (!empty($results['recent_files'])): ?>
                    <table>
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Size</th>
                                <th>Modified</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($results['recent_files'] as $f): ?>
                                <tr>
                                    <td><?= htmlspecialchars($f['path']) ?></td>
                                    <td><?= $f['size'] ?></td>
                                    <td class="muted"><?= $f['mtime'] ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php else: ?>
                    <p class="muted" style="font-size: 0.85rem;">No recently modified files found.</p>
                <?php endif; ?>
            </div>

            <!-- Quick Help -->
            <div class="card full">
                <div class="card-title">💡 Quick Troubleshooting Guide</div>
                <div style="font-size: 0.85rem; line-height: 1.6; color: #cbd5e1;">
                    <p><strong>🔴 Homepage is blank</strong> → Check if <code>.htaccess</code> exists (see card above). Try visiting <code>/index.html</code> directly. If that works, mod_rewrite isn't enabled.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 API returns 404</strong> → The <code>backend/api/.htaccess</code> routes requests to PHP files. Try <code>/backend/api/health.php</code> (with full filename). If that works, the rewrite rules need fixing.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 Uploads fail silently</strong> → Check the Uploads card above. If the directory isn't writable, files go nowhere. Set permissions to 755 or 777.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 Wrong devotional showing</strong> → Check the <code>devotionals</code> table row count above. If it's 0, no devotionals are in the database. Check API tests for <code>/backend/api/devotionals.php</code>.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 Login not working</strong> → Check the Session card. Make sure session cookies aren't blocked. Try clearing browser cookies and re-logging.</p>
                    <p style="margin-top: 0.5rem;"><strong>🔴 Need more details?</strong> → Check the PHP error log above for stack traces. Also check your cPanel error logs under <strong>Metrics → Errors</strong>.</p>
                </div>
            </div>

        </div>

        <div style="text-align: center; margin-top: 2rem; padding: 1rem; border-top: 1px solid rgba(255,255,255,0.06); color: #64748b; font-size: 0.8rem;">
            Daily Impact Devotional — Diagnostic Page &bull; Generated <?= date('Y-m-d H:i:s') ?> &bull; 
            <span class="badge badge-warn">Delete after use</span>
        </div>

        <?php endif; /* end admin gate */ ?>

    </div>
</body>
</html>
