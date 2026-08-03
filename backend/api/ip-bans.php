<?php
/**
 * Daily Impact Devotional - IP Ban Management API
 * 
 * GET    /api/ip-bans - List all IP bans
 * POST   /api/ip-bans - Create a new IP ban
 * DELETE /api/ip-bans?id=<id> - Unban an IP
 * PUT    /api/ip-bans?id=<id> - Update IP ban
 */

require_once __DIR__ . '/../config/db.php';
requireAdmin();
sendCorsHeaders();

$method = httpMethod();
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'check') {
            // Check if current IP is banned
            $ip = getClientIp();
            $ban = getBanForIp($ip);
            jsonResponse([
                'banned' => $ban !== null,
                'ban' => $ban
            ]);
        } else {
            // List all IP bans
            $stmt = $pdo->query(
                "SELECT * FROM ip_bans 
                 ORDER BY created_at DESC 
                 LIMIT 100"
            );
            $bans = $stmt->fetchAll();
            
            $result = [];
            foreach ($bans as $ban) {
                $result[] = [
                    'id' => $ban['id'],
                    'ipAddress' => $ban['ip_address'],
                    'ipVersion' => (int)$ban['ip_version'],
                    'cidr' => $ban['cidr'],
                    'banStart' => $ban['ban_start'],
                    'banEnd' => $ban['ban_end'],
                    'reason' => $ban['reason'],
                    'source' => $ban['source'],
                    'email' => $ban['email'],
                    'failedAttempts' => (int)$ban['failed_attempts'],
                    'active' => (bool)$ban['active'],
                    'unbannedAt' => $ban['unbanned_at'],
                    'unbannedBy' => $ban['unbanned_by'],
                    'createdAt' => $ban['created_at']
                ];
            }
            
            jsonResponse($result);
        }
        break;

    case 'POST':
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
        
        $ban = recordIpBan($ipAddress, $reason, $email, 0, 'admin-manual');
        
        if ($ban) {
            // Notify admins about new ban
            $notifyEmails = getSetting('security_notify_emails', '');
            if ($notifyEmails) {
                $emails = array_map('trim', explode(',', $notifyEmails));
                foreach ($emails as $notifyEmail) {
                    if (filter_var($notifyEmail, FILTER_VALIDATE_EMAIL)) {
                        $subject = "🚫 New IP Ban Created — Daily Impact Devotional";
                        $body = "A new IP ban has been created.\n\n"
                              . "IP Address: {$ipAddress}\n"
                              . "CIDR: {$ban['cidr']}\n"
                              . "Reason: {$reason}\n"
                              . "Email: {$email}\n"
                              . "Created by: Admin\n"
                              . "Time: " . date('Y-m-d H:i:s') . "\n\n"
                              . "This ban affects the entire IP subnet.";
                        queueMail($notifyEmail, $subject, $body);
                    }
                }
            }
            
            jsonResponse([
                'success' => true,
                'ban' => [
                    'id' => $ban['id'],
                    'ipAddress' => $ban['ip_address'],
                    'cidr' => $ban['cidr'],
                    'reason' => $ban['reason'],
                    'active' => (bool)$ban['active']
                ]
            ], 201);
        } else {
            jsonError('Failed to create IP ban', 500);
        }
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? '';
        if (empty($id)) {
            jsonError('Ban ID is required', 400);
        }
        
        // Get admin email for audit
        $adminEmail = $_SESSION['admin_email'] ?? 'unknown';
        
        if (unbanIpBan($id, $adminEmail)) {
            // Notify admins about unban
            $notifyEmails = getSetting('security_notify_emails', '');
            if ($notifyEmails) {
                $emails = array_map('trim', explode(',', $notifyEmails));
                foreach ($emails as $notifyEmail) {
                    if (filter_var($notifyEmail, FILTER_VALIDATE_EMAIL)) {
                        $subject = "✅ IP Ban Removed — Daily Impact Devotional";
                        $body = "An IP ban has been removed.\n\n"
                              . "Ban ID: {$id}\n"
                              . "Unbanned by: {$adminEmail}\n"
                              . "Time: " . date('Y-m-d H:i:s') . "\n\n"
                              . "This IP/subnet can now access the admin portal.";
                        queueMail($notifyEmail, $subject, $body);
                    }
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