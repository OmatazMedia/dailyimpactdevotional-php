<?php
/**
 * Daily Impact Devotional - Email Template Engine
 *
 * Included at the END of config/db.php (all db.php helpers exist at that
 * point). Provides:
 *   - emailTemplateDefaults() / emailTemplate() / renderEmailTemplate()
 *   - emailBrandHtml()  — branded, responsive HTML shell (logo header + social footer)
 *   - mailSendViaResend() / mailSendViaSmtp() / mailTransportSend()
 *   - sendCsv()         — stream a CSV download response
 *
 * Templates are overridable from the admin dashboard; saved overrides live in
 * the settings table as email_template_<key>_subject / email_template_<key>_body.
 */

// mbstring isn't always loaded in CLI/cron contexts — polyfill the two calls we use.
if (!function_exists('mb_substr')) {
    function mb_substr(string $s, int $a, ?int $b = null): string
    {
        return $b === null ? substr($s, $a) : substr($s, $a, $b);
    }
}

/** Default email templates (subject + HTML body fragment with {{token}} slots). */
function emailTemplateDefaults(): array
{
    $site = (string)getSetting('site_name', 'Daily Impact Devotional');
    return [
        'login_notification' => [
            'subject' => '🔐 New Admin Login — ' . $site,
            'body'    => <<<'HTML'
<h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.3;">New Admin Login Detected</h2>
<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">A new sign-in was recorded on your publisher portal. If this was <strong>not you</strong>, click the red button below to sign out <strong>every</strong> session immediately, then reset your password.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 18px;">
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Signed-in account</td></tr>
  <tr><td style="padding:12px 16px;color:#0f172a;font-size:14px;font-weight:700;">{{login_email}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">When</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;">{{login_time}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">IP address</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;font-family:monospace;">{{login_ip}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Location</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;">{{login_location}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Device / browser</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;">{{login_browser}}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
  <tr>
    <td style="padding:6px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="border-radius:10px;background:#dc2626;padding:12px 20px;">
          <a href="{{secureall_url}}" style="display:inline-block;color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;letter-spacing:.02em;">🔒 This wasn't me — Log out all sessions</a>
        </td>
      </tr></table>
    </td>
    <td style="padding:6px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="border-radius:10px;background:#0f766e;padding:12px 20px;">
          <a href="{{reset_url}}" style="display:inline-block;color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;letter-spacing:.02em;">Reset my password</a>
        </td>
      </tr></table>
    </td>
  </tr>
</table>
<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">If this was you, no action is needed. We send this alert every time a publisher signs in.</p>
HTML,
        ],
        'failed_login_alert' => [
            'subject' => '⚠️ Failed Login Attempt — ' . $site,
            'body'    => <<<'HTML'
<h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.3;">Failed Login Attempt</h2>
<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">Someone tried to sign in to the publisher portal with the wrong credentials. If you were not expecting this, it may be an attacker probing your account.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 18px;">
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Attempted email</td></tr>
  <tr><td style="padding:12px 16px;color:#0f172a;font-size:14px;font-weight:700;">{{login_email}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Time</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;">{{login_time}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">IP address</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;font-family:monospace;">{{login_ip}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Location</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;">{{login_location}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Attempts remaining before the IP is banned</td></tr>
  <tr><td style="padding:12px 16px;color:#dc2626;font-size:14px;font-weight:700;">{{attempts_remaining}}</td></tr>
</table>
<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">After repeated failures the IP is automatically banned from the admin portal. You can manage bans from the dashboard under Settings → Security.</p>
HTML,
        ],
        'donor_receipt' => [
            'subject' => '🙏 Thank You for Your Donation — ' . $site,
            'body'    => <<<'HTML'
<h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.3;">Thank you, {{donor_name}}! 🎉</h2>
<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">We are deeply grateful for your generous gift. Your donation of <strong style="font-size:18px;">{{donation_currency}} {{donation_amount}}</strong> has been received and will go directly towards spreading the gospel through our daily devotional ministry.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 18px;">
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Amount</td></tr>
  <tr><td style="padding:12px 16px;color:#0f766e;font-size:16px;font-weight:800;">{{donation_currency}} {{donation_amount}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Reference</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:13px;font-family:monospace;">{{donation_reference}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Date</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;">{{donation_date}}</td></tr>
</table>
<p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">May God bless you abundantly and reward your generosity. 🙏<br /><em>— The {{site_name}} Team</em></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
  <td style="border-radius:10px;background:#0f766e;padding:12px 22px;">
    <a href="{{site_url}}" style="display:inline-block;color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;letter-spacing:.02em;">Read today's devotional</a>
  </td>
</tr></table>
HTML,
        ],
        'password_reset' => [
            'subject' => '🔑 Password Reset Request — ' . $site,
            'body'    => <<<'HTML'
<h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.3;">Reset Your Password</h2>
<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">A password reset was requested for your publisher account. Click the button below to choose a new password — the link is valid for <strong>30 minutes</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
  <td style="border-radius:10px;background:#0f766e;padding:12px 22px;">
    <a href="{{reset_url}}" style="display:inline-block;color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;letter-spacing:.02em;">Set a new password</a>
  </td>
</tr></table>
<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">If you did not request this, you can safely ignore this email — your password stays unchanged.</p>
HTML,
        ],
        'new_ip_ban' => [
            'subject' => '🚫 New IP Ban — ' . $site,
            'body'    => <<<'HTML'
<h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.3;">A New IP Ban Was Created</h2>
<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">An IP address was banned from the admin portal, automatically or by an administrator.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 18px;">
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">IP address</td></tr>
  <tr><td style="padding:12px 16px;color:#0f172a;font-size:14px;font-family:monospace;font-weight:700;">{{ban_ip}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Subnet</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:13px;font-family:monospace;">{{ban_cidr}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Reason</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;">{{ban_reason}}</td></tr>
</table>
<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">Manage or whitelist this IP from the dashboard under Settings → Security.</p>
HTML,
        ],
        'ip_unbanned' => [
            'subject' => '✅ IP Ban Removed — ' . $site,
            'body'    => <<<'HTML'
<h2 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.3;">An IP Ban Was Removed</h2>
<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">An administrator lifted the ban on the following IP address — it can now access the admin portal again.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 18px;">
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">IP address</td></tr>
  <tr><td style="padding:12px 16px;color:#0f172a;font-size:14px;font-family:monospace;font-weight:700;">{{ban_ip}}</td></tr>
  <tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Unbanned by</td></tr>
  <tr><td style="padding:12px 16px;color:#334155;font-size:14px;">{{unban_by}}</td></tr>
</table>
HTML,
        ],
    ];
}

/** Load a template: settings overrides fall back to the built-in defaults. */
function emailTemplate(string $key): array
{
    $defaults = emailTemplateDefaults();
    $base = $defaults[$key] ?? ['subject' => ucwords(str_replace('_', ' ', $key)), 'body' => ''];
    $subject = (string)getSetting('email_template_' . $key . '_subject', $base['subject']);
    $body    = (string)getSetting('email_template_' . $key . '_body', $base['body']);
    return ['subject' => $subject, 'body' => $body];
}

/** Replace {{tokens}} in a string; unknown tokens are left untouched. */
function emailSubstitute(string $text, array $tokens): string
{
    $pairs = [];
    foreach ($tokens as $k => $v) {
        $pairs['{{' . $k . '}}'] = (string)$v;
    }
    return $pairs ? strtr($text, $pairs) : $text;
}

/**
 * Render a template into {subject, text, html}.
 * $tokens are merged over the always-available site tokens.
 */
function renderEmailTemplate(string $key, array $tokens = []): array
{
    $tpl = emailTemplate($key);
    $site = (string)getSetting('site_name', 'Daily Impact Devotional');
    $base = [
        'site_name' => $site,
        'site_url'  => siteAbsoluteUrl(''),
        'year'      => date('Y'),
    ];
    $all = array_merge($base, $tokens);
    $subject = emailSubstitute($tpl['subject'], $all);
    $bodyHtml = emailSubstitute($tpl['body'], $all);
    $title = preg_replace('/\s+/', ' ', trim(strip_tags(str_replace(['<h2', '</h2>'], ['<p', '</p>'], $bodyHtml))));
    $title = $title !== '' ? mb_substr($title, 0, 120) : $site;
    return [
        'subject' => $subject,
        'text'    => trim(html_entity_decode(strip_tags($bodyHtml), ENT_QUOTES, 'UTF-8')),
        'html'    => emailBrandHtml($title, $bodyHtml),
    ];
}

/**
 * Branded responsive HTML email shell — logo header, content block, and a
 * social footer mirroring the website. Inline CSS + table layout so it renders
 * correctly in Gmail, Outlook, Apple Mail and mobile clients.
 */
function emailBrandHtml(string $title, string $bodyHtml): string
{
    $site = (string)getSetting('site_name', 'Daily Impact Devotional');
    $siteEsc = htmlspecialchars($site, ENT_QUOTES, 'UTF-8');
    $logo = siteLogoUrl();
    $logoEsc = htmlspecialchars($logo, ENT_QUOTES, 'UTF-8');
    $social = emailSocialLinks();
    $year = date('Y');

    $socialHtml = '';
    $labels = ['facebook' => 'Facebook', 'twitter' => 'X / Twitter', 'instagram' => 'Instagram', 'youtube' => 'YouTube'];
    foreach ($labels as $k => $label) {
        $url = trim((string)($social[$k] ?? ''));
        if ($url === '') continue;
        $socialHtml .= '<a href="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '" style="color:#0f766e;text-decoration:none;font-size:12px;font-weight:700;padding:0 6px;">' . $label . '</a>';
    }
    if ($socialHtml === '') $socialHtml = '<span style="color:#94a3b8;font-size:11px;">Follow us on social media</span>';

    return <<<HTML
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>{$title}</title>
<style>
  @media only screen and (max-width:600px){
    .wrap{width:100% !important;}
    .pad{padding:20px 18px !important;}
    .btn{display:block !important;width:100% !important;text-align:center !important;padding:13px 10px !important;}
    .hdr img{max-height:46px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <center>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <!-- Header: logo + site name. Light grey background so the black
               logo is clearly visible (a dark header would swallow it). -->
          <tr>
            <td class="hdr" style="background:#f1f5f9;padding:26px 28px;text-align:center;border-bottom:1px solid #e2e8f0;">
              <img src="{$logoEsc}" alt="{$siteEsc}" style="max-height:56px;width:auto;display:inline-block;vertical-align:middle;" />
              <p style="margin:8px 0 0;color:#475569;font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:800;">{$site}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="pad" style="padding:30px 28px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-family:Arial,Helvetica,sans-serif;">{$bodyHtml}</div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 28px;border-top:1px solid #e2e8f0;text-align:center;">
              <div style="margin:0 0 10px;">{$socialHtml}</div>
              <p style="margin:0 0 6px;color:#475569;font-size:11px;line-height:1.6;">{$site} — Daily devotions to strengthen your faith and impact your world.</p>
              <p style="margin:0;color:#94a3b8;font-size:10px;line-height:1.5;">© {$year} {$site}. All rights reserved.<br />You are receiving this email because of activity on your account or a recent donation.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  </center>
</body>
</html>
HTML;
}

/**
 * Send one queued row via the Resend API.
 * @return array{success:bool, error:string}
 */
function mailSendViaResend(array $row): array
{
    $apiKey = (string)getSetting('resend_api_key', '');
    // Per-row From identity (e.g. donation receipts) overrides the global one.
    $fromEmail = !empty($row['from_email']) ? (string)$row['from_email'] : (string)getSetting('resend_from_email', '');
    $fromName = !empty($row['from_name']) ? (string)$row['from_name'] : (string)getSetting('resend_from_name', 'Daily Impact Devotional');
    $replyTo = (string)getSetting('resend_reply_to', '');
    $enabled = getSetting('resend_enabled', 'true') === 'true';

    if (!$enabled || $apiKey === '' || $fromEmail === '') {
        return ['success' => false, 'error' => 'Resend not configured (enabled=' . var_export($enabled, true) . ')'];
    }

    $from = $fromName !== '' ? "{$fromName} <{$fromEmail}>" : $fromEmail;
    $data = [
        'from'    => $from,
        'to'      => [(string)$row['to_email']],
        'subject' => (string)$row['subject'],
        'text'    => (string)$row['body'],
    ];
    if (!empty($row['html'])) {
        $data['html'] = (string)$row['html'];
    }
    if ($replyTo !== '') {
        $data['reply_to'] = $replyTo;
    }

    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $apiKey, 'Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        return ['success' => true, 'error' => ''];
    }
    return ['success' => false, 'error' => 'Resend HTTP ' . $httpCode . ' ' . ($curlErr !== '' ? $curlErr : mb_substr((string)$response, 0, 200))];
}

/**
 * Send one queued row via SMTP (PHPMailer when available, mail() fallback).
 * @return array{success:bool, error:string}
 */
function mailSendViaSmtp(array $row): array
{
    $host = (string)getSetting('smtp_host', '');
    $user = (string)getSetting('smtp_user', '');
    $pass = (string)getSetting('smtp_pass', '');
    $port = (string)getSetting('smtp_port', '587');
    $secure = (string)getSetting('smtp_secure', 'tls');
    $enabled = getSetting('smtp_enabled', 'false') === 'true';

    if (!$enabled || $host === '' || $user === '') {
        return ['success' => false, 'error' => 'SMTP not configured (enabled=' . var_export($enabled, true) . ')'];
    }

    $fromEmail = !empty($row['from_email']) ? (string)$row['from_email'] : (string)getSetting('resend_from_email', '');
    $fromName = !empty($row['from_name']) ? (string)$row['from_name'] : (string)getSetting('resend_from_name', 'Daily Impact Devotional');

    try {
        if (class_exists('PHPMailer\PHPMailer\PHPMailer')) {
            $mail = new PHPMailer\PHPMailer\PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = $host;
            $mail->SMTPAuth = true;
            $mail->Username = $user;
            $mail->Password = $pass;
            $mail->SMTPSecure = ($secure === 'none') ? false : $secure;
            $mail->Port = (int)$port;
            $mail->CharSet = 'UTF-8';
            $mail->setFrom($fromEmail, $fromName);
            $mail->addAddress((string)$row['to_email']);
            $mail->Subject = (string)$row['subject'];
            if (!empty($row['html'])) {
                $mail->isHTML(true);
                $mail->Body = (string)$row['html'];
                $mail->AltBody = (string)$row['body'];
            } else {
                $mail->isHTML(false);
                $mail->Body = (string)$row['body'];
            }
            $mail->send();
            return ['success' => true, 'error' => ''];
        }

        // Fallback to PHP mail() (not recommended for production).
        $headers = "MIME-Version: 1.0\r\n";
        if (!empty($row['html'])) {
            $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        } else {
            $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
        }
        $headers .= "From: {$fromName} <{$fromEmail}>\r\n";
        $headers .= "Reply-To: {$fromEmail}\r\n";
        $ok = @mail((string)$row['to_email'], (string)$row['subject'], !empty($row['html']) ? (string)$row['html'] : (string)$row['body'], $headers);
        return $ok
            ? ['success' => true, 'error' => '']
            : ['success' => false, 'error' => 'mail() returned false'];
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'SMTP: ' . $e->getMessage()];
    }
}

/**
 * Deliver one queued row using the PRIMARY transport (mail_method), falling
 * back to the secondary automatically when the primary is unconfigured/fails.
 * @return array{success:bool, method:string, error:string}
 */
function mailTransportSend(array $row): array
{
    $primary = (string)getSetting('mail_method', 'resend');
    if ($primary !== 'smtp') $primary = 'resend';

    // The SECONDARY is stored explicitly (mail_method_secondary); fall back to
    // the non-primary transport when unset or when it duplicates the primary.
    $secondary = (string)getSetting('mail_method_secondary', '');
    if ($secondary !== 'smtp' && $secondary !== 'resend') {
        $secondary = $primary === 'smtp' ? 'resend' : 'smtp';
    }
    if ($secondary === $primary) {
        $secondary = $primary === 'smtp' ? 'resend' : 'smtp';
    }
    $order = [$primary, $secondary];

    foreach ($order as $method) {
        $result = $method === 'smtp'
            ? mailSendViaSmtp($row)
            : mailSendViaResend($row);
        if ($result['success']) {
            return ['success' => true, 'method' => $method, 'error' => ''];
        }
    }
    $method = $order[0];
    return ['success' => false, 'method' => $method, 'error' => 'Both transports failed. Primary (' . $method . '): ' . ($order[0] === 'smtp' ? mailSendViaSmtp($row)['error'] : mailSendViaResend($row)['error'])];
}

/**
 * Whether a notification event should send email.
 * Events: login, failed_login, ip_ban, donation. Each is toggled from
 * Settings → Email (stored as notify_event_<event>). Default: on.
 */
function notifyEventEnabled(string $event): bool
{
    $key = 'notify_event_' . preg_replace('/[^a-z0-9_]/i', '', $event);
    return (string)getSetting($key, 'true') !== 'false';
}

/**
 * Validated recipient list for a notification event. Reads the event's primary
 * setting (comma-separated emails) and falls back to a legacy key when empty.
 */
function notifyRecipients(string $settingKey, string $fallbackKey = ''): array
{
    $list = trim((string)getSetting($settingKey, ''));
    $out = [];
    if ($list !== '') {
        foreach (explode(',', $list) as $email) {
            $email = trim($email);
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) $out[] = $email;
        }
    }
    // Fall back when the primary list is empty OR contains no valid addresses.
    if ($out === [] && $fallbackKey !== '') {
        return notifyRecipients($fallbackKey);
    }
    return $out;
}

/** Stream a CSV download (used by login audit + IP ban exports). */
function sendCsv(array $headers, array $rows, string $filename): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $filename) . '"');
    header('Cache-Control: no-store');
    $out = fopen('php://output', 'w');
    fputcsv($out, $headers);
    foreach ($rows as $r) {
        fputcsv($out, $r);
    }
    fclose($out);
    exit;
}
