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
 * Daily Impact Devotional - Devotionals API
 * 
 * GET    /api/devotionals          - List all devotionals
 * POST   /api/devotionals          - Create a new devotional
 * POST   /api/devotionals/bulk     - Bulk import devotionals
 * PUT    /api/devotionals?id=X     - Update a devotional
 * DELETE /api/devotionals?id=X     - Delete a devotional
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/tg-schedule.php';
sendCorsHeaders();

// Current time (HH:MM) in the admin timezone — used when Telegram mode is
// 'immediate' so the row is scheduled for the NEXT cron tick (posts right away).
function tgImmediatePostTime(): string {
    $settings = getSettings();
    $tz = $settings['admin_timezone'] ?? 'Africa/Lagos';
    try {
        return (new DateTime('now', new DateTimeZone($tz)))->format('H:i');
    } catch (Exception $e) {
        return date('H:i');
    }
}

// Auto-schedule a freshly-saved devotional for Telegram. Respects the
// telegram_enabled + telegram_schedule_mode settings: 'manual' skips, other
// modes schedule the row for the devotional's own date (dropping on its own).
// 'immediate' schedules with the current time so the next cron tick posts it.
function tgAutoScheduleOnUpload(array $saved): void {
    try {
        $settings = getSettings();
        if (($settings['telegram_enabled'] ?? 'false') !== 'true') return;
        $mode = $settings['telegram_schedule_mode'] ?? 'scheduled';
        if ($mode === 'manual') return;
        $postTime = $mode === 'immediate' ? tgImmediatePostTime() : null;
        tgScheduleDevotional($saved, $postTime);
    } catch (Throwable $e) {
        // Scheduling is best-effort — never fail a devotional save over it.
    }
}

$method = httpMethod();
$id     = $_GET['id'] ?? null;
$isBulk = isset($_GET['bulk']) || (isset($_SERVER['REQUEST_URI']) && str_ends_with(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '', '/bulk'));

