<?php
/**
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

/**
 * Daily Impact Devotional - Health Check API
 * 
 * GET /api/health.php - Returns server health status
 * 
 * IMPORTANT: This endpoint MUST always return a valid 200 response.
 * It is STANDALONE — does NOT require config/db.php because that file
 * exits with HTTP 500 if the database is down, which would crash this
 * endpoint. Instead, this endpoint handles the DB connection itself
 * and returns 'degraded' status gracefully.
 */

// ─── Standalone helpers (no config/db.php dependency) ─────────────────────

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ─── Self-contained database check ────────────────────────────────────────

$dbOk = false;
$devotionalCount = 0;
$dbSize = 0;
$dbError = '';

// Load database config if it exists
$configPath = __DIR__ . '/../config/db.php';
$db_host = 'localhost';
$db_name = '';
$db_user = '';
$db_pass = '';

if (file_exists($configPath)) {
    // Extract credentials without running the full require (which crashes on PDO failure)
    $configContent = file_get_contents($configPath);
    if (preg_match('/\$db_host\s*=\s*[\'"]([^\'"]+)[\'"]\s*;/', $configContent, $m)) $db_host = $m[1];
    if (preg_match('/\$db_name\s*=\s*[\'"]([^\'"]+)[\'"]\s*;/', $configContent, $m)) $db_name = $m[1];
    if (preg_match('/\$db_user\s*=\s*[\'"]([^\'"]+)[\'"]\s*;/', $configContent, $m)) $db_user = $m[1];
    if (preg_match('/\$db_pass\s*=\s*[\'"]([^\'"]+)[\'"]\s*;/', $configContent, $m)) $db_pass = $m[1];
}

// Try connecting to MySQL directly — catch ALL errors, never crash
try {
    if (extension_loaded('pdo_mysql') && !empty($db_name)) {
        $testPdo = new PDO(
            "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4",
            $db_user,
            $db_pass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 3,
            ]
        );
        
        $stmt = $testPdo->query("SELECT COUNT(*) FROM devotionals");
        $devotionalCount = (int)$stmt->fetchColumn();
        $dbOk = true;

        try {
            $stmt = $testPdo->query("SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) 
                                      FROM information_schema.tables 
                                      WHERE table_schema = (SELECT DATABASE())");
            $dbSize = (float)$stmt->fetchColumn();
        } catch (Exception $e) {
            $dbSize = 0;
        }
    } else {
        $dbError = !extension_loaded('pdo_mysql') ? 'pdo_mysql extension not loaded' : 'No database configured';
    }
} catch (Exception $e) {
    $dbError = $e->getMessage();
    $dbOk = false;
}

// ─── Upload directory check (graceful) ────────────────────────────────────

$uploadBase = __DIR__ . '/../../upload';
$uploadsOk = is_dir($uploadBase);
$headersOk = is_dir($uploadBase . '/headers');
$devotionalsDirOk = is_dir($uploadBase . '/devotionals');

// ─── Always return HTTP 200 ───────────────────────────────────────────────

http_response_code(200);
echo json_encode([
    'status'   => $dbOk ? 'ok' : 'degraded',
    'database' => $dbOk,
    'php'      => PHP_VERSION,
    'details'  => [
        'database'  => [
            'connected'  => $dbOk,
            'size_mb'    => $dbSize,
            'devotionals'=> $devotionalCount,
            'error'      => $dbError ?: null,
        ],
        'uploads'   => [
            'base'       => $uploadsOk,
            'headers'    => $headersOk,
            'devotionals'=> $devotionalsDirOk,
        ],
        'phpVersion'=> PHP_VERSION,
        'server'    => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
        'time'      => date('c'),
    ],
]);
exit;
