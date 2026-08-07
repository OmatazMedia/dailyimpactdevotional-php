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
 * Daily Impact Devotional - IP Ban Management API
 *
 * GET    /api/ip-bans                          - List bans (paginated + filtered)
 *        ?page=1&perPage=25&month=January&year=2026&scope=active&format=csv
 * GET    /api/ip-bans?action=check             - Is the current IP banned?
 * POST   /api/ip-bans                          - Create a new IP ban
 * POST   /api/ip-bans?action=bulk-unban        - {ids:[]} unban many
 * POST   /api/ip-bans?action=bulk-whitelist    - {ids:[]} whitelist many (never auto-banned)
 * POST   /api/ip-bans?action=bulk-unwhitelist  - {ids:[]} remove whitelist from many
 * DELETE /api/ip-bans?id=<id>                  - Unban one
 * PUT    /api/ip-bans?id=<id>                  - Toggle whitelist flag
 */

require_once __DIR__ . '/../config/db.php';
requireSection('settings');
sendCorsHeaders();

$method = httpMethod();
$action = $_GET['action'] ?? '';

/** Map an ip_bans row to the camelCase shape the frontend expects. */
function mapBanRow(array $ban): array
{
    return [
        'id'             => (string)$ban['id'],
        'ipAddress'      => $ban['ip_address'],
        'ipVersion'      => (int)$ban['ip_version'],
        'cidr'           => $ban['cidr'],
        'banStart'       => $ban['ban_start'],
        'banEnd'         => $ban['ban_end'],
        'reason'         => $ban['reason'],
        'source'         => $ban['source'],
        'email'          => $ban['email'],
        'failedAttempts' => (int)$ban['failed_attempts'],
        'active'         => (bool)$ban['active'],
        'whitelisted'    => (bool)($ban['whitelisted'] ?? 0),
        'unbannedAt'     => $ban['unbanned_at'],
        'unbannedBy'     => $ban['unbanned_by'],
        'createdAt'      => $ban['created_at'],
    ];
}

