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
 * Daily Impact Devotional - Admin Authentication API
 * 
 * POST /api/admin?action=login    - Admin login
 * POST /api/admin?action=logout   - Admin logout
 * GET  /api/admin?action=check    - Check if logged in
 */

require_once __DIR__ . '/../config/db.php';

// ─── Session Security ────────────────────────────────────────────────────

// Ensure the admin_users table has the status column + widened role column the
// User Management tab relies on. Runs idempotently against existing deployments.
function ensureAdminUserColumns(): void {
    global $pdo;
    try {
        $db = (string)$pdo->query("SELECT DATABASE()")->fetchColumn();
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'status'"
        );
        $stmt->execute([$db]);
        if ((int)$stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE admin_users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Active' AFTER role");
        }
        $stmt = $pdo->prepare(
            "SELECT DATA_TYPE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'role'"
        );
        $stmt->execute([$db]);
        if (strtolower((string)$stmt->fetchColumn()) === 'enum') {
            $pdo->exec("ALTER TABLE admin_users MODIFY role VARCHAR(50) NOT NULL DEFAULT 'admin'");
        }
        // Staff profile bio — each logged-in user's OWN bio, never the author's.
        $bioStmt = $pdo->prepare(
            "SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'bio'"
        );
        $bioStmt->execute([$db]);
        if ((int)$bioStmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE admin_users ADD COLUMN bio TEXT NULL AFTER email");
        }
    } catch (Throwable $e) {
        // Table may not exist yet — install.php handles fresh setups.
    }
}

// Map legacy DB role values ('admin'/'editor'/'guest') to the display strings
// the dashboard uses ('Administrator'/'Assistant Editor'/'Guest Writer').
function mapUserRole(string $role): string {
    $r = strtolower(trim($role));
    if ($r === 'admin') return 'Administrator';
    if ($r === 'editor') return 'Assistant Editor';
    if ($r === 'guest') return 'Guest Writer';
    return $role;
}

// ─── Login security email notifications (branded templates) ─────────────────
// Sent to the security_notify_emails list. The login notification carries a
// one-time "log out all sessions" button (secureall token) + a reset link, so
// the real admin can instantly revoke a suspicious login from their inbox.

/** Best-effort geo lookup + browser parse for notification detail rows. */
function adminLoginContext(string $ip, string $ua): array
{
    $location = 'Unknown';
    if ($ip && $ip !== 'unknown' && $ip !== '::1' && !str_starts_with($ip, '127.') && !str_starts_with($ip, '192.168.')) {
        try {
            $geoUrl = "http://ip-api.com/json/{$ip}?fields=city,regionName,country";
            $geoRes = @file_get_contents($geoUrl, false, stream_context_create(['http' => ['timeout' => 3]]));
            if ($geoRes) {
                $geo = json_decode($geoRes, true);
                if ($geo && isset($geo['city'])) {
                    $location = implode(', ', array_filter([$geo['city'], $geo['regionName'] ?? '', $geo['country'] ?? '']));
                }
            }
        } catch (Throwable $e) { /* non-fatal */ }
    } else {
        $location = 'Localhost / Local network';
    }

    $browser = 'Unknown';
    if (preg_match('/(Chrome|Firefox|Safari|Edge|Opera)[\/\s]([\d.]+)/', $ua, $bm)) {
        $browser = $bm[0];
    }
    return ['location' => $location, 'browser' => $browser];
}

function adminTimezoneNow(): string
{
    $tz = getSetting('admin_timezone', 'Africa/Lagos');
    try {
        return (new DateTime('now', new DateTimeZone($tz)))->format('F j, Y g:i A') . ' (' . $tz . ')';
    } catch (Throwable $e) {
        return date('F j, Y g:i A') . ' (WAT)';
    }
}

/** Branded "new admin login" notification with the log-out-all + reset buttons. */
function notifyAdminLogin(string $email, string $ip, string $ua): void
{
    if (!notifyEventEnabled('login')) return;
    $notifyEmails = notifyRecipients('security_notify_emails');
    if (!$notifyEmails) return;

    $ctx = adminLoginContext($ip, $ua);
    $secureToken = bin2hex(random_bytes(24));
    setSetting('secureall_token_hash', hash('sha256', $secureToken));
    setSetting('secureall_token_expires', (string)(time() + 86400)); // 24h
    $origin = siteAbsoluteUrl('');

    $rendered = renderEmailTemplate('login_notification', [
        'login_email'    => $email,
        'login_ip'       => $ip,
        'login_time'     => adminTimezoneNow(),
        'login_location' => $ctx['location'],
        'login_browser'  => $ctx['browser'],
        'secureall_url'  => $origin . 'admin/login?secureall=' . $secureToken,
        'reset_url'      => $origin . 'admin/login',
    ]);

    foreach ($notifyEmails as $notifyEmail) {
        queueMailHtml($notifyEmail, $rendered['subject'], $rendered['text'], $rendered['html']);
    }
}

