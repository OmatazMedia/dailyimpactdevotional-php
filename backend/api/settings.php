<?php
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
            'telegram_footer_text'  => 'Join our Telegram channel for daily impact! 📖🔥',
            'notify_email'          => '',
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
        requireAdmin();
        // PUT /api/settings - Merge provided settings
        $input = jsonInput();

        if (empty($input)) {
            jsonError('No settings provided');
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
