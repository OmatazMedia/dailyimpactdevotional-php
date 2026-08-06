<?php
/**
 * Daily Impact Devotional - Dynamic Open Graph Endpoint
 *
 * GET /backend/api/og.php?devotional=<id>
 *
 * When a devotional is shared (e.g. https://yourdomain.com/?devotional=ID),
 * social platforms (WhatsApp, Telegram, Facebook, Twitter/X, LinkedIn) fetch
 * the URL with a bot user-agent. The root .htaccess routes those requests
 * here instead of the SPA, so the preview card shows the DEVOTIONAL'S OWN
 * banner image + title instead of the generic homepage image.
 *
 * The meta tags are rendered server-side from the database; a <meta refresh>
 * bounces real browsers back to the SPA, while crawlers keep the tags.
 */

require_once __DIR__ . '/../config/db.php';

// ─── Resolve requested devotional ────────────────────────────────────────────
$devotionalId = trim((string)($_GET['devotional'] ?? $_GET['id'] ?? ''));
$dev = null;
$title = 'Daily Impact Devotional | Dr. Andy Osakwe';
$description = 'Start every day with God\'s Word. Daily scripture readings, prayer confessions, and spirit-filled teachings by Dr. Andy Osakwe of Andrew Osakwe Ministries International.';
$dateLine = '';

if ($devotionalId !== '' && $pdo instanceof PDO) {
    try {
        // 1) Direct UUID lookup (legacy share links)
        $stmt = $pdo->prepare(
            "SELECT id, date, year, title, scripture_ref, scripture_text, paragraphs, image_url
             FROM devotionals WHERE id = ? LIMIT 1"
        );
        $stmt->execute([$devotionalId]);
        $dev = $stmt->fetch();

        // 2) Date-slug lookup: ?devotional=5-aug-2025
        if (!$dev && preg_match('/^(\d{1,2})-([a-z]{3})-([0-9]{4})$/i', $devotionalId, $m)) {
            $day = (int)$m[1];
            $monthShort = strtolower($m[2]);
            $year = (int)$m[3];
            $monthShortToName = [
                'jan' => 'January', 'feb' => 'February', 'mar' => 'March', 'apr' => 'April',
                'may' => 'May', 'jun' => 'June', 'jul' => 'July', 'aug' => 'August',
                'sep' => 'September', 'oct' => 'October', 'nov' => 'November', 'dec' => 'December',
            ];
            if (isset($monthShortToName[$monthShort])) {
                // Match by year, then filter in PHP (handles both "August 5" and "5 August" formats).
                $stmt = $pdo->prepare(
                    "SELECT id, date, year, title, scripture_ref, scripture_text, paragraphs, image_url
                     FROM devotionals WHERE year = ?"
                );
                $stmt->execute([$year]);
                while ($row = $stmt->fetch()) {
                    $parts = parseDateParts((string)($row['date'] ?? ''));
                    if (isset($parts['month'], $parts['day'])
                        && strtolower(substr($parts['month'], 0, 3)) === $monthShort
                        && (int)$parts['day'] === $day) {
                        $dev = $row;
                        break;
                    }
                }
            }
        }
    } catch (Throwable $e) {
        $dev = null;
    }
}

// ─── Build meta values ───────────────────────────────────────────────────────
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
$base   = $scheme . '://' . $host;

// Resolve the share image: devotional image_url → mapped header for its date → logo.
// The logo (dailyimpact.png) ships with every install, so the card ALWAYS has an image
// on any domain the app is deployed on.
$imageUrl = $base . '/assets/images/dailyimpact.png';
$isLogo = true; // tracks whether the emitted image is the square logo (type/dimensions below)
$shareUrl = $base . '/';