/** Branded failed-login alert, throttled to one per email+IP per 30 minutes. */
function notifyFailedLoginAttempt(string $email, string $ip, int $attemptsRemaining): void
{
    if (!notifyEventEnabled('failed_login')) return;
    $notifyEmails = notifyRecipients('security_notify_emails');
    if (!$notifyEmails) return;

    // Shared throttle: one alert per email+IP per 30 minutes.
    $h = substr(hash('sha256', strtolower($email) . '|' . $ip), 0, 24);
    if (!alertNotThrottled('failed_alert_log', $h, 1800)) {
        return; // already alerted recently
    }

    $ctx = adminLoginContext($ip, $_SERVER['HTTP_USER_AGENT'] ?? '');
    $rendered = renderEmailTemplate('failed_login_alert', [
        'login_email'        => $email,
        'login_ip'           => $ip,
        'login_time'         => adminTimezoneNow(),
        'login_location'     => $ctx['location'],
        'login_browser'      => $ctx['browser'],
        'attempts_remaining' => (string)max(0, $attemptsRemaining),
    ]);

    foreach ($notifyEmails as $notifyEmail) {
        queueMailHtml($notifyEmail, $rendered['subject'], $rendered['text'], $rendered['html']);
    }
}

/** Branded "new IP ban" notification (template new_ip_ban). */
function notifyIpBan(string $ip, string $cidr, string $reason): void
{
    if (!notifyEventEnabled('ip_ban')) return;
    $notifyEmails = notifyRecipients('security_notify_emails');
    if (!$notifyEmails) return;
    $rendered = renderEmailTemplate('new_ip_ban', [
        'ban_ip'     => $ip,
        'ban_cidr'   => $cidr,
        'ban_reason' => $reason,
    ]);
    foreach ($notifyEmails as $notifyEmail) {
        queueMailHtml($notifyEmail, $rendered['subject'], $rendered['text'], $rendered['html']);
    }
}

// Use secure session with timeout (60 min idle) and IP/UA binding
$sessionValid = secureSession(3600);
$isLocked = false;

// Check if this IP is temporarily locked out
if (!isset($_SESSION['admin_id'])) {
    $ip = getClientIp();
    $lockKey = 'login_lock_' . preg_replace('/[^a-f0-9]/', '', hash('sha256', $ip));
    $lockUntil = getSetting($lockKey, '0');
    if ($lockUntil > time()) {
        $isLocked = true;
    }
}

sendCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'POST':
        if ($action === 'login') {
            // POST /api/admin?action=login
            ensureLoginLogTable();
            ensureTwoFaColumns(); // 2FA columns must exist before the auth SELECT below
            ensureSessionVersionColumn(); // powers "log out all sessions" from the login-notification email
            $input = jsonInput();
            $email    = trim($input['email'] ?? '');
            $password = $input['password'] ?? '';
            $step     = $input['step'] ?? 'password'; // 'email' or 'password'

            if (empty($email)) {
                jsonError('Email is required', 400);
            }

            // ─── IP Ban Check ───────────────────────────────────────────────────
            
            $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
            // Take first IP if multiple in X-Forwarded-For
            if (strpos($ip, ',') !== false) {
                $ip = trim(explode(',', $ip)[0]);
            }
            
            $existingBan = getBanForIp($ip);
            if ($existingBan && $existingBan['active']) {
                jsonResponse([
                    'success' => false,
                    'message' => 'You have been banned for too many failed login attempts. Please contact the administrator.',
                    'error'   => 'You have been banned for too many failed login attempts. Please contact the administrator.',
                    'banned'  => true,
                    'attemptsRemaining' => 0,
                ], 403);
            }

            // ─── Email Validation Step ───────────────────────────────────────────

            if ($step === 'email') {
                // Check if the email exists in the system (case-insensitive). The
                // password step is ONLY offered when the email is registered — a
                // wrong email is rejected here so the login form cannot be probed
                // past this gate. Repeated unknown emails are logged and trigger
                // the same IP ban as wrong passwords.
                $stmt = $pdo->prepare("SELECT email FROM admin_users WHERE LOWER(email) = LOWER(?)");
                $stmt->execute([$email]);
                $emailExists = $stmt->fetch() !== false;

                // Also check legacy hash (pre-admin_users installs)
                if (!$emailExists) {
                    $legacyHash = getSetting('admin_password_hash', '');
                    if ($legacyHash) {
                        $emailExists = true;
                    }
                }

                if (!$emailExists) {
                    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                    $logStmt = $pdo->prepare(
                        "INSERT INTO login_logs (id, email, ip_address, user_agent, location, success) VALUES (?, ?, ?, ?, ?, 0)"
                    );
                    $logStmt->execute([generateId(), $email, $ip, $ua, 'Unknown']);

                    // Same rate-limit / IP-ban logic as the password step, so a
                    // burst of unknown-email guesses also gets the IP banned.
                    // Use MySQL's own clock (NOT PHP-side date() strings) for the
                    // 15-minute window — PHP and MySQL timezones often differ on
                    // shared hosts, which made the countdown never advance and
                    // the ban never trigger.
                    $failStmt = $pdo->prepare(
                        "SELECT COUNT(*) FROM login_logs
                         WHERE ip_address = ? AND success = 0
                           AND logged_at >= NOW() - INTERVAL 15 MINUTE"
                    );
                    $failStmt->execute([$ip]);
                    $recentFailures = (int)$failStmt->fetchColumn();
                    $lockoutThreshold = (int)getSetting('security_lockout_threshold', '3');

                    if ($recentFailures >= $lockoutThreshold) {
                        $ban = recordIpBan(
                            $ip,
                            "Automatic ban after {$lockoutThreshold} failed login attempts",
                            $email,
                            $recentFailures,
                            'admin-login'
                        );
                        // Whitelisted IPs are never banned — recordIpBan returns
                        // null, so fall through to the normal countdown response
                        // instead of a false "you are banned" message.
                        if ($ban !== null) {
                            try {
                                notifyIpBan($ip, $ban['cidr'], "Automatic ban after {$lockoutThreshold} failed login attempts");
                            } catch (Throwable $e) { /* non-fatal */ }
                            jsonResponse([
                                'success' => false,
                                'message' => "You have been banned for too many failed login attempts. Please contact the administrator.",
                                'error'   => "You have been banned for too many failed login attempts. Please contact the administrator.",
                                'banned'  => true,
                                'attemptsRemaining' => 0,
                            ], 403);
                        }
                    }

                    // Countdown warning: "2 attempts remaining → 1 → banned".
                    // recentFailures already includes this failure, so remaining =
                    // threshold - failures (clamped at 0).
                    $attemptsRemaining = max(0, $lockoutThreshold - $recentFailures);

                    // Alert the admins (throttled) — the failed-attempt email.
                    try {
                        notifyFailedLoginAttempt($email, $ip, $attemptsRemaining);
                    } catch (Throwable $e) { /* non-fatal */ }
                    jsonResponse([
                        'success' => false,
                        'message' => 'No account found with this email address. Please check and try again.',
                        'error'   => 'No account found with this email address. Please check and try again.',
                        'attemptsRemaining' => $attemptsRemaining,
                    ], 401);
                }

                jsonResponse([
                    'success' => true,
                    'step' => 'password',
                    'emailValid' => true,
                    'attemptsRemaining' => 3
                ]);
            }

            // ─── Password Validation Step ────────────────────────────────────────

            if (empty($password)) {
                jsonError('Password is required', 400);
            }

            $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';

            // ─── Rate Limiting ────────────────────────────────────────────────

            if ($isLocked) {
                $remaining = $lockUntil - time();
                $minutes = ceil($remaining / 60);
                jsonError(
                    "Too many failed attempts. Please wait $minutes minute(s) before trying again.",
                    429
                );
            }

            // Count recent failed attempts from this IP (last 15 minutes)
            // Use MySQL's own clock (NOT PHP-side date() strings) for the
            // 15-minute window — PHP and MySQL timezones often differ on
            // shared hosts, which made the countdown never advance and the
            // ban never trigger.
            $failStmt = $pdo->prepare(
                "SELECT COUNT(*) FROM login_logs
                 WHERE ip_address = ? AND success = 0
                   AND logged_at >= NOW() - INTERVAL 15 MINUTE"
            );
            $failStmt->execute([$ip]);
            $recentFailures = (int)$failStmt->fetchColumn();

            // Also count failures for this specific email
            $emailFailStmt = $pdo->prepare(
                "SELECT COUNT(*) FROM login_logs
                 WHERE email = ? AND success = 0
                   AND logged_at >= NOW() - INTERVAL 15 MINUTE"
            );
            $emailFailStmt->execute([$email]);
            $emailFailures = (int)$emailFailStmt->fetchColumn();

            $lockoutThreshold = (int)getSetting('security_lockout_threshold', '3');

            // Count THIS failure toward the threshold: recentFailures is queried
            // before the failure is logged, so add 1. This makes the password
            // step match the email step exactly — two countdown warnings, then
            // the third failed attempt triggers the permanent ban.
            if (($recentFailures + 1) >= $lockoutThreshold || ($emailFailures + 1) >= $lockoutThreshold) {
                // Ban the entire IP subnet (refused for whitelisted IPs).
                $ban = recordIpBan($ip, "Automatic ban after {$lockoutThreshold} failed login attempts", $email, $recentFailures + 1, 'admin-login');

                if ($ban !== null) {
                    // Notify admins about the ban (branded template)
                    try {
                        notifyIpBan($ip, $ban['cidr'], "Automatic ban after {$lockoutThreshold} failed login attempts");
                    } catch (Throwable $e) { /* non-fatal */ }

                    jsonResponse([
                        'success' => false,
                        'message' => "You have been banned for too many failed login attempts. Please contact the administrator.",
                        'error'   => "You have been banned for too many failed login attempts. Please contact the administrator.",
                        'banned'  => true,
                        'attemptsRemaining' => 0,
                    ], 403);
                }
                // Whitelisted — recordIpBan refused; fall through to the generic
                // failure response below so the countdown keeps working.
            }

            // ─── Authentication ───────────────────────────────────────────────

            // Find admin user
            $stmt = $pdo->prepare("SELECT * FROM admin_users WHERE email = ?");
            $stmt->execute([$email]);
            $admin = $stmt->fetch();

            // Also check settings for legacy password hash
            if (!$admin) {
                $legacyHash = getSetting('admin_password_hash', '');
                if ($legacyHash && password_verify($password, $legacyHash)) {
                    // Create admin user on the fly — derive a real display name
                    // from the email local part instead of a hardcoded 'Admin'
                    // (which made the logged-in owner look like the seeded test
                    // account in User Management).
                    $local = strtolower(trim(explode('@', $email)[0] ?? ''));
                    $local = preg_replace('/[^a-z0-9]+/', ' ', $local);
                    $displayName = $local !== '' ? ucwords(trim($local)) : 'Administrator';
                    $stmt = $pdo->prepare(
                        "INSERT IGNORE INTO admin_users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')"
                    );
                    $stmt->execute([$email, $legacyHash, $displayName]);
                    $stmt = $pdo->prepare("SELECT * FROM admin_users WHERE email = ?");
                    $stmt->execute([$email]);
                    $admin = $stmt->fetch();
                }
            }

            if (!$admin || !password_verify($password, $admin['password_hash'])) {
                // Log failed attempt
                $logStmt = $pdo->prepare(
                    "INSERT INTO login_logs (id, email, ip_address, user_agent, location, success) VALUES (?, ?, ?, ?, ?, 0)"
                );
                $logStmt->execute([
                    generateId(),
                    $email,
                    $ip,
                    $ua,
                    'Unknown',
                ]);

                // Alert the admins (throttled) — the failed-attempt email.
                try {
                    notifyFailedLoginAttempt($email, $ip, max(0, $lockoutThreshold - max($recentFailures, $emailFailures) - 1));
                } catch (Throwable $e) { /* non-fatal */ }

                // Prevent email enumeration — use same message regardless.
                // Countdown warning mirrors the email step: the server bans when
                // failures reach the threshold, and the client shows 2 → 1 → banned.
                $attemptsRemaining = max(0, $lockoutThreshold - max($recentFailures, $emailFailures) - 1);
                jsonResponse([
                    'success' => false,
                    'message' => 'Invalid email or password. ' . ($attemptsRemaining > 0 ? "{$attemptsRemaining} attempt" . ($attemptsRemaining === 1 ? '' : 's') . " remaining before you are banned." : "You will be banned on your next failed attempt."),
                    'error'   => 'Invalid email or password.',
                    'attemptsRemaining' => $attemptsRemaining,
                ], 401);
            }

            // ─── Successful Password — 2FA Gate & Session ─────────────────────

            // Enforce the account status set in User Management. Placed AFTER
            // password verification so account status is never revealed without
            // valid credentials (keeps the file's anti-enumeration design intact).
            if (isset($admin['status']) && strtolower((string)$admin['status']) === 'suspended') {
                jsonError(
                    'This account has been suspended. Contact an administrator.',
                    403
                );
            }

            // ── Two-Factor Authentication gate ──────────────────────────────
            // When the account has 2FA enabled, do NOT complete the login yet.
            // Store a pending session + one-time token; the frontend then shows
            // the 2FA modal and calls /api/2fa?action=verify to finish login
            // with a live app/email/backup code.
            ensureTwoFaColumns();
            $twofa = twofaStatusForUser($admin);
            if ($twofa['enabled']) {
                // Regenerate before storing the pending token so a fixation
                // attempt can't ride the pre-auth session id.
                regenerateSession();
                $pendingToken = bin2hex(random_bytes(16));
                $_SESSION['pending_2fa'] = [
                    'user_id' => (int)$admin['id'],
                    'token'   => $pendingToken,
                ];
                $_SESSION['2fa_attempts'] = 0;
                jsonResponse([
                    'success'       => true,
                    'twofaRequired' => true,
                    'pendingToken'  => $pendingToken,
                    'twofa'         => $twofa,
                ]);
            }

            // No 2FA — complete the login immediately (shared with the 2FA
            // verify path so both establish an identical session).
            establishAdminSession($admin);

            // Log successful login
            $logStmt = $pdo->prepare(
                "INSERT INTO login_logs (id, email, ip_address, user_agent, location, success) VALUES (?, ?, ?, ?, ?, 1)"
            );
            $logStmt->execute([
                generateId(),
                $admin['email'],
                $ip,
                $ua,
                'Unknown',
            ]);

            // Real-time activity feed entry — shows on the dashboard instantly.
            logActivity('login', "Admin user {$admin['name']} successfully logged into Publisher Portal.", 'admin', (string)$admin['id'], $admin['name']);

            // Branded login-notification email with "log out all sessions" + reset links.
            try {
                notifyAdminLogin($admin['email'], $ip, $ua);
            } catch (Throwable $e) { /* non-fatal */ }

            jsonResponse([
                'success' => true,
                'user'    => [
                    'email' => $admin['email'],
                    'name'  => $admin['name'],
                    'role'  => $admin['role'],
                ],
            ]);

        } elseif ($action === 'update-profile') {
            // POST /api/admin?action=update-profile
            // Update the logged-in admin's name/email in admin_users AND session,
            // Staff details are deliberately NOT written to the author_name
            // setting — the public author identity comes only from Branding.
            if (!secureSession(3600)) {
                jsonError('Unauthorized. Please log in first.', 401);
            }
            $input = jsonInput();
            $name  = trim((string)($input['name'] ?? ''));
            $email = strtolower(trim((string)($input['email'] ?? '')));
            // Staff bio belongs to THIS user — it is NOT the public author bio.
            $bio   = trim((string)($input['bio'] ?? ''));

            if ($name === '') {
                jsonError('Name is required.', 400);
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonError('Enter a valid email address.', 400);
            }

            // Keep the same id/email uniqueness guard as login
            $dup = $pdo->prepare("SELECT id FROM admin_users WHERE email = ? AND email <> ?");
            $dup->execute([$email, $_SESSION['admin_email'] ?? '']);
            if ($dup->fetch()) {
                jsonError('That email is already in use by another admin account.', 409);
            }

            ensureAdminUserColumns();
            $stmt = $pdo->prepare("UPDATE admin_users SET name = ?, email = ?, bio = ? WHERE id = ?");
            $stmt->execute([$name, $email, $bio, $_SESSION['admin_id']]);

            // Update session so subsequent checks return the new details.
            // NOTE: this NEVER touches the author_name setting — the public
            // author identity (About the Author page + default devotional
            // author) is set ONLY from the Settings → Branding tab.
            $_SESSION['admin_name']  = $name;
            $_SESSION['admin_email'] = $email;
            $_SESSION['admin_bio']   = $bio;

            logActivity('profile_update', "Profile updated for {$name}.", 'admin', $_SESSION['admin_id'] ?? '', $name);

            jsonResponse([
                'success' => true,
                'user'    => ['name' => $name, 'email' => $email, 'bio' => $bio],
            ]);

        } elseif ($action === 'logout') {
            // POST /api/admin?action=logout
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000,
                    $params['path'], $params['domain'],
                    $params['secure'], $params['httponly']
                );
            }
            session_destroy();

            // Clear any lock
            $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
            $lockKey = 'login_lock_' . preg_replace('/[^a-f0-9]/', '', hash('sha256', $ip));
            setSetting($lockKey, '0');

            jsonResponse(['success' => true]);

        } elseif ($action === 'logout-all-sessions') {
            // POST /api/admin?action=logout-all-sessions { token }
            // Used by the "This wasn't me — Log out all sessions" button in the
            // login-notification email. The token is single-use and expires after
            // 24h; bumping session_version invalidates every admin session.
            $input = jsonInput();
            $token = trim((string)($input['token'] ?? ($_GET['token'] ?? '')));
            $stored = (string)getSetting('secureall_token_hash', '');
            $expires = (int)getSetting('secureall_token_expires', '0');
            if ($stored === '' || !hash_equals($stored, hash('sha256', $token))) {
                jsonError('Invalid or expired security token. Request a new login notification email.', 403);
            }
            if ($expires > 0 && time() > $expires) {
                jsonError('This security link has expired. Request a new login notification email.', 403);
            }

            // Invalidate the token immediately (single-use).
            setSetting('secureall_token_hash', '');
            setSetting('secureall_token_expires', '0');

            // Bump every admin's session_version — all existing sessions die on
            // their next API call (including the session that triggered the email).
            ensureSessionVersionColumn();
            try {
                $pdo->exec("UPDATE admin_users SET session_version = session_version + 1");
            } catch (Throwable $e) {
                jsonError('Failed to revoke sessions: ' . $e->getMessage(), 500);
            }

            // Also destroy any active session on this request.
            if (session_status() === PHP_SESSION_ACTIVE) {
                $_SESSION = [];
                session_destroy();
            }

            logActivity('security', 'All admin sessions were logged out from the login-notification email.');
            jsonResponse([
                'success' => true,
                'message' => 'All admin sessions have been logged out. Anyone using this account must sign in again.',
            ]);

        } elseif ($action === 'forgot-password') {
            // POST /api/admin?action=forgot-password
            // Verifies the email is REGISTERED before sending any reset link.
            $input = jsonInput();
            $email = trim($input['email'] ?? '');

            if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonError('Enter a valid email address.', 400);
            }

            // Verify the email exists in admin_users. NOTE: we deliberately do NOT
            // fall back to the legacy admin_password_hash setting — that hash has no
            // email associated with it, so accepting any email would email reset
            // links to arbitrary addresses and reset-password could not match a row.
            // (Login self-heals legacy accounts by creating their admin_users row on
            // first successful legacy login, so forgot-password can require the row.)
            $stmt = $pdo->prepare("SELECT email FROM admin_users WHERE email = ?");
            $stmt->execute([$email]);
            $emailExists = $stmt->fetch() !== false;

            if (!$emailExists) {
                jsonError('Email not recognized. Please use the email registered with your account.', 404);
            }

            // Generate a one-time reset token (30-minute expiry)
            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);
            $expires = time() + 1800;

            setSetting('password_reset_token_hash', $tokenHash);
            setSetting('password_reset_email', $email);
            setSetting('password_reset_expires', (string)$expires);

            // Build the reset link — SPA route /admin/login?reset=TOKEN
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $resetUrl = "{$scheme}://{$host}/admin/login?reset={$token}";

            // Branded, responsive password-reset email (editable template).
            try {
                $rendered = renderEmailTemplate('password_reset', [
                    'reset_url' => $resetUrl,
                ]);
                queueMailHtml($email, $rendered['subject'], $rendered['text'], $rendered['html']);
            } catch (Throwable $e) {
                // Fall back to a plain-text reset email if the engine fails.
                $subject = "🔑 Password Reset — " . getSetting('site_name', 'Daily Impact Devotional');
                $body = "A password reset was requested for your account.\n\n"
                      . "Click the link below to set a new password (valid for 30 minutes):\n\n"
                      . $resetUrl . "\n\n"
                      . "If you did not request this, you can safely ignore this email.\n";
                queueMail($email, $subject, $body);
            }

            jsonResponse([
                'success' => true,
                'message' => 'Reset link sent to your email. Check your inbox (and spam folder).',
            ]);

        } elseif ($action === 'reset-password') {
            // POST /api/admin?action=reset-password
            // Consumes the one-time token from the reset link and sets a new password.
            $input = jsonInput();
            $token = trim($input['token'] ?? '');
            $password = $input['password'] ?? '';

            if (empty($token)) {
                jsonError('Reset token is required.', 400);
            }
            if (strlen($password) < 6) {
                jsonError('Password must be at least 6 characters.', 400);
            }

            $storedHash   = getSetting('password_reset_token_hash', '');
            $storedEmail  = getSetting('password_reset_email', '');
            $storedExpiry = (int)getSetting('password_reset_expires', '0');

            if (empty($storedHash) || !hash_equals($storedHash, hash('sha256', $token))) {
                jsonError('Invalid or expired reset link. Please request a new one.', 400);
            }
            if (time() > $storedExpiry) {
                jsonError('This reset link has expired. Please request a new one.', 400);
            }

            // Update the password for the stored email
            $newHash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("UPDATE admin_users SET password_hash = ? WHERE email = ?");
            $stmt->execute([$newHash, $storedEmail]);
            if ($stmt->rowCount() === 0) {
                // Account vanished or was never in admin_users — don't report success.
                jsonError('Account not found. Please request a new reset link.', 400);
            }

            // Invalidate the token so it can't be replayed
            setSetting('password_reset_token_hash', '');
            setSetting('password_reset_email', '');
            setSetting('password_reset_expires', '0');

            jsonResponse([
                'success' => true,
                'message' => 'Your password has been reset. Please sign in with your new password.',
            ]);

        } elseif ($action === 'list-users') {
            // POST /api/admin?action=list-users
            // Returns every admin/staff account so the User Management tab can
            // show the real database state (previously the dashboard only ever
            // displayed the current session admin and dropped everything else).            requireSection('user-management');
            ensureAdminUserColumns();
            ensureTwoFaColumns(); // 2FA columns must exist for the SELECT + per-user status below

            $stmt = $pdo->query(
                "SELECT id, name, email, role, status, created_at, totp_enabled, email_otp_enabled, backup_codes FROM admin_users ORDER BY created_at DESC, id DESC"
            );
            $rows = $stmt->fetchAll();
            $users = [];
            $seenEmails = [];
            foreach ($rows as $r) {
                $users[] = [
                    'id'        => (string)$r['id'],
                    'name'      => (string)($r['name'] ?? ''),
                    'email'     => (string)$r['email'],
                    'role'      => mapUserRole((string)($r['role'] ?? 'editor')),
                    'status'    => (string)($r['status'] ?? 'Active'),
                    'createdAt' => (string)($r['created_at'] ?? ''),
                    'twofa'     => twofaStatusForUser($r),
                ];
                $seenEmails[] = strtolower(trim((string)$r['email']));
            }

            // Guarantee the logged-in admin always sees themselves in the list,
            // even if their row is missing from the DB (e.g. a legacy account
            // that self-healed into admin_users on first login).
            $sessionEmail = strtolower(trim((string)($_SESSION['admin_email'] ?? '')));
            if ($sessionEmail !== '' && !in_array($sessionEmail, $seenEmails, true)) {
                array_unshift($users, [
                    'id'        => (string)($_SESSION['admin_id'] ?? 'session'),
                    'name'      => (string)($_SESSION['admin_name'] ?? 'Administrator'),
                    'email'     => (string)$_SESSION['admin_email'],
                    'role'      => mapUserRole((string)($_SESSION['admin_role'] ?? 'admin')),
                    'status'    => 'Active',
                    'createdAt' => '',
                    'twofa'     => ['enabled' => false, 'methods' => [], 'backupRemaining' => 0],
                ]);
            }
            jsonResponse(['success' => true, 'users' => $users]);

        } elseif ($action === 'save-user') {
            // POST /api/admin?action=save-user
            // Create a new staff user (with password) or update an existing one.
            // Passwords are hashed; an empty password on edit keeps the current one.
            requireSection('user-management');
            ensureAdminUserColumns();

            $input = jsonInput();
            $id       = (isset($input['id']) && $input['id'] !== '') ? (int)$input['id'] : null;
            $name     = trim((string)($input['name'] ?? ''));
            $email    = strtolower(trim((string)($input['email'] ?? '')));
            $role     = (string)($input['role'] ?? 'Assistant Editor');
            $status   = (string)($input['status'] ?? 'Active');
            $password = (string)($input['password'] ?? '');

            if ($name === '' || $email === '') {
                jsonError('Name and email are required.', 400);
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonError('Enter a valid email address.', 400);
            }
            $allowedRoles = ['Administrator', 'Assistant Editor', 'Guest Writer'];
            if (!in_array($role, $allowedRoles, true)) $role = 'Assistant Editor';
            if (!in_array($status, ['Active', 'Suspended'], true)) $status = 'Active';

            // Duplicate email check (excluding self when editing)
            if ($id) {
                $dup = $pdo->prepare("SELECT id FROM admin_users WHERE email = ? AND id <> ?");
                $dup->execute([$email, $id]);
            } else {
                $dup = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
                $dup->execute([$email]);
            }
            if ($dup->fetch()) {
                jsonError('That email is already in use by another admin account.', 409);
            }

            if ($id) {
                if ($password !== '') {
                    if (strlen($password) < 6) jsonError('Password must be at least 6 characters.', 400);
                    $hash = password_hash($password, PASSWORD_DEFAULT);
                    $stmt = $pdo->prepare(
                        "UPDATE admin_users SET name = ?, email = ?, role = ?, status = ?, password_hash = ? WHERE id = ?"
                    );
                    $stmt->execute([$name, $email, $role, $status, $hash, $id]);
                } else {
                    $stmt = $pdo->prepare("UPDATE admin_users SET name = ?, email = ?, role = ?, status = ? WHERE id = ?");
                    $stmt->execute([$name, $email, $role, $status, $id]);
                }
                if ($stmt->rowCount() === 0) jsonError('User not found.', 404);
                logActivity('user_update', "Admin user \"{$name}\" ({$email}) updated.", 'admin', (string)$id, $name);
            } else {
                if (strlen($password) < 6) jsonError('Password must be at least 6 characters.', 400);
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare(
                    "INSERT INTO admin_users (email, password_hash, name, role, status) VALUES (?, ?, ?, ?, ?)"
                );
                $stmt->execute([$email, $hash, $name, $role, $status]);
                $id = (int)$pdo->lastInsertId();
                logActivity('user_create', "Admin user \"{$name}\" ({$email}) created.", 'admin', (string)$id, $name);
            }

            jsonResponse([
                'success' => true,
                'id'      => (string)$id,
                'name'    => $name,
                'email'   => $email,
                'role'    => $role,
                'status'  => $status,
            ]);

        } elseif ($action === 'delete-user') {
            // POST /api/admin?action=delete-user
            requireSection('user-management');
            $input = jsonInput();
            $id = isset($input['id']) ? (int)$input['id'] : 0;
            if ($id <= 0) jsonError('User id is required.', 400);
            if ($id === (int)($_SESSION['admin_id'] ?? 0)) {
                jsonError('You cannot delete your own account.', 400);
            }
            $stmt = $pdo->prepare("SELECT name, email FROM admin_users WHERE id = ?");
            $stmt->execute([$id]);
            $deletedUser = $stmt->fetch();
            $stmt = $pdo->prepare("DELETE FROM admin_users WHERE id = ?");
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) jsonError('User not found.', 404);
            logActivity('user_delete', "Admin user \"{$deletedUser['name']}\" ({$deletedUser['email']}) deleted.", 'admin', (string)$id, $deletedUser['name'] ?? '');
            jsonResponse(['success' => true]);

        } else {
            jsonError('Invalid action. Use: login, logout, forgot-password, reset-password, check, list-users, save-user, or delete-user');
        }
        break;

    case 'GET':
        if ($action === 'list-users') {
            // GET /api/admin?action=list-users
            // The dashboard's User Management tab fetches users with a GET
            // (loadUsers in Dashboard.tsx). Previously the handler only existed
            // under POST, so GET returned "Invalid action" and the tab always
            // showed zero users — and "create" appeared to do nothing because
            // the freshly saved row was never re-listed.            requireSection('user-management');
            ensureAdminUserColumns();
            ensureTwoFaColumns(); // 2FA columns must exist for the SELECT + per-user status below

            $stmt = $pdo->query(
                "SELECT id, name, email, role, status, created_at, totp_enabled, email_otp_enabled, backup_codes FROM admin_users ORDER BY created_at DESC, id DESC"
            );
            $rows = $stmt->fetchAll();
            $users = [];
            $seenEmails = [];
            foreach ($rows as $r) {
                $users[] = [
                    'id'        => (string)$r['id'],
                    'name'      => (string)($r['name'] ?? ''),
                    'email'     => (string)$r['email'],
                    'role'      => mapUserRole((string)($r['role'] ?? 'editor')),
                    'status'    => (string)($r['status'] ?? 'Active'),
                    'createdAt' => (string)($r['created_at'] ?? ''),
                    'twofa'     => twofaStatusForUser($r),
                ];
                $seenEmails[] = strtolower(trim((string)$r['email']));
            }

            // Guarantee the logged-in admin always sees themselves in the list,
            // even if their row is missing from the DB (e.g. a legacy account
            // that self-healed into admin_users on first login).
            $sessionEmail = strtolower(trim((string)($_SESSION['admin_email'] ?? '')));
            if ($sessionEmail !== '' && !in_array($sessionEmail, $seenEmails, true)) {
                array_unshift($users, [
                    'id'        => (string)($_SESSION['admin_id'] ?? 'session'),
                    'name'      => (string)($_SESSION['admin_name'] ?? 'Administrator'),
                    'email'     => (string)$_SESSION['admin_email'],
                    'role'      => mapUserRole((string)($_SESSION['admin_role'] ?? 'admin')),
                    'status'    => 'Active',
                    'createdAt' => '',
                    'twofa'     => ['enabled' => false, 'methods' => [], 'backupRemaining' => 0],
                ]);
            }
            jsonResponse(['success' => true, 'users' => $users]);

        } elseif ($action === 'check') {
            // GET /api/admin?action=check
            // Re-validate session binding (timeout check runs via secureSession already called at top)
            $loggedIn = isset($_SESSION['admin_id']);

            // Report whether THIS IP is currently banned so the login page can
            // show the banned screen immediately instead of the login form.
            $banned = false;
            try {
                $banned = getBanForIp(getClientIp()) !== null;
            } catch (Throwable $e) {
                $banned = false;
            }

            jsonResponse([
                'loggedIn' => $loggedIn,
                'banned'   => $banned,
                'user'     => $loggedIn ? [
                    'email' => $_SESSION['admin_email'] ?? '',
                    'name'  => $_SESSION['admin_name'] ?? '',
                    'bio'   => $_SESSION['admin_bio'] ?? '',
                    'role'  => $_SESSION['admin_role'] ?? '',
                ] : null,
            ]);

        } else {
            jsonError('Invalid action. Use: check, or list-users');
        }
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
