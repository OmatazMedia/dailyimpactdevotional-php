<?php
/**
 * Daily Impact Devotional - Login Audit Log API
 *
 * GET  /api/login-log             - Paginated audit log
 *      ?page=1&perPage=25&month=January&year=2026
 *      ?format=csv                - Download the filtered log as CSV
 * POST /api/login-log             - Record a login event (legacy path; admin.php records directly)
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = httpMethod();

ensureLoginLogTable();

switch ($method) {
    case 'GET':
        // The audit log exposes admin emails + IPs + user agents — only a
        // logged-in administrator may read it.
        requireSection('settings');

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(200, max(10, (int)($_GET['perPage'] ?? 25)));
        $month = trim((string)($_GET['month'] ?? ''));
        $year = trim((string)($_GET['year'] ?? ''));
        $format = trim((string)($_GET['format'] ?? ''));

        // Normalize month to a 1-12 number (accepts names and numbers).
        $monthNum = null;
        if ($month !== '') {
            $monthNum = is_numeric($month) ? (int)$month : 0;
            if ($monthNum === 0) {
                $names = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
                          'august', 'september', 'october', 'november', 'december'];
                $monthNum = array_search(strtolower($month), $names, true) !== false
                    ? array_search(strtolower($month), $names, true) + 1
                    : null;
            }
            if ($monthNum !== null && ($monthNum < 1 || $monthNum > 12)) $monthNum = null;
        }

        $where = [];
        $params = [];
        if ($monthNum !== null) {
            $where[] = 'MONTH(logged_at) = ?';
            $params[] = $monthNum;
        }
        if ($year !== '') {
            $where[] = 'YEAR(logged_at) = ?';
            $params[] = (int)$year;
        }
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        // Total for pagination
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM login_logs {$whereSql}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();
        $pages = max(1, (int)ceil($total / $perPage));
        $page = min($page, $pages);

        $stmt = $pdo->prepare(
            "SELECT * FROM login_logs {$whereSql}
             ORDER BY logged_at DESC
             LIMIT " . (int)$perPage . " OFFSET " . (int)(($page - 1) * $perPage)
        );
        $stmt->execute($params);
        $logs = $stmt->fetchAll();

        if ($format === 'csv') {
            $rows = [];
            foreach ($logs as $log) {
                $rows[] = [
                    $log['logged_at'],
                    $log['email'],
                    $log['ip_address'],
                    $log['location'] ?? '',
                    $log['user_agent'],
                    ((bool)$log['success']) ? 'success' : 'failed',
                ];
            }
            sendCsv(
                ['Timestamp', 'Email', 'IP Address', 'Location', 'Browser / Device', 'Status'],
                $rows,
                'admin-login-audit-' . date('Y-m-d') . '.csv'
            );
        }

        $result = [];
        foreach ($logs as $log) {
            $result[] = [
                'id'        => (string)$log['id'],
                'email'     => $log['email'],
                'timestamp' => $log['logged_at'],
                'ip'        => $log['ip_address'],
                'userAgent' => $log['user_agent'],
                'success'   => (bool)$log['success'],
                'location'  => $log['location'],
            ];
        }

        jsonResponse([
            'items'   => $result,
            'total'   => $total,
            'page'    => $page,
            'pages'   => $pages,
            'perPage' => $perPage,
        ]);
        break;

    case 'POST':
        $input = jsonInput();
        $email     = $input['email'] ?? '';
        $success   = $input['success'] ?? true;
        $userAgent = $input['userAgent'] ?? '';

        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        if (strpos($ip, ',') !== false) {
            $ip = trim(explode(',', $ip)[0]);
        }

        // Attempt geo-location
        $location = 'Unknown';
        if ($ip && $ip !== 'unknown' && $ip !== '::1' && !str_starts_with($ip, '127.') && !str_starts_with($ip, '192.168.')) {
            try {
                $geoUrl = "http://ip-api.com/json/{$ip}?fields=city,regionName,country";
                $geoRes = @file_get_contents($geoUrl, false, stream_context_create(['http' => ['timeout' => 3]]));
                if ($geoRes) {
                    $geo = json_decode($geoRes, true);
                    if ($geo && isset($geo['city'])) {
                        $location = implode(', ', array_filter([$geo['city'], $geo['regionName'] ?? '', $geo['country'] ?? '']));
                    }
                }
            } catch (Exception $e) {
                // Geo lookup failed silently
            }
        } else {
            $location = 'Localhost / Local network';
        }

        $logId = generateId();
        $stmt = $pdo->prepare(
            "INSERT INTO login_logs (id, email, ip_address, user_agent, location, success)
             VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$logId, $email, $ip, $userAgent, $location, $success ? 1 : 0]);

        // Branded security notifications (throttled on failures) — the primary
        // senders are the admin.php login flow; this covers external callers.
        // Gated by the per-event toggles set in Settings → Email.
        $notifyEmails = notifyEventEnabled($success ? 'login' : 'failed_login')
            ? notifyRecipients('security_notify_emails')
            : [];
        if ($notifyEmails) {
            try {
                if ($success) {
                    $secureToken = bin2hex(random_bytes(24));
                    setSetting('secureall_token_hash', hash('sha256', $secureToken));
                    setSetting('secureall_token_expires', (string)(time() + 86400));
                    $origin = siteAbsoluteUrl('');
                    $rendered = renderEmailTemplate('login_notification', [
                        'login_email'    => $email,
                        'login_ip'       => $ip,
                        'login_time'     => date('F j, Y g:i A'),
                        'login_location' => $location,
                        'login_browser'  => $userAgent,
                        'secureall_url'  => $origin . 'admin/login?secureall=' . $secureToken,
                        'reset_url'      => $origin . 'admin/login',
                    ]);
                } else {
                    // Throttle failed-attempt alerts (this endpoint is unauthenticated).
                    $h = substr(hash('sha256', strtolower((string)$email) . '|' . $ip), 0, 24);
                    if (!alertNotThrottled('failed_alert_log', $h, 1800)) {
                        jsonResponse([
                            'success' => true,
                            'entry'   => [
                                'id'        => $logId,
                                'email'     => $email,
                                'timestamp' => date('c'),
                                'ip'        => $ip,
                                'userAgent' => $userAgent,
                                'success'   => false,
                                'location'  => $location,
                            ],
                        ], 201);
                    }
                    $rendered = renderEmailTemplate('failed_login_alert', [
                        'login_email'        => $email,
                        'login_ip'           => $ip,
                        'login_time'         => date('F j, Y g:i A'),
                        'login_location'     => $location,
                        'login_browser'      => $userAgent,
                        'attempts_remaining' => '—',
                    ]);
                }
                foreach ($notifyEmails as $notifyEmail) {
                    queueMailHtml($notifyEmail, $rendered['subject'], $rendered['text'], $rendered['html']);
                }
            } catch (Throwable $e) {
                // Non-fatal
            }
        }

        jsonResponse([
            'success' => true,
            'entry'   => [
                'id'        => $logId,
                'email'     => $email,
                'timestamp' => date('c'),
                'ip'        => $ip,
                'userAgent' => $userAgent,
                'success'   => (bool)$success,
                'location'  => $location,
            ],
        ], 201);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