switch ($method) {
    case 'GET':
        if ($action === 'check') {
            // Check if current IP is banned (whitelisted IPs are never banned)
            $ip = getClientIp();
            $ban = getBanForIp($ip);
            jsonResponse([
                'banned'     => $ban !== null,
                'whitelisted' => isIpWhitelisted($ip),
                'ban'        => $ban !== null ? mapBanRow($ban) : null,
            ]);
        } else {
            $page = max(1, (int)($_GET['page'] ?? 1));
            $perPage = min(200, max(10, (int)($_GET['perPage'] ?? 25)));
            $month = trim((string)($_GET['month'] ?? ''));
            $year = trim((string)($_GET['year'] ?? ''));
            $scope = trim((string)($_GET['scope'] ?? 'all')); // all | active | inactive | whitelisted
            $format = trim((string)($_GET['format'] ?? ''));

            $monthNum = null;
            if ($month !== '') {
                $monthNum = is_numeric($month) ? (int)$month : 0;
                if ($monthNum === 0) {
                    $names = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
                              'august', 'september', 'october', 'november', 'december'];
                    $idx = array_search(strtolower($month), $names, true);
                    $monthNum = $idx !== false ? $idx + 1 : null;
                }
                if ($monthNum !== null && ($monthNum < 1 || $monthNum > 12)) $monthNum = null;
            }

            $where = [];
            $params = [];
            if ($scope === 'active') {
                $where[] = 'active = 1';
            } elseif ($scope === 'inactive') {
                $where[] = 'active = 0';
            } elseif ($scope === 'whitelisted') {
                $where[] = 'whitelisted = 1';
            }
            if ($monthNum !== null) {
                $where[] = 'MONTH(created_at) = ?';
                $params[] = $monthNum;
            }
            if ($year !== '') {
                $where[] = 'YEAR(created_at) = ?';
                $params[] = (int)$year;
            }
            $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM ip_bans {$whereSql}");
            $countStmt->execute($params);
            $total = (int)$countStmt->fetchColumn();
            $pages = max(1, (int)ceil($total / $perPage));
            $page = min($page, $pages);

            $stmt = $pdo->prepare(
                "SELECT * FROM ip_bans {$whereSql}
                 ORDER BY created_at DESC
                 LIMIT " . (int)$perPage . " OFFSET " . (int)(($page - 1) * $perPage)
            );
            $stmt->execute($params);
            $bans = $stmt->fetchAll();

            if ($format === 'csv') {
                $rows = [];
                foreach ($bans as $ban) {
                    $rows[] = [
                        $ban['created_at'],
                        $ban['ip_address'],
                        $ban['cidr'],
                        $ban['reason'],
                        $ban['email'],
                        $ban['source'],
                        (int)$ban['failed_attempts'],
                        ((bool)$ban['active']) ? 'active' : 'unbanned',
                        ((bool)($ban['whitelisted'] ?? 0)) ? 'yes' : 'no',
                    ];
                }
                sendCsv(
                    ['Created At', 'IP Address', 'Subnet (CIDR)', 'Reason', 'Email', 'Source', 'Failed Attempts', 'Status', 'Whitelisted'],
                    $rows,
                    'ip-bans-' . date('Y-m-d') . '.csv'
                );
            }

            $result = array_map('mapBanRow', $bans);
            jsonResponse([
                'items'   => $result,
                'total'   => $total,
                'page'    => $page,
                'pages'   => $pages,
                'perPage' => $perPage,
            ]);
        }
        break;

    case 'POST':
        if ($action === 'bulk-unban' || $action === 'bulk-whitelist' || $action === 'bulk-unwhitelist') {
            $input = jsonInput();
            $ids = $input['ids'] ?? null;
            if (!is_array($ids) || empty($ids)) {
                jsonError('ids (array) is required', 400);
            }
            $ids = array_values(array_filter(array_map('strval', $ids)));
            if (empty($ids)) {
                jsonError('ids (array) is required', 400);
            }

            $adminEmail = $_SESSION['admin_email'] ?? 'unknown';
            $in = implode(',', array_fill(0, count($ids), '?'));
            $done = 0;

            if ($action === 'bulk-unban') {
                foreach ($ids as $banId) {
                    if (unbanIpBan($banId, $adminEmail)) $done++;
                }
            } elseif ($action === 'bulk-whitelist') {
                // Whitelisting also re-activates the row so it protects the IP.
                $stmt = $pdo->prepare("UPDATE ip_bans SET whitelisted = 1, active = 1, unbanned_at = NULL, unbanned_by = NULL WHERE id IN ({$in})");
                $stmt->execute($ids);
                $done = $stmt->rowCount();
            } else {
                $stmt = $pdo->prepare("UPDATE ip_bans SET whitelisted = 0 WHERE id IN ({$in})");
                $stmt->execute($ids);
                $done = $stmt->rowCount();
            }

            logActivity('ip_ban_bulk', "Bulk action '{$action}' applied to {$done} IP ban(s).", 'security');
            jsonResponse(['success' => true, 'affected' => $done]);
        }

        // Create a new IP ban
        $input = jsonInput();
        $ipAddress = trim($input['ipAddress'] ?? '');
        $reason = trim($input['reason'] ?? 'Manual ban by admin');
        $email = trim($input['email'] ?? '');

        if (empty($ipAddress)) {
            jsonError('IP address is required', 400);
        }
        if (!filter_var($ipAddress, FILTER_VALIDATE_IP)) {
            jsonError('Invalid IP address format', 400);
        }
        if (isIpWhitelisted($ipAddress)) {
            jsonError('This IP is whitelisted — remove it from the whitelist before banning.', 409);
        }

        $ban = recordIpBan($ipAddress, $reason, $email, 0, 'admin-manual');

        if ($ban) {
            try {
                notifyIpBan($ipAddress, $ban['cidr'], $reason);
            } catch (Throwable $e) { /* non-fatal */ }
            jsonResponse([
                'success' => true,
                'ban'     => mapBanRow($ban),
            ], 201);
        } else {
            jsonError('Failed to create IP ban', 500);
        }
        break;

    case 'PUT':
        // Toggle whitelist for a single ban row — only flips the whitelisted
        // flag; the ban's active state is left untouched (un-whitelisting lets
        // an existing ban resume, consistent with the bulk action).
        $id = $_GET['id'] ?? '';
        if (empty($id)) {
            jsonError('Ban ID is required', 400);
        }
        $input = jsonInput();
        $whitelisted = !empty($input['whitelisted']);
        $stmt = $pdo->prepare("UPDATE ip_bans SET whitelisted = ? WHERE id = ?");
        $stmt->execute([$whitelisted ? 1 : 0, $id]);
        jsonResponse(['success' => true, 'affected' => $stmt->rowCount()]);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? '';
        if (empty($id)) {
            jsonError('Ban ID is required', 400);
        }

        $adminEmail = $_SESSION['admin_email'] ?? 'unknown';

        if (unbanIpBan($id, $adminEmail)) {
            // Notify admins about unban (branded template) — gated by the
            // "IP Banned / Unbanned" notification toggle.
            if (notifyEventEnabled('ip_ban')) {
                $notifyEmails = notifyRecipients('security_notify_emails');
                if ($notifyEmails) {
                    try {
                        $rendered = renderEmailTemplate('ip_unbanned', [
                            'ban_ip'   => $id,
                            'unban_by' => $adminEmail,
                        ]);
                        foreach ($notifyEmails as $notifyEmail) {
                            queueMailHtml($notifyEmail, $rendered['subject'], $rendered['text'], $rendered['html']);
                        }
                    } catch (Throwable $e) { /* non-fatal */ }
                }
            }
            jsonResponse(['success' => true]);
        } else {
            jsonError('Failed to remove IP ban', 500);
        }
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
