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
 * Daily Impact Devotional - Two-Factor Authentication API
 *
 * GET  /api/2fa?action=status              - Current 2FA status (logged-in user)
 * POST /api/2fa?action=setup-totp          - Generate + persist a TOTP secret (not yet enabled)
 * POST /api/2fa?action=confirm-totp        - Verify an authenticator-app code, enable TOTP, mint backup codes
 * POST /api/2fa?action=send-email-otp      - Email a 6-digit OTP to the logged-in user (activation/deactivation)
 * POST /api/2fa?action=confirm-email       - Verify the emailed OTP, enable email 2FA, mint backup codes
 * POST /api/2fa?action=send-login-otp      - Email an OTP to the user in a pending 2FA login
 * POST /api/2fa?action=verify              - Complete login: verify app/email/backup code against the pending session
 * POST /api/2fa?action=deactivate          - Disable a method (requires the live code for that method)
 * POST /api/2fa?action=regenerate-backup   - Issue a fresh set of backup codes (replaces the old set)
 * POST /api/2fa?action=admin-reset         - Administrator: wipe 2FA for any user
 *
 * All OTP/TOTP verification happens server-side — a client can never mark its
 * own 2FA as activated, and any six digits are rejected unless they match the
 * secret the server issued.
 */

require_once __DIR__ . '/../config/db.php';

sendCorsHeaders();

$sessionValid = secureSession(3600);
$method       = $_SERVER['REQUEST_METHOD'];
$action       = $_GET['action'] ?? '';

