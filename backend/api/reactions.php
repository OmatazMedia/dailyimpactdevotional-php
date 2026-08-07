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

/**
 * Single-selection migration — self-contained so it runs even when a cPanel
 * install still has an older config/db.php (which won't carry the migration).
 * Older installs had ONE vote per (devotional, emoji, IP); the new contract is
 * ONE vote per (devotional, IP) with the emoji replaced on re-react. Detects
 * the legacy 3-column unique key (or a missing key from a partial earlier run)
 * and rebuilds it idempotently, keeping the visitor's most recent vote.
 * Runs once per PHP process (reactions.php is a hot public endpoint).
 */
function ensureSingleSelectionReactionKey(): void {
    global $pdo;
    if (!$pdo instanceof PDO) return;
    static $checked = false;
    if ($checked) return;
    try {
        $idx = $pdo->query("SHOW INDEX FROM devotional_reaction_votes WHERE Key_name = 'uk_vote'");
        $keyCols = $idx ? $idx->fetchAll(PDO::FETCH_ASSOC) : [];
        $hasEmojiInKey = false;
        foreach ($keyCols as $col) {
            // Column_name casing differs between MySQL/MariaDB and PDO modes.
            $colName = strtolower((string)($col['Column_name'] ?? $col['column_name'] ?? ''));
            if ($colName === 'emoji') {
                $hasEmojiInKey = true;
                break;
            }
        }
        // Rebuild if the key still contains emoji (legacy) OR is missing
        // entirely (a prior DROP succeeded but ADD failed).
        if ($hasEmojiInKey || count($keyCols) === 0) {
            // Keep only the newest vote per (devotional, IP) before enforcing
            // the new unique constraint (dedupe any legacy multi-reactions).
            $pdo->exec(
                "DELETE v1 FROM devotional_reaction_votes v1
                 INNER JOIN devotional_reaction_votes v2
                    ON v1.devotional_id = v2.devotional_id
                   AND v1.ip_hash = v2.ip_hash
                   AND v1.id < v2.id"
            );
            try {
                $pdo->exec("ALTER TABLE devotional_reaction_votes DROP INDEX uk_vote");
            } catch (Throwable $e) {
                // index may not exist — that's fine, we're about to add it
            }
            $pdo->exec("ALTER TABLE devotional_reaction_votes ADD UNIQUE KEY uk_vote (devotional_id, ip_hash)");
        }
    } catch (Throwable $e) {
        // Table may not exist yet on a brand-new install — install.php creates it.
        return;
    }
    $checked = true;
}
ensureSingleSelectionReactionKey();

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

        // Single-selection: a visitor can hold AT MOST ONE reaction per
        // devotional. The unique key is (devotional_id, ip_hash), so:
        //  - 'react' with a new emoji REPLACES the previously held one
        //    (ON DUPLICATE KEY UPDATE swaps the emoji in place).
        //  - 'unreact' removes the single held vote regardless of emoji.
        if ($action === 'unreact') {
            $stmt = $pdo->prepare(
                "DELETE FROM devotional_reaction_votes
                 WHERE devotional_id = ? AND ip_hash = ?"
            );
            $stmt->execute([$devotionalId, $ipHash]);
        } else {
            $stmt = $pdo->prepare(
                "INSERT INTO devotional_reaction_votes (devotional_id, emoji, ip_hash)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE emoji = VALUES(emoji)"
            );
            $stmt->execute([$devotionalId, $emoji, $ipHash]);
        }

        // Which emoji THIS visitor currently holds after the change (used by
        // the UI to restore the single selected reaction on reload).
        $stmt = $pdo->prepare(
            "SELECT emoji FROM devotional_reaction_votes
             WHERE devotional_id = ? AND ip_hash = ?"
        );
        $stmt->execute([$devotionalId, $ipHash]);
        $mine = $stmt->fetchColumn();
        jsonResponse([
            'success' => true,
            'counts'  => reactionCountsFor($devotionalId),
            'mine'    => $mine !== false ? (string)$mine : null,
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
        // Tell the UI which emoji THIS visitor already voted (so the single
        // selected reaction is restored when the page reloads).
        $ipHash = hash('sha256', getClientIp());
        $stmt = $pdo->prepare(
            "SELECT emoji FROM devotional_reaction_votes
             WHERE devotional_id = ? AND ip_hash = ?"
        );
        $stmt->execute([$devotionalId, $ipHash]);
        $mine = $stmt->fetchColumn();
        jsonResponse([
            'success' => true,
            'counts'  => reactionCountsFor($devotionalId),
            'mine'    => $mine !== false ? (string)$mine : null,
        ]);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
