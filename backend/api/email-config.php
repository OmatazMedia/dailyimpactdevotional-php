<?php
/**
 * Daily Impact Devotional - Email Configuration API
 *
 * GET  /api/email-config        - Get email configuration (masked secrets)
 * PUT  /api/email-config        - Update email configuration
 * POST /api/email-config?action=test        - Send a real test email NOW
 * GET  /api/email-config?action=templates   - List email templates (defaults + overrides)
 * PUT  /api/email-config?action=templates   - Save email template overrides
 */

require_once __DIR__ . '/../config/db.php';
requireSection('settings');
sendCorsHeaders();

$method = httpMethod();
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        if ($action === 'templates') {
            $keys = array_keys(emailTemplateDefaults());
            $out = [];
            foreach ($keys as $key) {
                $tpl = emailTemplate($key);
                $out[] = [
                    'key'     => $key,
                    'subject' => $tpl['subject'],
                    // Optional drag-and-drop builder blocks (JSON). Absent on
                    // fresh installs until the admin first saves via the
                    // visual builder; the frontend then falls back to parsing
                    // the HTML body into blocks.
                    'blocks'  => (string)getSetting('email_template_' . $key . '_blocks', ''),
                    'body'    => $tpl['body'],
                ];
            }
            jsonResponse([
                'templates' => $out,
                'branding'  => [
                    'siteName'    => (string)getSetting('site_name', 'Daily Impact Devotional'),
                    // The site's public domain URL — used for absolute logo links
                    // and URLs in emails/PDF exports (set at install time).
                    'siteUrl'     => (string)getSetting('site_url', ''),
                    'siteLogoUrl' => (string)getSetting('site_logo_url', ''),
                    'socialFacebook'  => (string)getSetting('social_facebook', ''),
                    'socialTwitter'   => (string)getSetting('social_twitter', ''),
                    'socialInstagram' => (string)getSetting('social_instagram', ''),
                    'socialYoutube'   => (string)getSetting('social_youtube', ''),
                ],
            ]);
        }

        // Get email configuration
        $config = [
            'mailMethod' => getSetting('mail_method', 'resend'),
            // The SECONDARY (fallback) transport — always kept different from
            // the primary. Defaults to whichever one is NOT primary.
            'mailMethodSecondary' => getSetting(
                'mail_method_secondary',
                getSetting('mail_method', 'resend') === 'smtp' ? 'resend' : 'smtp'
            ),
            'resend' => [
                'apiKey' => getSetting('resend_api_key', ''),
                'fromEmail' => getSetting('resend_from_email', ''),
                'fromName' => getSetting('resend_from_name', 'Daily Impact Devotional'),
                'replyTo' => getSetting('resend_reply_to', ''),
                'enabled' => getSetting('resend_enabled', 'true') === 'true'
            ],
            'smtp' => [
                'host' => getSetting('smtp_host', ''),
                'user' => getSetting('smtp_user', ''),
                'pass' => getSetting('smtp_pass', ''),
                'port' => getSetting('smtp_port', '587'),
                'secure' => getSetting('smtp_secure', 'tls'),
                'enabled' => getSetting('smtp_enabled', 'false') === 'true'
            ],
            'donation' => [
                'fromName'  => getSetting('donation_from_name', ''),
                'fromEmail' => getSetting('donation_from_email', ''),
            ],
            'notifyEmails' => getSetting('security_notify_emails', ''),
            'donationNotifyEmails' => getSetting('donation_notify_emails', ''),
            'notifyEvents' => [
                'login'       => notifyEventEnabled('login'),
                'failedLogin' => notifyEventEnabled('failed_login'),
                'ipBan'       => notifyEventEnabled('ip_ban'),
                'donation'    => notifyEventEnabled('donation'),
            ],
        ];

        // Mask sensitive data
        $config['resend']['apiKey'] = !empty($config['resend']['apiKey'])
            ? substr($config['resend']['apiKey'], 0, 8) . '...'
            : '';
        $config['smtp']['pass'] = !empty($config['smtp']['pass'])
            ? '********'
            : '';

        jsonResponse($config);
        break;

    case 'PUT':
        $input = jsonInput();

        if ($action === 'templates') {
            $templates = $input['templates'] ?? null;
            if (is_array($templates)) {
                foreach ($templates as $tpl) {
                    if (!is_array($tpl) || empty($tpl['key'])) continue;
                    $key = preg_replace('/[^a-z0-9_]/i', '', (string)$tpl['key']);
                    $defaults = emailTemplateDefaults();
                    if (!isset($defaults[$key])) continue;
                    if (isset($tpl['subject'])) {
                        setSetting('email_template_' . $key . '_subject', mb_substr((string)$tpl['subject'], 0, 300));
                    }
                    if (isset($tpl['body'])) {
                        setSetting('email_template_' . $key . '_body', (string)$tpl['body']);
                    }
                    if (isset($tpl['blocks'])) {
                        setSetting('email_template_' . $key . '_blocks', mb_substr((string)$tpl['blocks'], 0, 50000));
                    }
                }
            }
            $branding = $input['branding'] ?? null;
            if (is_array($branding)) {
                if (isset($branding['siteName']))    setSetting('site_name', mb_substr((string)$branding['siteName'], 0, 120));
                if (isset($branding['siteUrl'])) {
                    // Guard for hosts preserving an older db.php (no helper).
                    $normalized = function_exists('normalizeSiteUrl')
                        ? normalizeSiteUrl((string)$branding['siteUrl'])
                        : rtrim(trim((string)$branding['siteUrl']), '/');
                    if ($normalized !== '') setSetting('site_url', mb_substr($normalized, 0, 200));
                }
                if (isset($branding['siteLogoUrl'])) setSetting('site_logo_url', mb_substr((string)$branding['siteLogoUrl'], 0, 500));
                foreach (['socialFacebook', 'socialTwitter', 'socialInstagram', 'socialYoutube'] as $s) {
                    if (isset($branding[$s])) {
                        setSetting('social_' . strtolower(substr($s, 6)), mb_substr((string)$branding[$s], 0, 500));
                    }
                }
            }
            jsonResponse(['success' => true]);
        }

        // Update mail method (the PRIMARY transport)
        if (isset($input['mailMethod'])) {
            setSetting('mail_method', $input['mailMethod'] === 'smtp' ? 'smtp' : 'resend');
        }

        // Update the SECONDARY (fallback) transport — kept different from primary.
        if (isset($input['mailMethodSecondary'])) {
            $primary = (string)getSetting('mail_method', 'resend');
            $secondary = $input['mailMethodSecondary'] === 'smtp' ? 'smtp' : 'resend';
            if ($secondary === $primary) {
                $secondary = $primary === 'smtp' ? 'resend' : 'smtp';
            }
            setSetting('mail_method_secondary', $secondary);
        }

        // Update Resend settings
        if (isset($input['resend'])) {
            if (isset($input['resend']['apiKey'])) {
                if (strpos($input['resend']['apiKey'], '...') === false) {
                    setSecretSetting('resend_api_key', $input['resend']['apiKey']);
                }
            }
            if (isset($input['resend']['fromEmail'])) {
                setSetting('resend_from_email', mb_substr(trim((string)$input['resend']['fromEmail']), 0, 255));
            }
            if (isset($input['resend']['fromName'])) {
                setSetting('resend_from_name', mb_substr(trim((string)$input['resend']['fromName']), 0, 120));
            }
            if (isset($input['resend']['replyTo'])) {
                setSetting('resend_reply_to', mb_substr(trim((string)$input['resend']['replyTo']), 0, 255));
            }
            if (isset($input['resend']['enabled'])) {
                setSetting('resend_enabled', $input['resend']['enabled'] ? 'true' : 'false');
            }
        }

        // Update SMTP settings
        if (isset($input['smtp'])) {
            if (isset($input['smtp']['host'])) {
                setSetting('smtp_host', mb_substr(trim((string)$input['smtp']['host']), 0, 255));
            }
            if (isset($input['smtp']['user'])) {
                setSetting('smtp_user', mb_substr(trim((string)$input['smtp']['user']), 0, 255));
            }
            if (isset($input['smtp']['pass'])) {
                if ($input['smtp']['pass'] !== '********') {
                    setSecretSetting('smtp_pass', $input['smtp']['pass']);
                }
            }
            if (isset($input['smtp']['port'])) {
                setSetting('smtp_port', (string)(int)$input['smtp']['port']);
            }
            if (isset($input['smtp']['secure'])) {
                $sec = in_array($input['smtp']['secure'], ['tls', 'ssl', 'none'], true) ? $input['smtp']['secure'] : 'tls';
                setSetting('smtp_secure', $sec);
            }
            if (isset($input['smtp']['enabled'])) {
                setSetting('smtp_enabled', $input['smtp']['enabled'] ? 'true' : 'false');
            }
        }

        // Donation-specific From identity (falls back to the general one)
        if (isset($input['donation'])) {
            if (isset($input['donation']['fromName'])) {
                setSetting('donation_from_name', mb_substr(trim((string)$input['donation']['fromName']), 0, 120));
            }
            if (isset($input['donation']['fromEmail'])) {
                setSetting('donation_from_email', mb_substr(trim((string)$input['donation']['fromEmail']), 0, 255));
            }
        }

        // Update security notification emails
        if (isset($input['notifyEmails'])) {
            setSetting('security_notify_emails', mb_substr((string)$input['notifyEmails'], 0, 1000));
        }

        // Update donation notification recipients (separate, dedicated list)
        if (isset($input['donationNotifyEmails'])) {
            setSetting('donation_notify_emails', mb_substr((string)$input['donationNotifyEmails'], 0, 1000));
        }

        // Per-event notification toggles (login / failed login / IP ban / donation)
        if (isset($input['notifyEvents']) && is_array($input['notifyEvents'])) {
            $map = [
                'login'       => 'login',
                'failedLogin' => 'failed_login',
                'ipBan'       => 'ip_ban',
                'donation'    => 'donation',
            ];
            foreach ($map as $field => $event) {
                if (isset($input['notifyEvents'][$field])) {
                    setSetting('notify_event_' . $event, !empty($input['notifyEvents'][$field]) ? 'true' : 'false');
                }
            }
        }

        jsonResponse(['success' => true]);
        break;

    case 'POST':
        if ($action === 'test') {
            $input = jsonInput();
            $testEmail = trim($input['email'] ?? '');

            if (empty($testEmail) || !filter_var($testEmail, FILTER_VALIDATE_EMAIL)) {
                jsonError('Valid email address is required', 400);
            }

            $mailMethod = getSetting('mail_method', 'resend');
            $identity = emailFromIdentity();
            $fromLine = $identity['name'] . ' <' . ($identity['email'] !== '' ? $identity['email'] : 'not-configured@example.com') . '>';

            $rendered = renderEmailTemplate('donor_receipt', [
                'donor_name'         => 'Daily Impact Devotional Team',
                'donation_amount'    => '10.00',
                'donation_currency'  => 'USD',
                'donation_reference' => 'TEST-' . date('Ymd-His'),
                'donation_date'      => date('F j, Y g:i A'),
            ]);

            // Build a queue-shaped row and send it IMMEDIATELY via the primary
            // transport (with automatic fallback to the secondary).
            $row = [
                'to_email' => $testEmail,
                'subject'  => '📧 Test Email — ' . getSetting('site_name', 'Daily Impact Devotional'),
                'body'     => "This is a test email to verify your email configuration.\n\n"
                            . "Primary method: {$mailMethod}\n"
                            . "From: {$fromLine}\n"
                            . "Sent at: " . date('Y-m-d H:i:s') . "\n\n"
                            . "If you received this, your configuration is working!",
                'html'     => $rendered['html'],
            ];

            $result = mailTransportSend($row);

            if ($result['success']) {
                jsonResponse([
                    'success' => true,
                    'message' => 'Test email sent via ' . strtoupper($result['method']) . '. Check your inbox shortly.',
                    'method'  => $result['method'],
                ]);
            }
            jsonError('Test email failed. ' . $result['error'], 502);
        } else {
            jsonError('Invalid action. Use: test', 400);
        }
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
