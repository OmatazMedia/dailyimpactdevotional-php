<?php
/**
 * Daily Impact Devotional - Donations API
 *
 * GET  /api/donations                    - List all donations (admin only)
 * GET  /api/donations?action=verify&reference=X&provider=Y
 *                                        - Verify a gateway payment and update status
 * POST /api/donations                    - Create a donation
 *
 * POST behavior depends on provider:
 *   - paystack / flutterwave  → a PENDING row is created with a server-side
 *     reference, the gateway's initialize endpoint is called with the stored
 *     secret key, and { authorization_url, reference } is returned so the
 *     frontend can redirect the donor to the hosted checkout page. The row is
 *     only marked success after the gateway verifies (webhook or redirect).
 *   - bank / manual           → recorded as success immediately.
 *
 * The status/reference sent by the client are NEVER trusted for online
 * providers — both are generated server-side.
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

/**
 * UTF-8-safe truncation that works even when the mbstring extension is
 * disabled (some shared hosts). Uses mb_substr when available, otherwise cuts
 * at a byte boundary so a multi-byte character is never split in half.
 */
function donationTruncate(string $value, int $max): string {
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max, 'UTF-8');
    }
    if (strlen($value) <= $max) {
        return $value;
    }
    $cut = substr($value, 0, $max);
    // Drop a trailing partial multi-byte sequence if one was cut mid-way.
    while ($cut !== '' && (ord($cut[strlen($cut) - 1]) & 0xC0) === 0x80) {
        $cut = substr($cut, 0, -1);
    }
    return $cut;
}