/** Load the currently logged-in admin_users row (null when anonymous). */
function currentAdminRow(): ?array {
    global $pdo;
    if (empty($_SESSION['admin_id']) || !$pdo instanceof PDO) {
        return null;
    }
    $stmt = $pdo->prepare("SELECT * FROM admin_users WHERE id = ?");
    $stmt->execute([(int)$_SESSION['admin_id']]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Send a 6-digit OTP to an email and stash its SHA-256 hash + 10-min expiry in
 * the session so it can only be verified from this browser session.
 */
function sendEmailOtp(string $email): void {
    $code = (string)random_int(100000, 999999);
    $_SESSION['2fa_email_code_hash'] = hash('sha256', $code);
    $_SESSION['2fa_email_expires']   = time() + 600; // 10 minutes
    $_SESSION['2fa_email_attempts']  = 0;
    $subject = "🔐 Your Daily Impact Devotional Verification Code";
    $body = "Your Daily Impact Devotional verification code is:\n\n"
          . "    {$code}\n\n"
          . "Enter this code to complete your two-factor authentication step. "
          . "It expires in 10 minutes.\n\n"
          . "If you did not request this code, you can safely ignore this email.\n"
          . "— Daily Impact Devotional";
    queueMail($email, $subject, $body);
}

/** Verify a submitted OTP against the session-stored one (expiry + hash). */
function codeMatchesSessionOtp(string $code): bool {
    $hash    = (string)($_SESSION['2fa_email_code_hash'] ?? '');
    $expires = (int)($_SESSION['2fa_email_expires'] ?? 0);
    if ($hash === '' || $expires < time()) {
        return false;
    }
    return hash_equals($hash, hash('sha256', trim($code)));
}

/** Consume one OTP attempt budget; returns false once attempts run out. */
function emailOtpAttemptsLeft(): int {
    $attempts = (int)($_SESSION['2fa_email_attempts'] ?? 0) + 1;
    $_SESSION['2fa_email_attempts'] = $attempts;
    return max(0, 5 - $attempts);
}

/** Persist a fresh backup-code set (hashed) for a user id. */
function saveBackupCodesForUser(int $userId, array $plainCodes): void {
    global $pdo;
    $hashes = array_map('hashBackupCode', $plainCodes);
    $stmt = $pdo->prepare("UPDATE admin_users SET backup_codes = ? WHERE id = ?");
    $stmt->execute([json_encode(array_values($hashes)), $userId]);
}

if ($method === 'GET' && $action === 'status') {
    if (!$sessionValid) {
        jsonError('Unauthorized. Please log in first.', 401);
    }
    ensureTwoFaColumns();
    $admin = currentAdminRow();
    if (!$admin) {
        jsonError('Unauthorized. Please log in first.', 401);
    }
    jsonResponse(['success' => true, 'twofa' => twofaStatusForUser($admin)]);
}

if ($method === 'POST') {
    $input = jsonInput();

    if ($action === 'setup-totp') {
        // Generate + persist a fresh secret. 2FA stays DISABLED until the app
        // code is confirmed, so closing the dialog safely discards the secret.
        if (!$sessionValid) jsonError('Unauthorized. Please log in first.', 401);
        ensureTwoFaColumns();
        $admin = currentAdminRow();
        if (!$admin) jsonError('Unauthorized. Please log in first.', 401);

        $secret  = generateTotpSecret();
        $stmt = $pdo->prepare("UPDATE admin_users SET totp_secret = ? WHERE id = ?");
        $stmt->execute([encryptSecret($secret), (int)$admin['id']]);

        $issuer  = 'Daily Impact Devotional';
        $account = (string)($admin['name'] !== '' ? $admin['name'] : $admin['email']);
        $otpauth = 'otpauth://totp/' . rawurlencode($issuer . ':' . $account)
                 . '?secret=' . $secret
                 . '&issuer=' . rawurlencode($issuer)
                 . '&algorithm=SHA1&digits=6&period=30';
        jsonResponse(['success' => true, 'secret' => $secret, 'otpauth' => $otpauth]);
    }

    if ($action === 'confirm-totp') {
        if (!$sessionValid) jsonError('Unauthorized. Please log in first.', 401);
        ensureTwoFaColumns();
        $admin = currentAdminRow();
        if (!$admin) jsonError('Unauthorized. Please log in first.', 401);

        $code = trim((string)($input['code'] ?? ''));
        $secret = decryptSecret((string)($admin['totp_secret'] ?? ''));
        if (!verifyTotp($secret, $code)) {
            jsonError('Invalid code. Please enter the current code from your authenticator app.', 400);
        }
        $codes = generateBackupCodes(5);
        $stmt = $pdo->prepare("UPDATE admin_users SET totp_enabled = 1, backup_codes = ? WHERE id = ?");
        $stmt->execute([json_encode(array_map('hashBackupCode', $codes)), (int)$admin['id']]);
        logActivity('2fa_enable', 'Two-factor authentication (Authenticator App) enabled.', 'admin', (string)$admin['id'], (string)$admin['name']);
        jsonResponse(['success' => true, 'backupCodes' => $codes]);
    }

    if ($action === 'send-email-otp') {
        if (!$sessionValid) jsonError('Unauthorized. Please log in first.', 401);
        $admin = currentAdminRow();
        if (!$admin) jsonError('Unauthorized. Please log in first.', 401);
        $email = (string)$admin['email'];
        sendEmailOtp($email);
        jsonResponse(['success' => true, 'message' => "A verification code was sent to {$email}."]);
    }

    if ($action === 'confirm-email') {
        if (!$sessionValid) jsonError('Unauthorized. Please log in first.', 401);
        ensureTwoFaColumns();
        $admin = currentAdminRow();
        if (!$admin) jsonError('Unauthorized. Please log in first.', 401);

        $code = trim((string)($input['code'] ?? ''));
        if (!codeMatchesSessionOtp($code)) {
            $left = emailOtpAttemptsLeft();
            if ($left <= 0) {
                jsonError('Too many invalid OTP attempts. Please request a new code.', 429);
            }
            jsonError('Invalid code. Please check your email for the 6-digit code.', 400);
        }
        $codes = generateBackupCodes(5);
        $stmt = $pdo->prepare("UPDATE admin_users SET email_otp_enabled = 1, backup_codes = ? WHERE id = ?");
        $stmt->execute([json_encode(array_map('hashBackupCode', $codes)), (int)$admin['id']]);
        unset($_SESSION['2fa_email_code_hash'], $_SESSION['2fa_email_expires'], $_SESSION['2fa_email_attempts']);
        logActivity('2fa_enable', 'Two-factor authentication (Email OTP) enabled.', 'admin', (string)$admin['id'], (string)$admin['name']);
        jsonResponse(['success' => true, 'backupCodes' => $codes]);
    }

    if ($action === 'send-login-otp') {
        // Pending-login path: email an OTP to the user awaiting 2FA, using the
        // pending session (no full login yet).
        $token = trim((string)($input['token'] ?? ''));
        $pending = $_SESSION['pending_2fa'] ?? null;
        if (!is_array($pending) || !hash_equals((string)($pending['token'] ?? ''), $token)) {
            jsonError('Invalid or expired verification session. Please log in again.', 400);
        }
        $stmt = $pdo->prepare("SELECT * FROM admin_users WHERE id = ?");
        $stmt->execute([(int)($pending['user_id'] ?? 0)]);
        $admin = $stmt->fetch();
        if (!$admin) {
            jsonError('Account not found. Please log in again.', 400);
        }
        $email = (string)$admin['email'];
        // Guard: only email an OTP when this account actually has email 2FA on.
        if ((int)($admin['email_otp_enabled'] ?? 0) !== 1) {
            jsonError('This account does not have email verification enabled.', 400);
        }
        sendEmailOtp($email);
        jsonResponse(['success' => true, 'message' => "A verification code was sent to {$email}."]);
    }

    if ($action === 'verify') {
        // Complete the pending login with a 2FA code.
        ensureTwoFaColumns();
        $token = trim((string)($input['token'] ?? ''));
        $pending = $_SESSION['pending_2fa'] ?? null;
        if (!is_array($pending) || !hash_equals((string)($pending['token'] ?? ''), $token)) {
            jsonError('Invalid or expired verification session. Please log in again.', 400);
        }
        $stmt = $pdo->prepare("SELECT * FROM admin_users WHERE id = ?");
        $stmt->execute([(int)($pending['user_id'] ?? 0)]);
        $admin = $stmt->fetch();
        if (!$admin) {
            jsonError('Account not found. Please log in again.', 400);
        }

        // Brute-force throttle: 5 wrong codes → permanent IP ban.
        $attempts = (int)($_SESSION['2fa_attempts'] ?? 0) + 1;
        $_SESSION['2fa_attempts'] = $attempts;
        if ($attempts > 5) {
            recordIpBan(getClientIp(), 'Banned for repeated failed two-factor verification attempts', (string)$admin['email'], $attempts, '2fa');
            jsonResponse([
                'success'          => false,
                'message'          => 'You have been banned for repeated failed verification attempts. Please contact the administrator.',
                'error'            => 'You have been banned for repeated failed verification attempts. Please contact the administrator.',
                'banned'           => true,
                'attemptsRemaining' => 0,
            ], 403);
        }

        $vMethod = (string)($input['method'] ?? '');
        $code    = trim((string)($input['code'] ?? ''));
        $backupUsed = false;

        if ($vMethod === 'app') {
            $secret = decryptSecret((string)($admin['totp_secret'] ?? ''));
            if ((int)($admin['totp_enabled'] ?? 0) !== 1 || !verifyTotp($secret, $code)) {
                jsonError('Invalid code. Please check your authenticator app and try again.', 400);
            }
        } elseif ($vMethod === 'email') {
            if ((int)($admin['email_otp_enabled'] ?? 0) !== 1 || !codeMatchesSessionOtp($code)) {
                $left = emailOtpAttemptsLeft();
                if ($left <= 0) {
                    jsonError('Too many invalid codes. Please request a new code and try again.', 429);
                }
                jsonError('Invalid code. Please check your email for the 6-digit code.', 400);
            }
            unset($_SESSION['2fa_email_code_hash'], $_SESSION['2fa_email_expires'], $_SESSION['2fa_email_attempts']);
        } elseif ($vMethod === 'backup') {
            $remaining = consumeBackupCode($admin, $code);
            if ($remaining === null) {
                jsonError('Invalid backup code.', 400);
            }
            $backupUsed = true;
        } else {
            jsonError('Invalid verification method.', 400);
        }

        // ── Verified — complete the login ─────────────────────────────────
        establishAdminSession($admin);

        // Log the successful login (mirrors the plain password flow).
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $logStmt = $pdo->prepare(
            "INSERT INTO login_logs (id, email, ip_address, user_agent, location, success) VALUES (?, ?, ?, ?, ?, 1)"
        );
        $logStmt->execute([generateId(), $admin['email'], getClientIp(), $ua, 'Unknown']);
        logActivity('login', "Admin user {$admin['name']} logged into Publisher Portal (2FA verified).", 'admin', (string)$admin['id'], (string)$admin['name']);

        $status = twofaStatusForUser($admin);
        jsonResponse([
            'success'        => true,
            'user'           => [
                'email' => $admin['email'],
                'name'  => $admin['name'],
                'role'  => $admin['role'],
            ],
            'backupUsed'     => $backupUsed,
            'backupRemaining' => $status['backupRemaining'],
            'backupCodesLow' => $status['backupRemaining'] <= 1,
        ]);
    }

    if ($action === 'deactivate') {
        // Disabling a method requires the live code for THAT method (or a
        // backup code as a recovery path). Prevents a stolen session from
        // silently removing 2FA.
        if (!$sessionValid) jsonError('Unauthorized. Please log in first.', 401);
        ensureTwoFaColumns();
        $admin = currentAdminRow();
        if (!$admin) jsonError('Unauthorized. Please log in first.', 401);

        $dMethod = (string)($input['method'] ?? '');
        $code    = trim((string)($input['code'] ?? ''));
        $verified = false;

        if ($dMethod === 'app') {
            $secret = decryptSecret((string)($admin['totp_secret'] ?? ''));
            if ((int)($admin['totp_enabled'] ?? 0) === 1 && verifyTotp($secret, $code)) {
                $verified = true;
            }
        } elseif ($dMethod === 'email') {
            if ((int)($admin['email_otp_enabled'] ?? 0) === 1 && codeMatchesSessionOtp($code)) {
                $verified = true;
                unset($_SESSION['2fa_email_code_hash'], $_SESSION['2fa_email_expires'], $_SESSION['2fa_email_attempts']);
            }
        } elseif ($dMethod === 'backup') {
            $verified = consumeBackupCode($admin, $code) !== null;
        }

        if (!$verified) {
            jsonError('Invalid code. Enter the current code to disable two-factor authentication.', 400);
        }

        if ($dMethod === 'app' || $dMethod === 'backup') {
            $stmt = $pdo->prepare("UPDATE admin_users SET totp_enabled = 0, totp_secret = '' WHERE id = ?");
            $stmt->execute([(int)$admin['id']]);
        }
        if ($dMethod === 'email' || $dMethod === 'backup') {
            $stmt = $pdo->prepare("UPDATE admin_users SET email_otp_enabled = 0 WHERE id = ?");
            $stmt->execute([(int)$admin['id']]);
        }

        // Re-fetch the row so the wipe decision + response use the POST-UPDATE
        // values (the in-memory $admin still holds the old enabled flags).
        $fresh = $pdo->prepare("SELECT * FROM admin_users WHERE id = ?");
        $fresh->execute([(int)$admin['id']]);
        $freshRow = $fresh->fetch();
        $status = twofaStatusForUser($freshRow ?: $admin);
        // If nothing remains enabled, wipe the recovery codes too.
        if (!$status['enabled']) {
            $stmt = $pdo->prepare("UPDATE admin_users SET backup_codes = NULL WHERE id = ?");
            $stmt->execute([(int)$admin['id']]);
            $status['backupRemaining'] = 0;
        }
        logActivity('2fa_disable', "Two-factor authentication disabled ({$dMethod}).", 'admin', (string)$admin['id'], (string)$admin['name']);
        jsonResponse(['success' => true, 'twofa' => $status]);
    }

    if ($action === 'regenerate-backup') {
        if (!$sessionValid) jsonError('Unauthorized. Please log in first.', 401);
        ensureTwoFaColumns();
        $admin = currentAdminRow();
        if (!$admin) jsonError('Unauthorized. Please log in first.', 401);

        $codes = generateBackupCodes(5);
        saveBackupCodesForUser((int)$admin['id'], $codes);
        logActivity('2fa_backup_regen', 'A new set of 2FA backup codes was generated.', 'admin', (string)$admin['id'], (string)$admin['name']);
        jsonResponse(['success' => true, 'backupCodes' => $codes]);
    }

    if ($action === 'admin-reset') {
        // Administrator-only: wipe 2FA for any staff account (locked-out user
        // recovery). Editors/Guest Writers can never reset someone else's 2FA.
        requireSection('user-management');
        if (normalizeRole((string)($_SESSION['admin_role'] ?? '')) !== 'Administrator') {
            jsonError('Only Administrators can reset two-factor authentication for other users.', 403);
        }
        $userId = (int)($input['userId'] ?? 0);
        if ($userId <= 0) {
            jsonError('User id is required.', 400);
        }
        $stmt = $pdo->prepare("SELECT name, email FROM admin_users WHERE id = ?");
        $stmt->execute([$userId]);
        $target = $stmt->fetch();
        if (!$target) {
            jsonError('User not found.', 404);
        }
        $stmt = $pdo->prepare("UPDATE admin_users SET totp_secret = '', totp_enabled = 0, email_otp_enabled = 0, backup_codes = NULL WHERE id = ?");
        $stmt->execute([$userId]);
        logActivity('2fa_reset', "Two-factor authentication reset for {$target['name']} ({$target['email']}).", 'admin', (string)$userId, (string)$target['name']);
        jsonResponse(['success' => true, 'message' => "2FA has been reset for {$target['name']}. They can set it up again on next login."]);
    }

    jsonError('Invalid action. Use: setup-totp, confirm-totp, send-email-otp, confirm-email, send-login-otp, verify, deactivate, regenerate-backup, or admin-reset');
}

jsonError('Method not allowed', 405);
