<?php
/**
 * Daily Impact Devotional - Login Audit Log API
 * 
 * GET  /api/login-log - Get login log (last 200 entries)
 * POST /api/login-log - Record a login event
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT * FROM login_logs ORDER BY logged_at DESC LIMIT 200");
        $logs = $stmt->fetchAll();

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

        jsonResponse($result);
        break;

    case 'POST':
        $input = jsonInput();
        $email     = $input['email'] ?? '';
        $success   = $input['success'] ?? true;
        $userAgent = $input['userAgent'] ?? '';

        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        // Take first IP if multiple in X-Forwarded-For
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
                        $parts = array_filter([$geo['city'], $geo['regionName'] ?? '', $geo['country'] ?? '']);
                        $location = implode(', ', $parts);
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

        // Send email notification on successful login if notify_email is configured
        if ($success) {
            $notifyEmail = getSetting('notify_email', '');
            if ($notifyEmail) {
                $browser = 'Unknown';
                if (preg_match('/(Chrome|Firefox|Safari|Edge|Opera)[\/\s]([\d.]+)/', $userAgent, $bm)) {
                    $browser = $bm[0];
                }
                $subject = "🔐 New Admin Login — Daily Impact Devotional";
                $body = "A new login was recorded on your publisher portal.\n\n"
                      . "Email: {$email}\n"
                      . "Time: " . date('Y-m-d H:i:s') . " (WAT)\n"
                      . "IP Address: {$ip}\n"
                      . "Location: {$location}\n"
                      . "Device/Browser: {$browser}\n\n"
                      . "If this was not you, change your password immediately.";

                // Queue the email
                queueMail($notifyEmail, $subject, $body);
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

/**
 * Queue an email for later sending
 */
function queueMail(string $to, string $subject, string $body): void {
    global $pdo;
    try {
        $mailId = generateId();
        $stmt = $pdo->prepare(
            "INSERT INTO mail_queue (id, to_email, subject, body, sent) VALUES (?, ?, ?, ?, 0)"
        );
        $stmt->execute([$mailId, $to, $subject, $body]);
    } catch (Exception $e) {
        // Queue failed silently
    }
}
