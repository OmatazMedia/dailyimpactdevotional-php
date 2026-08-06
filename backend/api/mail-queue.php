<?php
/**
 * Daily Impact Devotional - Mail Queue API
 *
 * GET  /api/mail-queue                - List recent queued emails
 * POST /api/mail-queue?action=send    - Try to send pending emails now (primary transport + fallback)
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = httpMethod();
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT * FROM mail_queue ORDER BY created_at DESC LIMIT 100");
        $queue = $stmt->fetchAll();

        $result = [];
        foreach ($queue as $q) {
            $result[] = [
                'id'        => (string)$q['id'],
                'to'        => $q['to_email'],
                'subject'   => $q['subject'],
                'hasHtml'   => !empty($q['html']),
                'body'      => mb_substr((string)$q['body'], 0, 500) . (mb_strlen((string)$q['body']) > 500 ? '...' : ''),
                'sent'      => (bool)$q['sent'],
                'sentAt'    => $q['sent_at'],
                'error'     => $q['error'],
                'createdAt' => $q['created_at'],
            ];
        }

        jsonResponse($result);
        break;

    case 'POST':
        requireSection('settings');
        if ($action === 'send') {
            $stmt = $pdo->query("SELECT * FROM mail_queue WHERE sent = 0 ORDER BY created_at ASC LIMIT 20");
            $pending = $stmt->fetchAll();

            if (empty($pending)) {
                jsonResponse(['success' => true, 'sent' => 0, 'failed' => 0, 'total' => 0, 'message' => 'No pending emails']);
            }

            $sent = 0;
            $failed = 0;
            $lastError = '';

            foreach ($pending as $mail) {
                $result = mailTransportSend($mail);
                if ($result['success']) {
                    $upd = $pdo->prepare("UPDATE mail_queue SET sent = 1, sent_at = NOW(), error = NULL WHERE id = ?");
                    $upd->execute([$mail['id']]);
                    $sent++;
                } else {
                    $upd = $pdo->prepare("UPDATE mail_queue SET error = ? WHERE id = ?");
                    $upd->execute([mb_substr($result['error'], 0, 500), $mail['id']]);
                    $failed++;
                    $lastError = $result['error'];
                }
            }

            jsonResponse([
                'success' => true,
                'sent'    => $sent,
                'failed'  => $failed,
                'total'   => count($pending),
                'method'  => getSetting('mail_method', 'resend'),
                'error'   => $failed > 0 ? $lastError : '',
            ]);
        } else {
            jsonError('Invalid action. Use: send');
        }
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