// ─── Gateway HTTP helpers (cURL, mirrors the Telegram API style) ────────────
function gatewayRequest(string $method, string $url, array $payload, string $bearer): array {
    try {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $bearer,
            ],
        ];
        if ($method === 'POST') {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_SLASHES);
        } else {
            $opts[CURLOPT_HTTPGET] = true;
        }
        curl_setopt_array($ch, $opts);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($res === false) {
            return ['success' => false, 'error' => $err !== '' ? $err : 'Gateway connection failed'];
        }
        $json = json_decode($res, true);
        return ['success' => true, 'http' => $httpCode, 'json' => is_array($json) ? $json : []];
    } catch (Throwable $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/** Paystack: POST /transaction/initialize → { authorization_url, reference }. */
function paystackInitialize(float $amount, string $currency, string $email, string $reference, string $callbackUrl): array {
    $secret = (string)getSetting('paystack_secret_key', '');
    if ($secret === '') {
        return ['success' => false, 'error' => 'Paystack secret key is not configured.'];
    }
    // Paystack expects the amount in the currency's minor unit (kobo/cents).
    $minor = (int)round($amount * 100);
    $r = gatewayRequest('POST', 'https://api.paystack.co/transaction/initialize', [
        'email'        => $email,
        'amount'       => $minor,
        'currency'     => $currency,
        'reference'    => $reference,
        'callback_url' => $callbackUrl,
    ], $secret);
    if (!$r['success']) {
        return $r;
    }
    $data = $r['json']['data'] ?? [];
    if (empty($r['json']['status']) || empty($data['authorization_url'])) {
        $msg = $r['json']['message'] ?? ('Paystack error (HTTP ' . ($r['http'] ?? '?') . ')');
        return ['success' => false, 'error' => is_string($msg) ? $msg : 'Paystack initialize failed'];
    }
    return ['success' => true, 'authorization_url' => $data['authorization_url'], 'reference' => $data['reference'] ?? $reference];
}

/** Paystack: GET /transaction/verify/{reference} → success flag + raw data. */
function paystackVerify(string $reference): array {
    $secret = (string)getSetting('paystack_secret_key', '');
    if ($secret === '') {
        return ['success' => false, 'error' => 'Paystack secret key is not configured.'];
    }
    $r = gatewayRequest('GET', 'https://api.paystack.co/transaction/verify/' . rawurlencode($reference), [], $secret);
    if (!$r['success']) {
        return $r;
    }
    $data = $r['json']['data'] ?? [];
    $status = strtolower((string)($data['status'] ?? ''));
    if ($status === 'success') {
        return ['success' => true, 'paid' => true, 'data' => $data];
    }
    return ['success' => true, 'paid' => false, 'status' => $status, 'data' => $data];
}

/** Flutterwave v3: POST /payments → { link, tx_ref }. */
function flutterwaveInitialize(float $amount, string $currency, string $email, string $name, string $phone, string $txRef, string $redirectUrl): array {
    $secret = (string)getSetting('flutterwave_secret_key', '');
    if ($secret === '') {
        return ['success' => false, 'error' => 'Flutterwave secret key is not configured.'];
    }
    // Flutterwave v3 takes the amount in major units (as the donor entered it).
    $r = gatewayRequest('POST', 'https://api.flutterwave.com/v3/payments', [
        'tx_ref'       => $txRef,
        'amount'       => $amount,
        'currency'     => $currency,
        'redirect_url' => $redirectUrl,
        'customer'     => [
            'email'        => $email,
            'name'         => $name !== '' ? $name : 'Friend of the Ministry',
            'phonenumber'  => $phone,
        ],
        'customizations' => [
            'title'       => 'Daily Impact Devotional',
            'description' => 'Donation to Daily Impact Devotional Ministries',
        ],
    ], $secret);
    if (!$r['success']) {
        return $r;
    }
    $data = $r['json']['data'] ?? [];
    if (empty($data['link'])) {
        $msg = $r['json']['message'] ?? ('Flutterwave error (HTTP ' . ($r['http'] ?? '?') . ')');
        return ['success' => false, 'error' => is_string($msg) ? $msg : 'Flutterwave initialize failed'];
    }
    return ['success' => true, 'authorization_url' => $data['link'], 'reference' => $data['tx_ref'] ?? $txRef];
}

/** Flutterwave: GET /transactions/verify_by_reference?tx_ref=X → paid flag. */
function flutterwaveVerify(string $txRef): array {
    $secret = (string)getSetting('flutterwave_secret_key', '');
    if ($secret === '') {
        return ['success' => false, 'error' => 'Flutterwave secret key is not configured.'];
    }
    $r = gatewayRequest('GET', 'https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' . rawurlencode($txRef), [], $secret);
    if (!$r['success']) {
        return $r;
    }
    $data = $r['json']['data'] ?? [];
    $status = strtolower((string)($data['status'] ?? ''));
    if ($status === 'successful' || $status === 'success') {
        return ['success' => true, 'paid' => true, 'data' => $data];
    }
    return ['success' => true, 'paid' => false, 'status' => $status, 'data' => $data];
}

/** Build a safe callback URL (same-origin redirect back to the SPA). */
function donationCallbackUrl(string $origin, string $reference): string {
    // Strip anything but the scheme+host so the gateway redirects to the SPA
    // root with our ?donation= marker (never to an arbitrary client path).
    if (preg_match('#^https?://[^/]+#i', $origin, $m)) {
        $base = rtrim($m[0], '/');
    } else {
        // Fall back to the current request host when no Origin header is sent.
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $base = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }
    return $base . '/?donation=' . rawurlencode($reference);
}

// ─── Routes ─────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'verify') {
            // GET /api/donations?action=verify&reference=X&provider=Y
            // Called by the frontend after the donor returns from the gateway
            // (redirect callback). Idempotent — safe to call repeatedly.
            $reference = trim((string)($_GET['reference'] ?? ''));
            if ($reference === '') {
                jsonError('Missing reference', 400);
            }

            $stmt = $pdo->prepare("SELECT * FROM donations WHERE reference = ? ORDER BY donated_at DESC LIMIT 1");
            $stmt->execute([$reference]);
            $row = $stmt->fetch();

            // Unknown reference — the payment may belong to another install.
            if (!$row) {
                jsonError('Donation not found for this reference', 404);
            }

            // Provider comes from the stored row (gateway return URLs only
            // carry the reference); an explicit ?provider= overrides it.
            $provider = strtolower(trim((string)($_GET['provider'] ?? $row['provider'] ?? '')));
            if (!in_array($provider, ['paystack', 'flutterwave'], true)) {
                jsonError('Missing or invalid provider', 400);
            }

            $verify = $provider === 'paystack'
                ? paystackVerify($reference)
                : flutterwaveVerify($reference);

            if (!$verify['success']) {
                jsonError('Verification failed: ' . ($verify['error'] ?? 'unknown error'), 502);
            }

            $paid = !empty($verify['paid']);
            $gwStatus = $verify['status'] ?? ($paid ? 'success' : 'pending');
            $newStatus = $paid ? 'success' : (strtolower((string)$gwStatus) === 'failed' || strtolower((string)$gwStatus) === 'cancelled' ? 'failed' : 'pending');

            // Fill in the gateway-confirmed donor details (only when paid and
            // the donor did NOT donate anonymously).
            $gwName  = '';
            $gwEmail = '';
            $gwPhone = '';
            if ($paid && (int)($row['is_anonymous'] ?? 0) === 0) {
                $d = $verify['data'] ?? [];
                $cust = $d['customer'] ?? [];
                $gwEmail = donationTruncate(trim(strtolower((string)($cust['email'] ?? ''))), 255);
                $gwName  = donationTruncate(trim((string)($cust['first_name'] ?? '') . ' ' . (string)($cust['last_name'] ?? '')), 120);
                $gwPhone = donationTruncate(preg_replace('/[^0-9+()\-\s]/', '', (string)($cust['phonenumber'] ?? '')), 40);
            }

            $upd = $pdo->prepare(
                "UPDATE donations SET status = ?, name = ?, email = ?, phone = ? WHERE id = ?"
            );
            $upd->execute([$newStatus, $gwName !== '' ? $gwName : $row['name'], $gwEmail !== '' ? $gwEmail : $row['email'], $gwPhone !== '' ? $gwPhone : ($row['phone'] ?? ''), $row['id']]);

            if ($paid) {
                // Real-time activity feed + admin email notification.
                try {
                    logActivity('donation', "Donation received: {$row['currency']} " . number_format((float)$row['amount'], 2) . " ({$provider}).", 'donation', $row['id']);
                } catch (Throwable $e) { /* non-fatal */ }
                $notifyEmail = getSetting('notify_email', '');
                if ($notifyEmail !== '') {
                    try {
                        $donor = ($gwName !== '' ? $gwName : ($row['name'] !== '' ? $row['name'] : ($row['email'] !== '' ? $row['email'] : 'Anonymous')));
                        $subject = "💰 New Donation Received — {$row['currency']} " . number_format((float)$row['amount'], 2);
                        $body = "A donation was received:\n\n"
                              . "Amount: {$row['currency']} " . number_format((float)$row['amount'], 2) . "\n"
                              . "From: {$donor}\n"
                              . "Provider: " . ucfirst($provider) . "\n"
                              . "Reference: {$reference}\n"
                              . "Date: " . date('Y-m-d H:i:s') . "\n";
                        $adminHtml = emailBrandHtml('New Donation Received',
                            '<h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.3;">💰 New Donation Received</h2>'
                            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 18px;">'
                            . '<tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Amount</td></tr>'
                            . '<tr><td style="padding:12px 16px;color:#0f766e;font-size:16px;font-weight:800;">' . htmlspecialchars($row['currency'], ENT_QUOTES, 'UTF-8') . ' ' . number_format((float)$row['amount'], 2) . '</td></tr>'
                            . '<tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">From</td></tr>'
                            . '<tr><td style="padding:12px 16px;color:#334155;font-size:14px;">' . htmlspecialchars($donor, ENT_QUOTES, 'UTF-8') . '</td></tr>'
                            . '<tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Reference</td></tr>'
                            . '<tr><td style="padding:12px 16px;color:#334155;font-size:13px;font-family:monospace;">' . htmlspecialchars($reference, ENT_QUOTES, 'UTF-8') . '</td></tr>'
                            . '</table>');
                        queueMailHtml($notifyEmail, $subject, $body, $adminHtml);
                    } catch (Throwable $e) { /* non-fatal */ }
                }

                // Donor receipt — sent to the donor ONLY when they did not
                // donate anonymously (and a valid email is on record). Uses the
                // donation-specific From identity when configured.
                $donorEmail = trim(strtolower((string)($gwEmail !== '' ? $gwEmail : ($row['email'] ?? ''))));
                $donorName  = trim((string)($gwName !== '' ? $gwName : ($row['name'] ?? '')));
                if ((int)($row['is_anonymous'] ?? 0) === 0 && $donorEmail !== '' && filter_var($donorEmail, FILTER_VALIDATE_EMAIL)) {
                    try {
                        $receipt = renderEmailTemplate('donor_receipt', [
                            'donor_name'         => $donorName !== '' ? $donorName : 'Friend of the ministry',
                            'donation_amount'    => number_format((float)$row['amount'], 2),
                            'donation_currency'  => $row['currency'],
                            'donation_reference' => $reference,
                            'donation_date'      => date('F j, Y g:i A'),
                        ]);
                        $identity = emailFromIdentity('donation');
                        queueMailHtml(
                            $donorEmail,
                            $receipt['subject'],
                            $receipt['text'],
                            $receipt['html'],
                            $identity['name'],
                            $identity['email']
                        );
                    } catch (Throwable $e) { /* non-fatal */ }
                }
            }

            jsonResponse([
                'success'      => $paid,
                'status'       => $newStatus,
                'reference'    => $reference,
                'provider'     => $provider,
                'amount'       => (float)$row['amount'],
                'currency'     => $row['currency'],
                'name'         => (string)($row['name'] ?? ''),
                'is_anonymous' => (int)($row['is_anonymous'] ?? 0),
            ]);
            break;
        }

        // GET /api/donations — admin list
        requireSection('payments');
        ensureDonationColumns();
        $stmt = $pdo->query("SELECT * FROM donations ORDER BY donated_at DESC");
        $donations = $stmt->fetchAll();

        $result = [];
        foreach ($donations as $d) {
            $result[] = [
                'id'          => (string)$d['id'],
                'reference'   => $d['reference'],
                'amount'      => (float)$d['amount'],
                'currency'    => $d['currency'],
                'email'       => $d['email'],
                'name'        => $d['name'],
                'phone'       => $d['phone'] ?? '',
                'is_anonymous'=> (int)($d['is_anonymous'] ?? 0),
                'provider'    => $d['provider'],
                'status'      => $d['status'],
                'date'        => $d['donated_at'],
            ];
        }

        jsonResponse($result);
        break;

    case 'POST':
        ensureDonationColumns();
        $input = jsonInput();

        // ── Validate & sanitize every field ──────────────────────────────────
        $amount = (float)($input['amount'] ?? 0);
        if ($amount <= 0 || $amount > 100000000) {
            jsonError('Invalid donation amount', 422);
        }

        $currency = strtoupper(trim((string)($input['currency'] ?? 'NGN')));
        $allowedCurrencies = ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR', 'CAD', 'AUD', 'ZMW', 'XOF'];
        if (!in_array($currency, $allowedCurrencies, true)) {
            jsonError('Unsupported currency', 422);
        }

        $name = trim(strip_tags((string)($input['name'] ?? '')));
        $name = donationTruncate($name, 120);

        $email = trim(strtolower((string)($input['email'] ?? '')));
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonError('Invalid email address', 422);
        }
        $email = donationTruncate($email, 255);

        $phone = preg_replace('/[^0-9+()\-\s]/', '', (string)($input['phone'] ?? ''));
        $phone = donationTruncate($phone, 40);

        $provider = strtolower(trim((string)($input['provider'] ?? 'manual')));
        if (!in_array($provider, ['paystack', 'flutterwave', 'bank', 'manual'], true)) {
            $provider = 'manual';
        }

        $isAnonymous = !empty($input['is_anonymous']) ? 1 : 0;
        if ($isAnonymous) {
            // Anonymous donors: never store personal details.
            $name = '';
            $email = '';
            $phone = '';
        }

        // ── Online providers: real gateway flow (status is NEVER trusted
        //    from the client — we create a pending row and initialize). ──
        if ($provider === 'paystack' || $provider === 'flutterwave') {
            $reference = 'DID-' . strtoupper(substr(bin2hex(random_bytes(10)), 0, 16)) . '-' . time();
            $donationId = generateId();

            $stmt = $pdo->prepare(
                "INSERT INTO donations (id, reference, amount, currency, email, name, phone, provider, status, is_anonymous)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
            );
            $stmt->execute([$donationId, $reference, $amount, $currency, $email, $name, $phone, $provider, $isAnonymous]);

            // Gateway email — anonymous donors still need a valid email to
            // open the hosted checkout, but it is never persisted.
            $gwEmail = $email !== '' ? $email : 'friend@dailyimpactdevotional.org';
            $origin  = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '')));
            $callback = donationCallbackUrl($origin, $reference);

            $init = $provider === 'paystack'
                ? paystackInitialize($amount, $currency, $gwEmail, $reference, $callback)
                : flutterwaveInitialize($amount, $currency, $gwEmail, $name, $phone, $reference, $callback);

            if (!$init['success']) {
                // Leave the pending row (a retry can reuse it) but tell the
                // donor what went wrong — never fabricate success.
                $msg = $init['error'] ?? 'Payment gateway initialization failed';
                jsonError($msg, 502);
            }

            jsonResponse([
                'id'               => $donationId,
                'reference'        => $init['reference'] ?? $reference,
                'authorization_url'=> $init['authorization_url'],
                'status'           => 'pending',
                'provider'         => $provider,
                'amount'           => $amount,
                'currency'         => $currency,
                'is_anonymous'     => $isAnonymous,
            ], 201);
            // jsonResponse() exits, but the explicit return keeps the bank/
            // manual insert below from ever running on the online path.
            return;
        }

        // ── Bank transfer / manual: recorded as received immediately. ──
        $donationId = generateId();
        $reference = trim((string)($input['reference'] ?? ''));
        $reference = preg_replace('/[^A-Za-z0-9\-_]/', '', $reference);
        $reference = donationTruncate($reference, 64);
        if ($reference === '') {
            $reference = 'MAN-' . strtoupper(substr(bin2hex(random_bytes(8)), 0, 12));
        }

        $stmt = $pdo->prepare(
            "INSERT INTO donations (id, reference, amount, currency, email, name, phone, provider, status, is_anonymous)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)"
        );
        $stmt->execute([
            $donationId,
            $reference,
            $amount,
            $currency,
            $email,
            $name,
            $phone,
            $provider,
            $isAnonymous,
        ]);

        jsonResponse([
            'id'          => $donationId,
            'reference'   => $reference,
            'amount'      => $amount,
            'currency'    => $currency,
            'email'       => $email,
            'name'        => $name,
            'phone'       => $phone,
            'is_anonymous'=> $isAnonymous,
            'provider'    => $provider,
            'status'      => 'success',
            'date'        => date('c'),
        ], 201);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
