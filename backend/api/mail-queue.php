<?php
/**
 * Daily Impact Devotional - Mail Queue API
 * 
 * GET  /api/mail-queue - List queued emails
 * POST /api/mail-queue?action=send - Attempt to send pending emails via SMTP
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        // GET /api/mail-queue - List recent mail queue entries
        $stmt = $pdo->query("SELECT * FROM mail_queue ORDER BY created_at DESC LIMIT 100");
        $queue = $stmt->fetchAll();

        $result = [];
        foreach ($queue as $q) {
            $result[] = [
                'id'        => (string)$q['id'],
                'to'        => $q['to_email'],
                'subject'   => $q['subject'],
                'body'      => mb_substr($q['body'], 0, 500) . (mb_strlen($q['body']) > 500 ? '...' : ''),
                'sent'      => (bool)$q['sent'],
                'sentAt'    => $q['sent_at'],
                'error'     => $q['error'],
                'createdAt' => $q['created_at'],
            ];
        }

        jsonResponse($result);
        break;

    case 'POST':
        requireAdmin();
        if ($action === 'send') {
            // POST /api/mail-queue?action=send - Try to send pending emails
            $settings = getSettings();
            $smtpHost = $settings['smtp_host'] ?? '';
            $smtpUser = $settings['smtp_user'] ?? '';
            $smtpPass = $settings['smtp_pass'] ?? '';
            $smtpPort = (int)($settings['smtp_port'] ?? 587);

            if (empty($smtpHost) || empty($smtpUser) || empty($smtpPass)) {
                jsonError('SMTP not configured. Please set up SMTP in Settings first.');
            }

            // Get pending emails
            $stmt = $pdo->query("SELECT * FROM mail_queue WHERE sent = 0 ORDER BY created_at ASC LIMIT 20");
            $pending = $stmt->fetchAll();

            if (empty($pending)) {
                jsonResponse(['success' => true, 'sent' => 0, 'message' => 'No pending emails']);
            }

            $sent = 0;
            $failed = 0;

            foreach ($pending as $mail) {
                try {
                    $result = sendMailPhp($mail['to_email'], $mail['subject'], $mail['body'], $smtpHost, $smtpUser, $smtpPass, $smtpPort);

                    if ($result) {
                        $upd = $pdo->prepare("UPDATE mail_queue SET sent = 1, sent_at = NOW() WHERE id = ?");
                        $upd->execute([$mail['id']]);
                        $sent++;
                    } else {
                        $upd = $pdo->prepare("UPDATE mail_queue SET error = 'PHP mail() returned false' WHERE id = ?");
                        $upd->execute([$mail['id']]);
                        $failed++;
                    }
                } catch (Exception $e) {
                    $upd = $pdo->prepare("UPDATE mail_queue SET error = ? WHERE id = ?");
                    $upd->execute([$e->getMessage(), $mail['id']]);
                    $failed++;
                }
            }

            jsonResponse([
                'success' => true,
                'sent'    => $sent,
                'failed'  => $failed,
                'total'   => count($pending),
            ]);

        } else {
            jsonError('Invalid action. Use: send');
        }
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}

/**
 * Send email using PHP's mail() function
 */
function sendMailPhp(string $to, string $subject, string $body, string $smtpHost, string $smtpUser, string $smtpPass, int $smtpPort): bool {
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "From: \"Daily Impact Devotional\" <{$smtpUser}>\r\n";
    $headers .= "Reply-To: {$smtpUser}\r\n";

    // If SMTP is configured, use it (requires PHP's native SMTP support)
    if ($smtpHost && $smtpHost !== 'localhost') {
        ini_set('SMTP', $smtpHost);
        ini_set('smtp_port', $smtpPort);
        if ($smtpUser) {
            ini_set('username', $smtpUser);
            ini_set('password', $smtpPass);
        }
    }

    return mail($to, $subject, $body, $headers);
}
