<?php
/**
 * Daily Impact Devotional - Payment Webhook API
 * 
 * POST /api/webhook/payment - Receive payment notifications from Paystack/Flutterwave
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    jsonError('Method not allowed', 405);
}

$rawBody = file_get_contents('php://input') ?: '';
$input = json_decode($rawBody, true) ?: [];

$headers = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
$psSignature = $headers['x-paystack-signature'] ?? '';
$flwSignature = $headers['verif-hash'] ?? '';
$webhookSecret = getSetting('webhook_secret', '');

if ($webhookSecret !== '') {
    $incomingSecret = $headers['x-webhook-secret'] ?? '';
    if ($incomingSecret !== '' && !hash_equals($webhookSecret, $incomingSecret)) {
        jsonError('Invalid webhook signature', 401);
    }
}

$eventData = $input['data'] ?? $input['payload'] ?? $input;
if (!is_array($eventData) || empty($eventData)) {
    jsonError('Invalid webhook payload');
}

$provider = 'paystack';
if (isset($input['event']) && str_contains(strtolower((string)$input['event']), 'flutterwave')) {
    $provider = 'flutterwave';
}
if (isset($eventData['currency']) && strtoupper((string)$eventData['currency']) !== 'NGN') {
    $provider = $provider ?: 'flutterwave';
}

$amount = (float)($eventData['amount'] ?? $eventData['charged_amount'] ?? 0);
if ($amount > 1000 && $provider === 'paystack') {
    $amount = $amount / 100;
}

$record = [
    'id'        => generateId(),
    'reference' => (string)($eventData['reference'] ?? $eventData['tx_ref'] ?? $eventData['id'] ?? ''),
    'amount'    => $amount,
    'currency'  => (string)($eventData['currency'] ?? 'NGN'),
    'email'     => (string)($eventData['customer']['email'] ?? $eventData['customer']['email_address'] ?? ''),
    'name'      => trim((string)($eventData['customer']['first_name'] ?? '') . ' ' . (string)($eventData['customer']['last_name'] ?? '')),
    'provider'  => $provider,
    'status'    => in_array(strtolower((string)($eventData['status'] ?? $eventData['event_status'] ?? '')), ['success', 'successful', 'completed'], true) ? 'success' : 'pending',
];

// Check for duplicates
$stmt = $pdo->prepare("SELECT COUNT(*) FROM donations WHERE reference = ?");
$stmt->execute([$record['reference']]);
if ($stmt->fetchColumn() > 0) {
    // Duplicate, still return success
    jsonResponse(['success' => true, 'duplicate' => true]);
}

// Save donation
$stmt = $pdo->prepare(
    "INSERT INTO donations (id, reference, amount, currency, email, name, provider, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
$stmt->execute([
    $record['id'],
    $record['reference'],
    $record['amount'],
    $record['currency'],
    $record['email'],
    $record['name'],
    $record['provider'],
    $record['status'],
]);

// Send notification if configured
$notifyEmail = getSetting('notify_email', '');
if ($notifyEmail && $record['status'] === 'success') {
    $subject = "💰 New Donation Received — {$record['currency']} " . number_format($record['amount'], 2);
    $body = "A donation was received:\n\n"
          . "Amount: {$record['currency']} " . number_format($record['amount'], 2) . "\n"
          . "From: " . ($record['name'] ?: $record['email']) . "\n"
          . "Provider: Paystack\n"
          . "Reference: {$record['reference']}\n"
          . "Date: " . date('Y-m-d H:i:s') . "\n";

    // Queue email
    $mailId = generateId();
    $stmt = $pdo->prepare("INSERT INTO mail_queue (id, to_email, subject, body, sent) VALUES (?, ?, ?, ?, 0)");
    $stmt->execute([$mailId, $notifyEmail, $subject, $body]);
}

jsonResponse(['success' => true]);
