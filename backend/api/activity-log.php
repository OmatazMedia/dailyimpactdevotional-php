<?php
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

$out = [];
foreach ($rows as $r) {
    $out[] = [
        'id'         => (string)$r['id'],
        'action'     => (string)$r['action'],
        'message'    => (string)$r['message'],
        'entityType' => (string)$r['entity_type'],
        'entityId'   => (string)$r['entity_id'],
        'actor'      => (string)$r['actor'],
        'ipAddress'  => (string)$r['ip_address'],
        'createdAt'  => (string)$r['created_at'],
    ];
}

jsonResponse(['success' => true, 'logs' => $out]);
