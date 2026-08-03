<?php
/**
 * Daily Impact Devotional - Devotional Reactions API
 *
 * POST /api/reactions          - Record a visitor reaction (public, no login)
 *                                Body: { devotionalId, emoji, action: 'react'|'unreact' }
 * GET  /api/reactions?devotionalId=X - Counts for one devotional (public)
 * GET  /api/reactions?all=1     - Counts for ALL devotionals (public)
 *
 * One vote per (devotional, emoji, IP) — real unique reactions, no fake
 * seeded numbers. The dashboard's ListDevotional reads ?all=1 to show the
 * genuine reaction state of every daily devotional.
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();
ensureActivityTables();

function reactionCountsFor(string $devotionalId): array {
    global $pdo;
    $stmt = $pdo->prepare(
        "SELECT emoji, COUNT(*) AS cnt FROM devotional_reaction_votes
         WHERE devotional_id = ? GROUP BY emoji"
    );
    $stmt->execute([$devotionalId]);
    $counts = [];
    foreach ($stmt->fetchAll() as $r) {
        $counts[$r['emoji']] = (int)$r['cnt'];
    }
    return $counts;
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'POST':
        $input = jsonInput();
        $devotionalId = trim((string)($input['devotionalId'] ?? ''));
        $emoji        = trim((string)($input['emoji'] ?? ''));
        $action       = trim((string)($input['action'] ?? 'react'));

        if ($devotionalId === '' || $emoji === '') {
            jsonError('devotionalId and emoji are required', 400);
        }
        $emoji = mb_substr($emoji, 0, 16);

        $ipHash = hash('sha256', getClientIp());

        if ($action === 'unreact') {
            $stmt = $pdo->prepare(
                "DELETE FROM devotional_reaction_votes
                 WHERE devotional_id = ? AND emoji = ? AND ip_hash = ?"
            );
            $stmt->execute([$devotionalId, $emoji, $ipHash]);
        } else {
            $stmt = $pdo->prepare(
                "INSERT IGNORE INTO devotional_reaction_votes (devotional_id, emoji, ip_hash)
                 VALUES (?, ?, ?)"
            );
            $stmt->execute([$devotionalId, $emoji, $ipHash]);
        }

        jsonResponse([
            'success' => true,
            'counts'  => reactionCountsFor($devotionalId),
        ]);
        break;

    case 'GET':
        if (isset($_GET['all']) && $_GET['all'] !== '') {
            // All devotionals at once — used by the admin list view.
            $stmt = $pdo->query(
                "SELECT devotional_id, emoji, COUNT(*) AS cnt
                 FROM devotional_reaction_votes
                 GROUP BY devotional_id, emoji"
            );
            $grouped = [];
            foreach ($stmt->fetchAll() as $r) {
                $grouped[$r['devotional_id']][$r['emoji']] = (int)$r['cnt'];
            }
            jsonResponse($grouped);
        }

        $devotionalId = trim((string)($_GET['devotionalId'] ?? ''));
        if ($devotionalId === '') {
            jsonError('devotionalId is required', 400);
        }
        jsonResponse([
            'success' => true,
            'counts'  => reactionCountsFor($devotionalId),
        ]);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
