<?php
/**
 * Daily Impact Devotional - Email Sending Service (cron worker)
 *
 * Processes queued emails (mail_queue) and delivers each one using the PRIMARY
 * transport (mail_method setting) with the secondary as automatic fallback.
 * Branded HTML bodies are sent when present.
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
        $update = $pdo->prepare("UPDATE mail_queue SET sent = 1, sent_at = NOW(), error = NULL WHERE id = ?");
        $update->execute([$email['id']]);
        $processed++;
    } else {
        $update = $pdo->prepare("UPDATE mail_queue SET error = ? WHERE id = ?");
        $update->execute([mb_substr($result['error'], 0, 500), $email['id']]);
        $failed++;
    }
}

echo json_encode([
    'processed' => $processed,
    'failed'    => $failed,
    'method'    => getSetting('mail_method', 'resend'),
]);
