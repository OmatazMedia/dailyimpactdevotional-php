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
        // Panel lives under Settings → Email — same access level as the UI.
        requireSection('settings');
        // Pending (unsent) rows are the oldest — surface them FIRST so stuck
        // emails and failures never fall outside the 100-row window.
        $stmt = $pdo->query("SELECT * FROM mail_queue ORDER BY sent ASC, created_at DESC LIMIT 100");
        $queue = $stmt->fetchAll();

        $result = [];
        foreach ($queue as $q) {
            $result[] = [
                'id'            => (string)$q['id'],
                'to'            => $q['to_email'],
                'subject'       => $q['subject'],
                'hasHtml'       => !empty($q['html']),
                'body'          => mb_substr((string)$q['body'], 0, 500) . (mb_strlen((string)$q['body']) > 500 ? '...' : ''),
                'sent'          => (bool)$q['sent'],
                'sentAt'        => $q['sent_at'],
                // Transport that delivered it (resend|smtp), or the last one
                // tried when it failed. Null on legacy rows / never attempted.
                'method'        => $q['method'] ?? null,
                'attempts'      => (int)($q['attempts'] ?? 0),
                'lastAttemptAt' => $q['last_attempt_at'] ?? null,
                'error'         => $q['error'],
                'createdAt'     => $q['created_at'],
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
                    $sent++;
                } else {
                    $failed++;
                    $lastError = $result['error'];
                }
                if (function_exists('updateMailQueueResult')) {
                    updateMailQueueResult($mail['id'], $result);
                } elseif ($result['success']) {
                    // Legacy fallback for hosts preserving an older config/db.php.
                    $upd = $pdo->prepare("UPDATE mail_queue SET sent = 1, sent_at = NOW(), error = NULL WHERE id = ?");
                    $upd->execute([$mail['id']]);
                } else {
                    $upd = $pdo->prepare("UPDATE mail_queue SET error = ? WHERE id = ?");
                    $upd->execute([mb_substr($result['error'], 0, 500), $mail['id']]);
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