if ($dev) {
    $devTitle = trim(strip_tags((string)($dev['title'] ?? '')));
    if ($devTitle !== '') {
        $title = $devTitle;
    }
    $dateLine = trim((string)($dev['date'] ?? '')) . ', ' . (int)($dev['year'] ?? 0);

    // First paragraph → description (strip HTML, truncate to ~200 chars).
    $paragraphs = json_decode((string)($dev['paragraphs'] ?? '[]'), true);
    if (is_array($paragraphs)) {
        foreach ($paragraphs as $p) {
            $plain = trim(strip_tags((string)$p));
            if ($plain !== '') {
                $description = mb_substr($plain, 0, 200) . (mb_strlen($plain) > 200 ? '…' : '');
                break;
            }
        }
    }
    if ($dateLine !== '') {
        $description = $dateLine . ' — ' . $description;
    }

    $shareUrl = $base . '/?devotional=' . rawurlencode((string)$dev['id']);

    // Prefer the date-slug URL (matches the actual share links the SPA emits,
    // e.g. ?devotional=5-aug-2025) so crawlers cache the card under the SAME
    // URL people share — avoids split preview caches between slug and UUID.
    $devParts = parseDateParts((string)($dev['date'] ?? ''));
    if (isset($devParts['month'], $devParts['day']) && (int)($dev['year'] ?? 0) > 0) {
        $shareUrl = $base . '/?devotional=' . (int)$devParts['day'] . '-' . strtolower(substr($devParts['month'], 0, 3)) . '-' . (int)$dev['year'];
    }

    // 1) Devotional's own image (absolute or site-relative — always emit an absolute URL)
    $ownImage = trim((string)($dev['image_url'] ?? ''));
    if ($ownImage !== '') {
        if (str_starts_with($ownImage, 'http')) {
            $imageUrl = $ownImage;
        } else {
            $imageUrl = $base . '/' . ltrim($ownImage, '/');
        }
        $isLogo = false;
    } else {
        // 2) Mapped header image for the devotional's date
        $parts = parseDateParts((string)($dev['date'] ?? ''));
        try {
            $stmt = $pdo->prepare(
                "SELECT file_path, data_url FROM header_mappings WHERE LOWER(date_key) = LOWER(?) LIMIT 1"
            );
            $stmt->execute([$parts['month'] . ' ' . $parts['day']]);
            $header = $stmt->fetch();
            if ($header) {
                if (!empty($header['file_path'])) {
                    // Encode every path segment (paths can contain spaces, e.g. "devotional headers/…")
                    // so crawlers receive a valid image URL.
                    $imageUrl = $base . '/' . implode('/', array_map('rawurlencode', explode('/', ltrim((string)$header['file_path'], '/'))));
                    $isLogo = false;
                } elseif (!empty($header['data_url']) && str_starts_with((string)$header['data_url'], 'data:image')) {
                    // Persist base64 mapping to a temp file so crawlers can read it.
                    $base64Data = preg_replace('/^data:image\/\w+;base64,/', '', (string)$header['data_url']);
                    $tmpDir = ensureUploadDir('headers/tmp');
                    $tmpFile = $tmpDir . '/tmp_' . strtolower($parts['month']) . '_' . $parts['day'] . '.jpg';
                    if (!file_exists($tmpFile) && $base64Data !== null) {
                        @file_put_contents($tmpFile, base64_decode((string)$base64Data));
                    }
                    $imageUrl = $base . '/upload/headers/tmp/tmp_' . strtolower($parts['month']) . '_' . $parts['day'] . '.jpg';
                    $isLogo = false;
                }
            }
        } catch (Throwable $e) {
            // fall back to default image
        }
    }
}

$title = mb_substr($title, 0, 120);
$description = mb_substr($description, 0, 280);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$ogTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
$ogDesc  = htmlspecialchars($description, ENT_QUOTES, 'UTF-8');
$ogImage = htmlspecialchars($imageUrl, ENT_QUOTES, 'UTF-8');
$ogUrl   = htmlspecialchars($shareUrl, ENT_QUOTES, 'UTF-8');
$refresh = htmlspecialchars($shareUrl, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><?= $ogTitle ?></title>
    <meta name="description" content="<?= $ogDesc ?>" />

    <!-- Open Graph (WhatsApp, Telegram, Facebook, LinkedIn) -->
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Daily Impact Devotional" />
    <meta property="og:title" content="<?= $ogTitle ?>" />
    <meta property="og:description" content="<?= $ogDesc ?>" />
    <meta property="og:image" content="<?= $ogImage ?>" />
    <meta property="og:image:secure_url" content="<?= $ogImage ?>" />
    <meta property="og:image:type" content="<?= $isLogo ? 'image/png' : 'image/jpeg' ?>" />
    <meta property="og:image:width" content="<?= $isLogo ? '512' : '1200' ?>" />
    <meta property="og:image:height" content="<?= $isLogo ? '512' : '630' ?>" />
    <meta property="og:image:alt" content="<?= $ogTitle ?>" />
    <meta property="og:url" content="<?= $ogUrl ?>" />
    <meta property="og:locale" content="en_NG" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="<?= $ogTitle ?>" />
    <meta name="twitter:description" content="<?= $ogDesc ?>" />
    <meta name="twitter:image" content="<?= $ogImage ?>" />
    <meta name="twitter:image:type" content="<?= $isLogo ? 'image/png' : 'image/jpeg' ?>" />
    <meta name="twitter:image:alt" content="<?= $ogTitle ?>" />

    <link rel="canonical" href="<?= $ogUrl ?>" />

    <!-- Real browsers land on the app; crawlers keep the tags above. -->
    <meta http-equiv="refresh" content="0;url=<?= $refresh ?>" />
</head>
<body>
    <p>Redirecting to <a href="<?= $ogUrl ?>">Daily Impact Devotional</a>…</p>
</body>
</html>
