<?php
/**
 * Daily Impact Devotional - Donations API
 * 
 * GET  /api/donations - List all donations (admin only)
 * POST /api/donations - Record a donation (public)
 *
 * POST input is fully sanitized and validated server-side: amounts must be
 * positive numbers, currency/provider/status are whitelisted, email is checked
 * with filter_var, and name/phone/reference are stripped of HTML and trimmed.
 * When is_anonymous is truthy, the personal fields (name/email/phone) are
 * cleared so anonymous donors' details are never stored.
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

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        requireAdmin();
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

        $status = strtolower(trim((string)($input['status'] ?? 'success')));
        if (!in_array($status, ['success', 'pending', 'failed'], true)) {
            $status = 'pending';
        }

        $reference = trim((string)($input['reference'] ?? ''));
        $reference = preg_replace('/[^A-Za-z0-9\-_]/', '', $reference);
        $reference = donationTruncate($reference, 64);

        $isAnonymous = !empty($input['is_anonymous']) ? 1 : 0;
        if ($isAnonymous) {
            // Anonymous donors: never store personal details.
            $name = '';
            $email = '';
            $phone = '';
        }

        $donationId = generateId();

        $stmt = $pdo->prepare(
            "INSERT INTO donations (id, reference, amount, currency, email, name, phone, provider, status, is_anonymous)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
            $status,
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
            'status'      => $status,
            'date'        => date('c'),
        ], 201);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