switch ($method) {
    case 'GET':
        // GET /api/devotionals - List all, chronologically ordered.
        // IMPORTANT: dates are stored as "Month Day" strings (e.g. "July 20"), so
        // a plain ORDER BY date ASC sorts month NAMES alphabetically (August < July)
        // and scrambles the list. Order by year, then numeric month (via FIELD),
        // then day-of-month so rows come back in calendar order.
        try {
            $stmt = $pdo->query(
                "SELECT * FROM devotionals
                 ORDER BY year ASC,
                   FIELD(LOWER(SUBSTRING_INDEX(date, ' ', 1)),
                     'january','february','march','april','may','june',
                     'july','august','september','october','november','december'),
                   CAST(SUBSTRING_INDEX(date, ' ', -1) AS UNSIGNED) ASC"
            );
            $devotionals = $stmt->fetchAll();
        } catch (Exception $e) {
            // If query fails (e.g., table doesn't exist), return empty list
            $devotionals = [];
        }

        // Map DB rows to the camelCase shape the frontend expects (scriptureRef,
        // imageUrl, ...). Previously the GET returned snake_case keys while the
        // React app reads camelCase, so after a reload the homepage lost the
        // scripture/prayer/bible sections, the mapped header image, and the
        // admin edit form prefilled empty. Also decode paragraphs JSON and scrub
        // invalid UTF-8 so json_encode() can never fail on imported DOCX content.
        $mapped = [];
        foreach ($devotionals as $dev) {
            $paras = $dev['paragraphs'] ?? '[]';
            $decoded = json_decode($paras, true);
            $mapped[] = utf8Safe([
                'id'                  => (string)$dev['id'],
                'date'                => (string)($dev['date'] ?? ''),
                'year'                => (int)($dev['year'] ?? 0),
                'title'               => (string)($dev['title'] ?? ''),
                'scriptureRef'        => (string)($dev['scripture_ref'] ?? ''),
                'scriptureText'       => (string)($dev['scripture_text'] ?? ''),
                'paragraphs'          => is_array($decoded) ? $decoded : [],
                'additionalScripture' => (string)($dev['additional_scripture'] ?? ''),
                'prayerConfession'    => (string)($dev['prayer_confession'] ?? ''),
                'bibleReading'        => (string)($dev['bible_reading'] ?? ''),
                'author'              => (string)($dev['author'] ?? 'Dr. Andy Osakwe'),
                'imageUrl'            => (string)($dev['image_url'] ?? ''),
            ]);
        }

        jsonResponse($mapped);
        break;

    case 'POST':
        requireAnySection(['add-devotional', 'manage-devotionals', 'import-devotional']);
        if ($isBulk) {
            // POST /api/devotionals/bulk - Bulk import
            $input = jsonInput();
            $incoming = $input['devotionals'] ?? [];

            if (empty($incoming)) {
                jsonError('No devotionals provided');
            }

        $stmt = $pdo->prepare(
            "INSERT INTO devotionals (id, date, year, title, scripture_ref, scripture_text, paragraphs, additional_scripture, prayer_confession, bible_reading, author, image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );            $saved = [];
            logActivity('devotional_bulk_import', 'Bulk import started (' . count($incoming) . ' entries).', 'devotional');
            foreach ($incoming as $dev) {
                $devId = generateId();
            $paras = isset($dev['paragraphs']) ? json_encode(utf8Safe($dev['paragraphs']), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) : '[]';
            if ($paras === false) $paras = '[]';

                // Remove existing entries with same date+year
                $del = $pdo->prepare("DELETE FROM devotionals WHERE date = ? AND year = ?");
                $del->execute([$dev['date'] ?? '', $dev['year'] ?? 0]);

                $stmt->execute([
                    $devId,
                    $dev['date'] ?? '',
                    $dev['year'] ?? date('Y'),
                    $dev['title'] ?? '',
                    $dev['scriptureRef'] ?? $dev['scripture_ref'] ?? '',
                    $dev['scriptureText'] ?? $dev['scripture_text'] ?? '',
                    $paras,
                    $dev['additionalScripture'] ?? $dev['additional_scripture'] ?? '',
                    $dev['prayerConfession'] ?? $dev['prayer_confession'] ?? '',
                    $dev['bibleReading'] ?? $dev['bible_reading'] ?? '',
                    $dev['author'] ?? 'Dr. Andy Osakwe',
                    $dev['imageUrl'] ?? $dev['image_url'] ?? '',
                ]);

                $saved[] = [
                    'id' => $devId,
                    'date' => $dev['date'] ?? '',
                    'year' => $dev['year'] ?? date('Y'),
                    'title' => $dev['title'] ?? '',
                    'scriptureRef' => $dev['scriptureRef'] ?? $dev['scripture_ref'] ?? '',
                    'scriptureText' => $dev['scriptureText'] ?? $dev['scripture_text'] ?? '',
                    'paragraphs' => $dev['paragraphs'] ?? [],
                    'additionalScripture' => $dev['additionalScripture'] ?? $dev['additional_scripture'] ?? '',
                    'prayerConfession' => $dev['prayerConfession'] ?? $dev['prayer_confession'] ?? '',
                    'bibleReading' => $dev['bibleReading'] ?? $dev['bible_reading'] ?? '',
                    'author' => $dev['author'] ?? 'Dr. Andy Osakwe',
                    'imageUrl' => $dev['imageUrl'] ?? $dev['image_url'] ?? '',
                ];
            }

            // Drop any reaction votes left pointing at rows the import replaced,
            // so counts stay honest. Runs once AFTER the loop — not per entry.
            try {
                $pdo->exec(
                    "DELETE FROM devotional_reaction_votes WHERE devotional_id NOT IN (SELECT id FROM devotionals)"
                );
            } catch (Exception $e) {
                // table may not exist yet
            }

            // Auto-schedule every imported devotional for its own Telegram date.
            foreach ($saved as $savedDev) {
                tgAutoScheduleOnUpload($savedDev);
            }

            logActivity('devotional_bulk_import', 'Bulk import completed (' . count($saved) . ' entries saved).', 'devotional');
            jsonResponse($saved, 201);

        } else {
            // POST /api/devotionals - Create single
            $input = jsonInput();
            $input = utf8Safe($input);
            $devId = generateId();
            $paras = isset($input['paragraphs']) ? json_encode($input['paragraphs'], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) : '[]';
            if ($paras === false) $paras = '[]';

            $stmt = $pdo->prepare(
                "INSERT INTO devotionals (id, date, year, title, scripture_ref, scripture_text, paragraphs, additional_scripture, prayer_confession, bible_reading, author, image_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            $stmt->execute([
                $devId,
                $input['date'] ?? '',
                $input['year'] ?? date('Y'),
                $input['title'] ?? '',
                $input['scriptureRef'] ?? $input['scripture_ref'] ?? '',
                $input['scriptureText'] ?? $input['scripture_text'] ?? '',
                $paras,
                $input['additionalScripture'] ?? $input['additional_scripture'] ?? '',
                $input['prayerConfession'] ?? $input['prayer_confession'] ?? '',
                $input['bibleReading'] ?? $input['bible_reading'] ?? '',
                $input['author'] ?? 'Dr. Andy Osakwe',
                $input['imageUrl'] ?? $input['image_url'] ?? '',
            ]);

            logActivity('devotional_create', "Devotional entry \"{$input['title']}\" created and saved.", 'devotional', $devId, $input['title'] ?? '');

            // Auto-schedule the new devotional for Telegram on its own date.
            $savedDev = [
                'id'    => $devId,
                'date'  => $input['date'] ?? '',
                'year'  => $input['year'] ?? date('Y'),
                'title' => $input['title'] ?? '',
            ];
            tgAutoScheduleOnUpload($savedDev);

            jsonResponse([
                'id' => $devId,
                'date' => $input['date'] ?? '',
                'year' => $input['year'] ?? date('Y'),
                'title' => $input['title'] ?? '',
                'scriptureRef' => $input['scriptureRef'] ?? $input['scripture_ref'] ?? '',
                'scriptureText' => $input['scriptureText'] ?? $input['scripture_text'] ?? '',
                'paragraphs' => $input['paragraphs'] ?? [],
                'additionalScripture' => $input['additionalScripture'] ?? $input['additional_scripture'] ?? '',
                'prayerConfession' => $input['prayerConfession'] ?? $input['prayer_confession'] ?? '',
                'bibleReading' => $input['bibleReading'] ?? $input['bible_reading'] ?? '',
                'author' => $input['author'] ?? 'Dr. Andy Osakwe',
                'imageUrl' => $input['imageUrl'] ?? $input['image_url'] ?? '',
            ], 201);
        }
        break;

    case 'PUT':
        requireAnySection(['add-devotional', 'manage-devotionals', 'import-devotional']);
        // PUT /api/devotionals?id=X
        if (!$id) jsonError('Missing devotional id', 400);

        $input = jsonInput();
        $input = utf8Safe($input);
        $paras = isset($input['paragraphs']) ? json_encode($input['paragraphs'], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) : '[]';
        if ($paras === false) $paras = '[]';

        $stmt = $pdo->prepare(
            "UPDATE devotionals SET date=?, year=?, title=?, scripture_ref=?, scripture_text=?, paragraphs=?, additional_scripture=?, prayer_confession=?, bible_reading=?, author=?, image_url=?
             WHERE id=?"
        );
        $stmt->execute([
            $input['date'] ?? '',
            $input['year'] ?? date('Y'),
            $input['title'] ?? '',
            $input['scriptureRef'] ?? $input['scripture_ref'] ?? '',
            $input['scriptureText'] ?? $input['scripture_text'] ?? '',
            $paras,
            $input['additionalScripture'] ?? $input['additional_scripture'] ?? '',
            $input['prayerConfession'] ?? $input['prayer_confession'] ?? '',
            $input['bibleReading'] ?? $input['bible_reading'] ?? '',
            $input['author'] ?? 'Dr. Andy Osakwe',
            $input['imageUrl'] ?? $input['image_url'] ?? '',
            $id
        ]);

        if ($stmt->rowCount() === 0) {
            jsonError('Devotional not found', 404);
        }

        logActivity('devotional_update', "Devotional entry \"{$input['title']}\" updated successfully.", 'devotional', $id, $input['title'] ?? '');

        jsonResponse(['success' => true, 'id' => $id]);
        break;

    case 'DELETE':
        requireAnySection(['add-devotional', 'manage-devotionals', 'import-devotional']);
        // DELETE /api/devotionals?id=X
        if (!$id) jsonError('Missing devotional id', 400);

        // Grab the title + image BEFORE deleting so the activity feed shows a
        // friendly message and any on-disk image file can be unlinked.
        $title = '';
        $imageUrl = '';
        try {
            $find = $pdo->prepare("SELECT title, image_url FROM devotionals WHERE id = ?");
            $find->execute([$id]);
            $row = $find->fetch();
            if ($row) {
                $title = (string)($row['title'] ?? '');
                $imageUrl = (string)($row['image_url'] ?? '');
            }
        } catch (Exception $e) {
            // ignore
        }

        // If the devotional references a real file on disk (rather than an
        // embedded base64 data URL), delete the file too so the cPanel upload
        // folder doesn't keep orphans. Only touch paths inside /upload.
        if ($imageUrl !== '' && !str_starts_with($imageUrl, 'data:') && !preg_match('#^https?://#i', $imageUrl)) {
            $rel = ltrim($imageUrl, '/');
            if (str_starts_with($rel, 'upload/') || str_starts_with($rel, 'uploads/')) {
                $absPath = __DIR__ . '/../../' . $rel;
                if (file_exists($absPath)) {
                    @unlink($absPath);
                }
                try {
                    $pdo->prepare("DELETE FROM uploaded_files WHERE file_path = ? OR file_path = ?")
                        ->execute([$rel, '/' . $rel]);
                } catch (Exception $e) {
                    // table may not exist
                }
            }
        }

        $stmt = $pdo->prepare("DELETE FROM devotionals WHERE id = ?");
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            jsonError('Devotional not found', 404);
        }

        // Also drop any reaction votes for this devotional so the counts stay consistent.
        try {
            $pdo->prepare("DELETE FROM devotional_reaction_votes WHERE devotional_id = ?")->execute([$id]);
        } catch (Exception $e) {
            // table may not exist
        }

        logActivity('devotional_delete', "Devotional entry \"{$title}\" deleted.", 'devotional', $id, $title);

        jsonResponse(['success' => true]);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
