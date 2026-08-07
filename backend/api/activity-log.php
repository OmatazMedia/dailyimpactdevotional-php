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
 * Daily Impact Devotional - Real-Time Activity Log API
 *
 * GET /api/activity-log?limit=N   - Recent admin activity (requires login).
 *                                   Powers the dashboard's "Administrative Log
 *                                   Feed" so it shows REAL, real-time events
 *                                   instead of hardcoded demo entries.
 *
 * Entries are written by logActivity() (config/db.php) from the admin,
 * devotionals, headers, telegram and settings endpoints.
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();
requireSection('overview');
ensureActivityTables();

$limit = isset($_GET['limit']) ? max(1, min(200, (int)$_GET['limit'])) : 50;

try {
    $stmt = $pdo->query(
        "SELECT * FROM activity_log ORDER BY created_at DESC, id DESC LIMIT {$limit}"
    );
    $rows = $stmt->fetchAll();
} catch (Exception $e) {
    // Table missing — return an empty feed rather than a hard error.
    $rows = [];
}

// created_at is a TIMESTAMP column: MySQL returns it in the SESSION timezone
// (often UTC on cPanel), which the browser cannot interpret on its own. Convert
// each row to an ISO-8601 string in the admin timezone so the dashboard's
// "X minutes ago" feed always reflects the real instant, regardless of where
// the MySQL server / visitor browser clock is set.
$adminTz = (string)getSetting('admin_timezone', 'Africa/Lagos');
try {
    // Seconds from the session's "now" back to UTC (UTC - NOW). A session
    // running 5h behind UTC yields +18000, meaning the raw string is 5h
    // behind UTC and must be shifted FORWARD by that many seconds.
    $sessOffsetSec = (int)$pdo->query("SELECT TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP())")->fetchColumn();
} catch (Throwable $e) {
    $sessOffsetSec = 0;
}

$out = [];
foreach ($rows as $r) {
    $createdAt = (string)$r['created_at'];
    try {
        $dt = new DateTime($createdAt, new DateTimeZone('UTC'));
        if ($sessOffsetSec !== 0) {
            $dt->modify(($sessOffsetSec >= 0 ? '+' : '') . $sessOffsetSec . ' seconds');
        }
        $dt->setTimezone(new DateTimeZone($adminTz));
        $createdAt = $dt->format('c'); // e.g. 2026-08-06T08:10:00+01:00
    } catch (Throwable $e) {
        // Leave the raw value; the frontend falls back to best-effort parsing.
    }
    $out[] = [
        'id'         => (string)$r['id'],
        'action'     => (string)$r['action'],
        'message'    => (string)$r['message'],
        'entityType' => (string)$r['entity_type'],
        'entityId'   => (string)$r['entity_id'],
        'actor'      => (string)$r['actor'],
        'ipAddress'  => (string)$r['ip_address'],
        'createdAt'  => $createdAt,
    ];
}

jsonResponse(['success' => true, 'logs' => $out]);
