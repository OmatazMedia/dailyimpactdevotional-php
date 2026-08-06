<?php
/**
 * Daily Impact Devotional - Website Analytics API
 *
 * GET  /api/analytics?action=summary&month=July&year=2026 - Aggregated report
 * GET  /api/analytics?action=ranges                       - Months/years with data
 * POST /api/analytics?action=visit                        - Record a page visit
 * POST /api/analytics?action=heartbeat                    - Update last-active time
 * POST /api/analytics?action=leave                        - Finalize time-on-site
 *
 * Tracking flow (frontend lib/analytics.ts):
 *   1. On page load (public site only — admin dashboard is skipped) the client
 *      POSTs { action: "visit", sessionId, page, referrer, locale, device }.
 *   2. Every ~20s it POSTs a heartbeat so the server knows the visitor is still
 *      around (used to estimate average time on site even if the tab is closed).
 *   3. On unload/visibility-hidden it sends { action: "leave" } via sendBeacon
 *      so the session's duration_seconds is finalized.
 *
 * The table is created idempotently on first request so existing deployments
 * do not need to run any SQL manually.
 */

require_once __DIR__ . '/../config/db.php';

// ─── Idempotent table creation ───────────────────────────────────────────────
function ensureAnalyticsTable(): void {
    global $pdo;
    if (!$pdo instanceof PDO) return;
    static $checked = false;
    if ($checked) return;
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS analytics_visits (
            id VARCHAR(36) PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            page VARCHAR(255) DEFAULT '',
            referrer VARCHAR(500) DEFAULT '',
            locale VARCHAR(50) DEFAULT '',
            country VARCHAR(100) DEFAULT '',
            region VARCHAR(100) DEFAULT '',
            city VARCHAR(100) DEFAULT '',
            device VARCHAR(20) DEFAULT 'desktop',
            user_agent VARCHAR(500) DEFAULT '',
            is_new TINYINT(1) DEFAULT 1,
            visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active_at TIMESTAMP NULL,
            duration_seconds INT DEFAULT 0,
            INDEX idx_session (session_id),
            INDEX idx_visited (visited_at),
            INDEX idx_page (page)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) {
        return;
    }
    $checked = true;
}

sendCorsHeaders();
ensureAnalyticsTable();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// ─── Client IP + best-effort geolocation ─────────────────────────────────────
$ip = getClientIp();
$geo = ['country' => '', 'region' => '', 'city' => ''];

