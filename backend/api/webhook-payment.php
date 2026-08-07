<?php
/**
 * ══════════════════════════════════════════════════════════
 *   Omataz Media — Web Development & Design
 *   Website   : https://www.omatazmedia.com.ng
 *   Email     : hello@omatazmedia.com.ng
 *   Phone     : +234 9024599289, +234 7037373304
 *   WhatsApp  : https://wa.me/message/M3QUHNVONY6NK1
 *   Social    : @omatazmedia — Facebook · Instagram · X · YouTube
 *   GitHub    : https://github.com/omatazmedia
 *   Contact   : Johnson Toluwani
 * ══════════════════════════════════════════════════════════
 */

/**
 * Daily Impact Devotional - Payment Webhook API
 *
 * POST /api/webhook/payment - Receive payment notifications from Paystack/Flutterwave
 *
 * SECURITY (fail-closed):
 *   1. A valid provider signature is REQUIRED — if the provider's secret is
 *      configured but the signature is missing or wrong, the event is rejected.
 *      If the provider's secret is NOT configured, its webhooks are rejected too
 *      (an unverifiable event is never trusted).
 *   2. Only references that exist as PENDING donations started by this site
 *      (donations.php) are accepted. Unknown references are rejected — this
 *      blocks forged "successful donation" records and receipt-email spam.
 *   3. The amount/currency in the event must match the stored pending row.
 *   4. A per-IP flood guard throttles rogue clients (gateways retry safely).
 *
 * Signatures:
 *   - Paystack   : HMAC-SHA512 of the raw body with paystack_secret_key,
 *                  sent in the X-Paystack-Signature header.
 *   - Flutterwave: the Verif-Hash header must equal the configured
 *                  webhook_secret setting.
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    jsonError('Method not allowed', 405);
}

// ─── Flood guard (defense-in-depth; signature check is the primary control) ──
ensureWebhookGuard();
if (!webhookAllowed($_SERVER['REMOTE_ADDR'] ?? '')) {
    jsonError('Too many webhook requests from this address. Try again later.', 429);
}

$rawBody = file_get_contents('php://input') ?: '';
$input = json_decode($rawBody, true) ?: [];

$headers = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
$psSignature = $headers['x-paystack-signature'] ?? '';
$flwHash = $headers['verif-hash'] ?? '';

// ─── Determine provider from the event shape ────────────────────────────────
// Flutterwave v3 webhooks send event names like "charge.completed" (the word
// "flutterwave" never appears) plus a tx_ref; Paystack sends data.reference
// with events like "charge.success". Detect on the tx_ref marker, not the
// event-name string.
$provider = 'paystack';
$hasTxRef = isset($input['tx_ref']) || isset($input['data']['tx_ref']) || isset($input['payload']['tx_ref']);
if ($hasTxRef) {
    $provider = 'flutterwave';
}

// ─── Signature verification — FAIL CLOSED ───────────────────────────────────
$psSecret = (string)getSetting('paystack_secret_key', '');
$flwSecret = (string)getSetting('webhook_secret', '');

if ($provider === 'paystack') {
    // Paystack webhook must carry a valid HMAC-SHA512 of the exact raw body.
    $valid = false;
    if ($psSecret !== '' && $psSignature !== '') {
        $expected = hash_hmac('sha512', $rawBody, $psSecret);
        $valid = hash_equals($expected, $psSignature);
    }
    // Legacy installs that authenticate Paystack via webhook_secret instead.
    if (!$valid && $flwSecret !== '') {
        $incoming = $headers['x-webhook-secret'] ?? '';
        $valid = $incoming !== '' && hash_equals($flwSecret, $incoming);
    }
    if (!$valid) {
        error_log('webhook rejected: missing/invalid Paystack signature from ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
        jsonError('Invalid webhook signature', 401);
    }
} else {
    // Flutterwave Verif-Hash must EXACTLY match webhook_secret — and it must
    // be present at all. An absent header is an absent signature → reject.
    $valid = $flwSecret !== '' && $flwHash !== '' && hash_equals($flwSecret, $flwHash);
    if (!$valid) {
        error_log('webhook rejected: missing/invalid Flutterwave hash from ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
        jsonError('Invalid webhook signature', 401);
    }
}

$eventData = $input['data'] ?? $input['payload'] ?? $input;
if (!is_array($eventData) || empty($eventData)) {
    jsonError('Invalid webhook payload');
}

$reference = (string)($eventData['reference'] ?? $eventData['tx_ref'] ?? $input['tx_ref'] ?? '');
if ($reference === '') {
    jsonError('Missing transaction reference');
}

// Amount: Paystack sends kobo/cents (÷100), Flutterwave sends major units.
$amount = (float)($eventData['amount'] ?? $eventData['charged_amount'] ?? 0);
if ($provider === 'paystack' && $amount > 0) {
    $amount = $amount / 100;
}

$currency = strtoupper((string)($eventData['currency'] ?? ''));
$email    = (string)($eventData['customer']['email'] ?? $eventData['customer']['email_address'] ?? '');
$firstName= (string)($eventData['customer']['first_name'] ?? '');
$lastName = (string)($eventData['customer']['last_name'] ?? '');
$name     = trim($firstName . ' ' . $lastName);

$eventStatus = strtolower((string)($eventData['status'] ?? $eventData['event_status'] ?? ''));
$isSuccess = in_array($eventStatus, ['success', 'successful', 'completed'], true);
$status = $isSuccess ? 'success' : ($eventStatus === 'failed' || $eventStatus === 'cancelled' ? 'failed' : 'pending');

// ─── Only accept donations this site actually started ───────────────────────
$stmt = $pdo->prepare("SELECT * FROM donations WHERE reference = ? LIMIT 1");
$stmt->execute([$reference]);
$existing = $stmt->fetch();

if (!$existing) {
    // Unknown reference = forged or foreign event. Never insert on webhook —
    // every donation starts as a PENDING row from donations.php.
    error_log("webhook rejected: unknown reference {$reference} from " . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    jsonError('Unknown transaction reference', 404);
}

// Never downgrade a confirmed payment: a late 'pending' duplicate is ack'd
// without touching the stored row — checked FIRST so retries never 400.
$currentStatus = strtolower((string)($existing['status'] ?? ''));
if ($currentStatus === 'success' && $status !== 'success') {
    jsonResponse(['success' => true, 'updated' => false, 'status' => $currentStatus]);
}

// ─── Cross-check amount + currency against the stored pending row ───────────
$storedAmount = (float)($existing['amount'] ?? 0);
$storedCurrency = strtoupper((string)($existing['currency'] ?? ''));
// Tolerance: exact to 1 kobo, plus a 2% allowance for gateways that report a
// fee-inflated charged amount (Flutterwave's charged_amount includes fees).
$amountTolerance = max(0.01, $storedAmount * 0.02);
if ($amount > 0 && $storedAmount > 0 && abs($amount - $storedAmount) > $amountTolerance) {
    error_log("webhook rejected: amount mismatch for {$reference} (stored {$storedAmount}, event {$amount})");
    jsonError('Amount mismatch', 400);
}
if ($currency !== '' && $storedCurrency !== '' && $currency !== $storedCurrency) {
    error_log("webhook rejected: currency mismatch for {$reference} (stored {$storedCurrency}, event {$currency})");
    jsonError('Currency mismatch', 400);
}

// ─── Update the pending row ─────────────────────────────────────────────────
$upd = $pdo->prepare(
    "UPDATE donations
     SET status = ?, amount = ?, currency = ?,
         email = CASE WHEN ? = '' THEN email ELSE ? END,
         name  = CASE WHEN ? = '' THEN name  ELSE ? END,
         provider = ?
     WHERE id = ?"
);
$upd->execute([$status, $amount, $currency, $email, $email, $name, $name, $provider, $existing['id']]);

// Send notification if configured (donation event toggle + dedicated list)
if ($status === 'success') {
    if (notifyEventEnabled('donation')) {
        // Dedicated donation list first, then the security list, then legacy
        // notify_email as a last resort for older installs.
        $notifyEmails = notifyRecipients('donation_notify_emails', 'security_notify_emails');
        if (!$notifyEmails) $notifyEmails = notifyRecipients('notify_email');
        if ($notifyEmails) {
            $subject = "💰 New Donation Received — {$currency} " . number_format($amount, 2);
            $body = "A donation was received:\n\n"
                  . "Amount: {$currency} " . number_format($amount, 2) . "\n"
                  . "From: " . ($name ?: $email) . "\n"
                  . "Provider: " . ucfirst($provider) . "\n"
                  . "Reference: {$reference}\n"
                  . "Date: " . date('Y-m-d H:i:s') . "\n";
            try {
                foreach ($notifyEmails as $notifyEmail) {
                    queueMail($notifyEmail, $subject, $body);
                }
            } catch (Throwable $e) { /* non-fatal */ }
        }
    }
}

jsonResponse(['success' => true, 'updated' => true, 'status' => $status]);
