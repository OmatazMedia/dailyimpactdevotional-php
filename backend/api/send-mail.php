<?php
/**
 * Daily Impact Devotional - Email Sending Service
 * 
 * This script processes queued emails and sends them using the configured method.
 * Should be run via cron job every minute.
 */

require_once __DIR__ . '/../config/db.php';

// Process pending emails
$stmt = $pdo->prepare(
    "SELECT * FROM mail_queue 
     WHERE sent = 0 
     ORDER BY created_at ASC 
     LIMIT 10"
);
$stmt->execute();
$emails = $stmt->fetchAll();

$mailMethod = getSetting('mail_method', 'resend');
$processed = 0;
$failed = 0;

foreach ($emails as $email) {
    try {
        $success = false;
        
        if ($mailMethod === 'resend') {
            $success = sendViaResend($email);
        } elseif ($mailMethod === 'smtp') {
            $success = sendViaSMTP($email);
        } else {
            // Try Resend first, fallback to SMTP
            $success = sendViaResend($email);
            if (!$success) {
                $success = sendViaSMTP($email);
            }
        }
        
        if ($success) {
            $update = $pdo->prepare(
                "UPDATE mail_queue SET sent = 1, sent_at = NOW() WHERE id = ?"
            );
            $update->execute([$email['id']]);
            $processed++;
        } else {
            $update = $pdo->prepare(
                "UPDATE mail_queue SET error = ? WHERE id = ?"
            );
            $update->execute(['Failed to send via ' . $mailMethod, $email['id']]);
            $failed++;
        }
    } catch (Exception $e) {
        $update = $pdo->prepare(
            "UPDATE mail_queue SET error = ? WHERE id = ?"
        );
        $update->execute([$e->getMessage(), $email['id']]);
        $failed++;
    }
}

echo json_encode([
    'processed' => $processed,
    'failed' => $failed,
    'method' => $mailMethod
]);

/**
 * Send email via Resend API
 */
function sendViaResend(array $email): bool {
    $apiKey = getSetting('resend_api_key', '');
    $fromEmail = getSetting('resend_from_email', '');
    $fromName = getSetting('resend_from_name', 'Daily Impact Devotional');
    $replyTo = getSetting('resend_reply_to', '');
    $enabled = getSetting('resend_enabled', 'true') === 'true';
    
    if (!$enabled || empty($apiKey) || empty($fromEmail)) {
        return false;
    }
    
    $from = $fromName ? "{$fromName} <{$fromEmail}>" : $fromEmail;
    
    $data = [
        'from' => $from,
        'to' => [$email['to_email']],
        'subject' => $email['subject'],
        'text' => $email['body']
    ];
    
    if ($replyTo) {
        $data['reply_to'] = $replyTo;
    }
    
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return $httpCode >= 200 && $httpCode < 300;
}

/**
 * Send email via SMTP
 */
function sendViaSMTP(array $email): bool {
    $host = getSetting('smtp_host', '');
    $user = getSetting('smtp_user', '');
    $pass = getSetting('smtp_pass', '');
    $port = getSetting('smtp_port', '587');
    $secure = getSetting('smtp_secure', 'tls');
    $enabled = getSetting('smtp_enabled', 'false') === 'true';
    
    if (!$enabled || empty($host) || empty($user) || empty($pass)) {
        return false;
    }
    
    $fromEmail = getSetting('resend_from_email', '');
    $fromName = getSetting('resend_from_name', 'Daily Impact Devotional');
    
    try {
        // Use PHPMailer if available, otherwise basic mail()
        if (class_exists('PHPMailer\PHPMailer\PHPMailer')) {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = $host;
            $mail->SMTPAuth = true;
            $mail->Username = $user;
            $mail->Password = $pass;
            $mail->SMTPSecure = $secure;
            $mail->Port = (int)$port;
            
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress($email['to_email']);
            $mail->Subject = $email['subject'];
            $mail->Body = $email['body'];
            
            return $mail->send();
        } else {
            // Fallback to basic mail() (not recommended for production)
            $headers = "From: {$fromName} <{$fromEmail}>\r\n";
            $headers .= "Reply-To: {$fromEmail}\r\n";
            $headers .= "X-Mailer: PHP/" . phpversion();
            
            return mail($email['to_email'], $email['subject'], $email['body'], $headers);
        }
    } catch (Exception $e) {
        error_log("SMTP Error: " . $e->getMessage());
        return false;
    }
}