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
 * Daily Impact Devotional - Settings API
 * 
 * GET /api/settings - Get all settings (secrets masked for public visitors)
 * PUT /api/settings - Update settings (merge; secrets stored encrypted)
 *
 * Uses httpMethod() so hosts that block the PUT verb (cPanel/ModSecurity)
 * still work via POST ?_method=PUT (the frontend apiPut() helper does this
 * automatically). Secret credentials are encrypted at rest with AES-256-CBC
 * (see encryptSecret/decryptSecret in config/db.php) and only ever returned
 * decrypted to an authenticated admin session.
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = httpMethod();

switch ($method) {
    case 'GET':
        // GET /api/settings - Return all settings as key-value object
        $settings = getSettings();

        // Ensure defaults exist for frontend
        $defaults = [
            'admin_timezone'        => 'Africa/Lagos',
            'telegram_channel_link' => 'https://t.me/dailyimpactdevotional',
            'telegram_enabled'      => 'false',
            'telegram_post_time'    => '06:00',
            'telegram_schedule_mode'=> 'scheduled',
            'telegram_bot_token'    => '',
            'telegram_channel_id'   => '',
            'cron_secret_key'       => '',
            'cron_last_run'         => '',
            'cron_last_result'      => '',
            'telegram_footer_text'  => 'Join our Telegram channel for daily impact! 📖🔥',
            'notify_email'          => '',
            'donation_notify_emails'=> '',
            'notify_event_login'    => 'true',
            'notify_event_failed_login' => 'true',
            'notify_event_ip_ban'   => 'true',
            'notify_event_donation' => 'true',
            'homepage_hero_image'   => '',
            'footer_sponsor_image'  => '',
            'author_name'           => 'Dr. Andy Osakwe',
            'author_title'          => 'Author & Founder',
            'author_bio'            => '',
            'author_image'          => '',
            'smtp_host'             => '',
            'smtp_user'             => '',
            'smtp_pass'             => '',
            'smtp_port'             => '587',
            'smtp_secure'           => 'tls',
            'mail_method'           => 'php',
            'paystack_public_key'   => '',
            'paystack_secret_key'   => '',
            'paystack_enabled'      => 'false',
            'flutterwave_public_key'=> '',
            'flutterwave_secret_key'=> '',
            'flutterwave_encryption_key' => '',
            'flutterwave_enabled'   => 'false',
            'webhook_url'           => '',
            'webhook_secret'        => '',
            'author_name'           => 'Dr. Andy Osakwe',
            'default_currency'      => 'NGN',
            'donation_message'      => 'Thank you for supporting Daily Impact Devotional.',
            'gateway_currency_map'  => '{"NGN":"paystack","USD":"flutterwave","GBP":"flutterwave"}',
            'bank_transfer_enabled' => 'true',
            'bank_account_name'     => 'Daily Impact Devotional Ministries',
            'bank_account_number'   => '',
            'bank_name'             => '',
            'bank_accounts'         => '[]',
            'bank_currency'         => 'NGN',
        ];

        $result = array_merge($defaults, $settings);

        // Remove sensitive fields from public output
        unset($result['admin_password_hash']);

        // Secrets are only revealed (decrypted) to a logged-in admin session —
        // the Dashboard needs them to populate the Telegram/Payments forms.
        // Public visitors get empty strings so credentials never leak.
        $isAdmin = false;
        if (!empty($_COOKIE[session_name()] ?? '') && secureSession()) {
            $isAdmin = true;
        }
        if (!$isAdmin) {
            foreach (secretSettingKeys() as $secretKey) {
                $result[$secretKey] = '';
            }
        }

        jsonResponse($result);
        break;

    case 'PUT':
        // settings.php is a shared write path used by MANY tabs (Telegram
        // config, profile, branding assets, payments) — so any authenticated
        // admin with at least one granted section may save their tab's keys.
        // The only key restricted to the Administrator role is
        // 'role_permissions' (guarded below), so role control is not bypassable.
        requireAnySection(array_keys(roleSections()));
        // PUT /api/settings - Merge provided settings
        $input = jsonInput();

        if (empty($input)) {
            jsonError('No settings provided');
        }

        // Only the Administrator may change role permissions. This check runs
        // before any write so a restricted role cannot self-elevate.
        if (array_key_exists('role_permissions', $input) && currentAdminRole() !== 'Administrator') {
            jsonError('Access denied: only the Administrator can change role permissions.', 403);
        }

        $stmt = $pdo->prepare(
            "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)"
        );

        foreach ($input as $key => $value) {
            // Sanitize key (alphanumeric and underscores only)
            if (preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $key)) {
                $val = (string)$value;
                // Encrypt secret credentials at rest. Empty values are stored
                // empty (which clears the credential).
                if (isSecretSettingKey($key) && $val !== '') {
                    $val = encryptSecret($val);
                }
                $stmt->execute([$key, $val]);
            }
        }

        jsonResponse(['success' => true]);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