function geoLookup(string $ipAddress): array {
    // Skip private/local ranges — no point querying an API for them.
    if (filter_var($ipAddress, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        return ['country' => '', 'region' => '', 'city' => ''];
    }
    $result = @file_get_contents(
        "http://ip-api.com/json/" . rawurlencode($ipAddress) . "?fields=country,regionName,city",
        false,
        stream_context_create(['http' => ['timeout' => 3]])
    );
    if ($result) {
        $data = json_decode($result, true);
        if (is_array($data) && !empty($data['status']) && $data['status'] === 'success') {
            return [
                'country' => (string)($data['country'] ?? ''),
                'region'  => (string)($data['regionName'] ?? ''),
                'city'    => (string)($data['city'] ?? ''),
            ];
        }
    }
    return ['country' => '', 'region' => '', 'city' => ''];
}

if ($method === 'POST') {
    $input = jsonInput();
    $sessionId = trim((string)($input['sessionId'] ?? ''));
    $sessionId = substr(preg_replace('/[^a-zA-Z0-9_-]/', '', $sessionId), 0, 64);
    if ($sessionId === '') {
        jsonError('sessionId is required', 400);
    }

    switch ($action) {
        case 'visit':
            // One row per visitor session (a session may span several page loads).
            $page     = substr(trim((string)($input['page'] ?? '')), 0, 255);
            $referrer = substr(trim((string)($input['referrer'] ?? '')), 0, 500);
            $locale   = substr(trim((string)($input['locale'] ?? '')), 0, 50);
            $device   = in_array(($input['device'] ?? ''), ['mobile', 'tablet', 'desktop'], true) ? $input['device'] : 'desktop';
            $ua       = substr(trim((string)($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 500);

            // Reuse the geolocation across all requests in this PHP process.
            static $geoCache = null;
            if ($geoCache === null) {
                $geoCache = geoLookup($ip);
            }
            $country = $geoCache['country'];
            $region  = $geoCache['region'];
            $city    = $geoCache['city'];

            $stmt = $pdo->prepare("SELECT id FROM analytics_visits WHERE session_id = ? LIMIT 1");
            $stmt->execute([$sessionId]);
            $existing = $stmt->fetch();

            if ($existing) {
                // Returning session — refresh last_active + remember the newest page.
                $upd = $pdo->prepare("UPDATE analytics_visits SET last_active_at = NOW(), page = ?, referrer = ? WHERE session_id = ?");
                $upd->execute([$page, $referrer, $sessionId]);
                jsonResponse(['success' => true, 'isNew' => false]);
            }

            $stmt = $pdo->prepare(
                "INSERT INTO analytics_visits
                    (id, session_id, page, referrer, locale, country, region, city, device, user_agent, is_new, visited_at, last_active_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())"
            );
            $stmt->execute([
                generateId(), $sessionId, $page, $referrer, $locale,
                $country, $region, $city, $device, $ua,
            ]);
            jsonResponse(['success' => true, 'isNew' => true]);
            break;

        case 'heartbeat':
            $upd = $pdo->prepare("UPDATE analytics_visits SET last_active_at = NOW() WHERE session_id = ?");
            $upd->execute([$sessionId]);
            jsonResponse(['success' => true]);
            break;

        case 'leave':
            // Finalize duration (seconds since first visit). The client sends its
            // own measurement; the server caps it with real elapsed time.
            $reported = max(0, (int)($input['durationSeconds'] ?? 0));
            $upd = $pdo->prepare(
                "UPDATE analytics_visits
                 SET last_active_at = NOW(),
                     duration_seconds = GREATEST(duration_seconds, LEAST(?, TIMESTAMPDIFF(SECOND, visited_at, NOW()) + 5))
                 WHERE session_id = ?"
            );
            $upd->execute([$reported, $sessionId]);
            jsonResponse(['success' => true]);
            break;

        default:
            jsonError('Invalid action. Use: visit, heartbeat, or leave');
    }
    return;
}

if ($method === 'GET') {
    // Report endpoints are admin-only and gated by role permissions (the
    // visit/heartbeat/leave POST actions above stay public for tracking).
    requireSection('analytics');

    if ($action === 'ranges') {
        // Months + years that actually have data, for the filter dropdowns.
        $stmt = $pdo->query(
            "SELECT DISTINCT YEAR(visited_at) AS y, MONTH(visited_at) AS m
             FROM analytics_visits ORDER BY y DESC, m DESC LIMIT 60"
        );
        $months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        $ranges = [];
        foreach ($stmt->fetchAll() as $r) {
            $ranges[] = ['year' => (int)$r['y'], 'month' => $months[(int)$r['m'] - 1]];
        }
        jsonResponse(['success' => true, 'ranges' => $ranges]);
        return;
    }

    if ($action === 'summary') {
        $month = ucfirst(strtolower(trim((string)($_GET['month'] ?? ''))));
        $year  = (int)($_GET['year'] ?? 0);

        $months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        if (!in_array($month, $months, true) || $year <= 0) {
            // Default to the most recent month with data (or current month).
            $stmt = $pdo->query("SELECT MAX(visited_at) AS latest FROM analytics_visits");
            $latest = $stmt->fetchColumn();
            if ($latest) {
                $dt = new DateTime($latest);
                $month = $months[(int)$dt->format('n') - 1];
                $year  = (int)$dt->format('Y');
            } else {
                $month = $months[(int)date('n') - 1];
                $year  = (int)date('Y');
            }
        }

        $start = new DateTime("$year-$month-01 00:00:00");
        $end   = (clone $start)->modify('+1 month');

        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);
        $stmt = $pdo->prepare("SELECT * FROM analytics_visits WHERE visited_at >= ? AND visited_at < ? ORDER BY visited_at DESC");
        $stmt->execute([$start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s')]);
        $rows = $stmt->fetchAll();
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

        $totalVisits   = count($rows);
        $sessions      = [];
        $perDay        = [];
        $locales       = [];
        $countries     = [];
        $devices       = [];
        $pages         = [];
        $durationSum   = 0;
        $durationCount = 0;

        foreach ($rows as $r) {
            $sessions[$r['session_id']] = true;
            $day = (int)date('j', strtotime((string)$r['visited_at']));
            $perDay[$day] = ($perDay[$day] ?? 0) + 1;

            $loc = trim((string)$r['locale']);
            if ($loc !== '') $locales[$loc] = ($locales[$loc] ?? 0) + 1;

            $co = trim((string)$r['country']);
            if ($co !== '') $countries[$co] = ($countries[$co] ?? 0) + 1;

            $dev = (string)$r['device'];
            $devices[$dev] = ($devices[$dev] ?? 0) + 1;

            $pg = trim((string)$r['page']);
            if ($pg !== '') $pages[$pg] = ($pages[$pg] ?? 0) + 1;

            // Effective duration: finalized value, else elapsed since last active.
            $dur = (int)$r['duration_seconds'];
            if ($dur <= 0 && !empty($r['last_active_at'])) {
                $dur = max(0, strtotime((string)$r['last_active_at']) - strtotime((string)$r['visited_at']));
            }
            if ($dur > 0) {
                $durationSum += $dur;
                $durationCount++;
            }
        }

        $perDayList = [];
        $daysInMonth = (int)$start->format('t');
        for ($d = 1; $d <= $daysInMonth; $d++) {
            $perDayList[] = ['day' => $d, 'visits' => $perDay[$d] ?? 0];
        }

        arsort($locales);
        arsort($countries);
        arsort($devices);
        arsort($pages);

        jsonResponse([
            'success'        => true,
            'month'          => $month,
            'year'           => $year,
            'totalVisits'    => $totalVisits,
            'uniqueVisitors' => count($sessions),
            'avgDurationSec' => $durationCount > 0 ? (int)round($durationSum / $durationCount) : 0,
            'perDay'         => $perDayList,
            'locales'        => array_map(fn($k, $v) => ['locale' => $k, 'visits' => $v], array_keys($locales), array_values($locales)),
            'countries'      => array_map(fn($k, $v) => ['country' => $k, 'visits' => $v], array_keys($countries), array_values($countries)),
            'devices'        => array_map(fn($k, $v) => ['device' => $k, 'visits' => $v], array_keys($devices), array_values($devices)),
            'pages'          => array_map(fn($k, $v) => ['page' => $k, 'visits' => $v], array_keys($pages), array_values($pages)),
            'recent'         => array_slice(array_map(function ($r) {
                return [
                    'id'         => (string)$r['id'],
                    'page'       => (string)$r['page'],
                    'referrer'   => (string)$r['referrer'],
                    'locale'     => (string)$r['locale'],
                    'country'    => (string)$r['country'],
                    'city'       => (string)$r['city'],
                    'device'     => (string)$r['device'],
                    'duration'   => (int)$r['duration_seconds'],
                    'visitedAt'  => (string)$r['visited_at'],
                    'isNew'      => (bool)$r['is_new'],
                ];
            }, $rows), 0, 15),
        ]);
        return;
    }

    jsonError('Invalid action. Use: summary, or ranges');
}

jsonError('Method not allowed', 405);
