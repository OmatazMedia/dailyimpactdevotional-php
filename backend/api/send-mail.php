<?php
/**
 * Daily Impact Devotional - Email Sending Service (cron worker)
 *
 * Processes queued emails (mail_queue) and delivers each one using the PRIMARY
 * transport (mail_method setting) with the secondary as automatic fallback.
 * Branded HTML bodies are sent when present. Each row records which transport
 * delivered it (method), how many attempts were made, and the latest error —
 * visible in the Mail Delivery Status panel (Settings → Email).
 *
 * Should be run via cron job every minute:
 *   php /home/USERNAME/public_html/backend/api/send-mail.php
 */

require_once __DIR__ . '/../config/db.php';

$stmt = $pdo->prepare(
    "SELECT * FROM mail_queue
     WHERE sent = 0
     ORDER BY created_at ASC
     LIMIT 20"
);
$stmt->execute();
$emails = $stmt->fetchAll();

$processed = 0;
$failed = 0;

foreach ($emails as $email) {
    $result = mailTransportSend($email);

    if ($result['success']) {
        $processed++;
    } else {
        $failed++;
    }

    if (function_exists('updateMailQueueResult')) {
        updateMailQueueResult($email['id'], $result);
    } elseif ($result['success']) {
        // Legacy fallback for hosts preserving an older config/db.php.
        $upd = $pdo->prepare("UPDATE mail_queue SET sent = 1, sent_at = NOW(), error = NULL WHERE id = ?");
        $upd->execute([$email['id']]);
    } else {
        $upd = $pdo->prepare("UPDATE mail_queue SET error = ? WHERE id = ?");
        $upd->execute([mb_substr($result['error'], 0, 500), $email['id']]);
    }
}

echo json_encode([
    'processed' => $processed,
    'failed'    => $failed,
    'method'    => getSetting('mail_method', 'resend'),
]);
