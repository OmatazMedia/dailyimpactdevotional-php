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
 * Daily Impact Devotional - Custom Help Center Topics API
 *
 * GET  /api/help                      - List custom help guides (any logged-in
 *                                       admin can read — restricted roles still
 *                                       see the guides for their own sections).
 * POST /api/help  { action: 'save'|'delete', ... }
 *                                     - Administrator-only (settings section):
 *                                       upsert or remove a custom guide. Guides
 *                                       are stored in the settings table under
 *                                       'help_topics' and rendered by the
 *                                       Help Center alongside the built-in ones.
 *
 * Guide body uses a tiny line format: "## Heading", "- bullet", plain
 * paragraphs. Content is rendered as escaped text nodes in the app (never as
 * HTML), so no injection surface exists; the server enforces length caps and
 * keeps the raw text so legitimate characters like "<" and ">" survive.
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$SECTIONS = [
    'overview', 'add-devotional', 'manage-devotionals', 'import-devotional',
    'header-images', 'user-management', 'telegram-integration', 'foreword',
    'payments', 'analytics', 'settings',
];
$SUBTABS = ['profile', 'security', 'assets', 'email', 'templates', 'payments', 'roles'];

function loadHelpTopics(): array
{
    $raw = json_decode((string)getSetting('help_topics', '[]'), true);
    return is_array($raw) ? $raw : [];
}

$method = httpMethod();

switch ($method) {
    case 'GET':
        requireSection('overview');
        jsonResponse(['success' => true, 'topics' => loadHelpTopics()]);
        break;

    case 'POST':
        requireSection('settings');
        $input = jsonInput();
        $action = (string)($input['action'] ?? '');
        $list = loadHelpTopics();

        if ($action === 'delete') {
            $id = trim((string)($input['id'] ?? ''));
            $kept = [];
            foreach ($list as $t) {
                if ((string)($t['id'] ?? '') !== $id) $kept[] = $t;
            }
            setSetting('help_topics', json_encode($kept));
            logActivity('settings', 'Removed a custom Help Center guide.');
            jsonResponse(['success' => true, 'topics' => $kept]);
        }

        if ($action === 'save') {
            $t = is_array($input['topic'] ?? null) ? $input['topic'] : [];

            $title   = trim((string)($t['title'] ?? ''));
            $summary = trim((string)($t['summary'] ?? ''));
            $body    = trim((string)($t['body'] ?? ''));
            $section = (string)($t['section'] ?? '');
            $tab     = (string)($t['goTo']['tab'] ?? '');
            $subTab  = (string)($t['goTo']['subTab'] ?? '');

            $keywords = [];
            if (is_array($t['keywords'] ?? null)) {
                foreach ($t['keywords'] as $k) {
                    $k = trim((string)$k);
                    if ($k !== '' && !in_array($k, $keywords, true)) $keywords[] = mb_substr($k, 0, 60);
                }
            }

            if ($title === '' || mb_strlen($title) > 120) {
                jsonError('Guide title is required (max 120 characters).', 400);
            }
            if ($body === '' || mb_strlen($body) > 4000) {
                jsonError('Guide body is required (max 4000 characters).', 400);
            }
            if (mb_strlen($summary) > 200) {
                jsonError('Guide summary is too long (max 200 characters).', 400);
            }
            if (!in_array($section, $SECTIONS, true)) {
                jsonError('Invalid section.', 400);
            }
            if (!in_array($tab, $SECTIONS, true)) {
                jsonError('Invalid target page.', 400);
            }
            if ($subTab !== '' && !in_array($subTab, $SUBTABS, true)) {
                $subTab = '';
            }

            $id = trim((string)($t['id'] ?? ''));
            if ($id === '') $id = bin2hex(random_bytes(8));

            $entry = [
                'id'       => $id,
                'section'  => $section,
                'title'    => $title,
                'summary'  => $summary,
                'keywords' => array_slice($keywords, 0, 12),
                'goTo'     => ['tab' => $tab, 'subTab' => $subTab],
                'body'     => $body,
            ];

            $found = false;
            foreach ($list as $i => $ex) {
                if ((string)($ex['id'] ?? '') === $id) {
                    $list[$i] = $entry;
                    $found = true;
                    break;
                }
            }
            if (!$found) $list[] = $entry;

            setSetting('help_topics', json_encode(array_values($list)));
            logActivity('settings', 'Saved a custom Help Center guide: ' . $title);
            jsonResponse(['success' => true, 'topics' => array_values($list)]);
        }

        jsonError('Invalid action. Use: save | delete', 400);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
