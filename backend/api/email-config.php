<?php
/**
 * Daily Impact Devotional - Email Configuration API
 * 
 * GET    /api/email-config - Get email configuration
 * PUT    /api/email-config - Update email configuration
 * POST   /api/email-config/test - Test email configuration
 */

require_once __DIR__ . '/../config/db.php';
requireAdmin();
sendCorsHeaders();

$method = httpMethod();
$action = $_GET['action'] ?? '';

switch ($method) {
    case 'GET':
        // Get email configuration
        $config = [
            'mailMethod' => getSetting('mail_method', 'resend'),
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
            'notifyEmails' => getSetting('security_notify_emails', '')
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
        
        // Update mail method
        if (isset($input['mailMethod'])) {
            setSetting('mail_method', $input['mailMethod']);
        }
        
        // Update Resend settings
        if (isset($input['resend'])) {
            if (isset($input['resend']['apiKey'])) {
                // Only update if not masked — stored encrypted via setSecretSetting
                if (strpos($input['resend']['apiKey'], '...') === false) {
                    setSecretSetting('resend_api_key', $input['resend']['apiKey']);
                }
            }
            if (isset($input['resend']['fromEmail'])) {
                setSetting('resend_from_email', $input['resend']['fromEmail']);
            }
            if (isset($input['resend']['fromName'])) {
                setSetting('resend_from_name', $input['resend']['fromName']);
            }
            if (isset($input['resend']['replyTo'])) {
                setSetting('resend_reply_to', $input['resend']['replyTo']);
            }
            if (isset($input['resend']['enabled'])) {
                setSetting('resend_enabled', $input['resend']['enabled'] ? 'true' : 'false');
            }
        }
        
        // Update SMTP settings
        if (isset($input['smtp'])) {
            if (isset($input['smtp']['host'])) {
                setSetting('smtp_host', $input['smtp']['host']);
            }
            if (isset($input['smtp']['user'])) {
                setSetting('smtp_user', $input['smtp']['user']);
            }
            if (isset($input['smtp']['pass'])) {
                // Only update if not masked — stored encrypted via setSecretSetting
                if ($input['smtp']['pass'] !== '********') {
                    setSecretSetting('smtp_pass', $input['smtp']['pass']);
                }
            }
            if (isset($input['smtp']['port'])) {
                setSetting('smtp_port', $input['smtp']['port']);
            }
            if (isset($input['smtp']['secure'])) {
                setSetting('smtp_secure', $input['smtp']['secure']);
            }
            if (isset($input['smtp']['enabled'])) {
                setSetting('smtp_enabled', $input['smtp']['enabled'] ? 'true' : 'false');
            }
        }
        
        // Update security notification emails
        if (isset($input['notifyEmails'])) {
            setSetting('security_notify_emails', $input['notifyEmails']);
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
            $subject = "📧 Email Configuration Test — Daily Impact Devotional";
            $body = "This is a test email to verify your email configuration is working correctly.\n\n"
                  . "Mail Method: {$mailMethod}\n"
                  . "Sent at: " . date('Y-m-d H:i:s') . "\n\n"
                  . "If you received this email, your configuration is working!";
            
            // Queue the test email
            queueMail($testEmail, $subject, $body);
            
            jsonResponse([
                'success' => true,
                'message' => 'Test email queued for sending. Check your inbox shortly.'
            ]);
        } else {
            jsonError('Invalid action. Use: test', 400);
        }
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}