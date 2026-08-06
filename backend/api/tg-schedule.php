<?php
/**
 * Daily Impact Devotional - Telegram Scheduling Helpers
 *
 * Shared by telegram.php (manual schedule/unschedule actions), devotionals.php
 * (auto-schedule on upload) and telegram-cron.php (delivering due posts).
 *
 * The telegram_log table already models per-devotional scheduling:
 *   status          ENUM('scheduled','sent','failed','skipped')
 *   scheduled_date  e.g. "July 20"   scheduled_year  e.g. 2026
 *   post_time       e.g. "06:00"
 *
 * The cron delivers every row whose date is today and whose post_time has been
 * reached — so once a devotional is uploaded it "drops on its own" on its own
 * date, instead of a single fixed daily cron slot.
 */

require_once __DIR__ . '/../config/db.php';

/**
 * Create (or refresh) a 'scheduled' telegram_log row for one devotional.
 *
 * When $postTime is null the row is scheduled with the settings' default
 * post time — and ONLY if Telegram is enabled and the schedule mode is not
 * 'manual'. Passing an explicit $postTime (manual scheduling from the UI)
 * always schedules, regardless of the mode setting.
 *
 * @return bool true when a row was written
 */
function tgScheduleDevotional(array $dev, ?string $postTime = null): bool {
    global $pdo;
    if (!$pdo instanceof PDO) return false;
    if (empty($dev['id']) || empty($dev['date']) || empty((int)($dev['year'] ?? 0))) return false;

    if ($postTime === null) {
        $settings = getSettings();
        if (($settings['telegram_enabled'] ?? 'false') !== 'true') return false;
        if (($settings['telegram_schedule_mode'] ?? 'scheduled') === 'manual') return false;
        $postTime = $settings['telegram_post_time'] ?? '06:00';
    }

    try {
        // Re-scheduling replaces any previous not-yet-sent row for the same
        // devotional (a sent row is left intact for the historical log).
        $del = $pdo->prepare("DELETE FROM telegram_log WHERE devotional_id = ? AND status != 'sent'");
        $del->execute([$dev['id']]);

        $ins = $pdo->prepare(
            "INSERT INTO telegram_log (id, devotional_id, devotional_title, scheduled_date, scheduled_year, post_time, status)
             VALUES (?, ?, ?, ?, ?, ?, 'scheduled')"
        );
        $ins->execute([
            generateId(),
            $dev['id'],
            (string)($dev['title'] ?? ''),
            (string)$dev['date'],
            (int)$dev['year'],
            (string)$postTime,
        ]);
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * Remove not-yet-sent scheduled rows for the given devotional ids.
 * @return int number of rows removed
 */
function tgUnscheduleDevotionals(array $devotionalIds): int {
    global $pdo;
    if (!$pdo instanceof PDO) return 0;
    $ids = array_values(array_filter(array_map('strval', $devotionalIds)));
    if (empty($ids)) return 0;
    try {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM telegram_log WHERE status = 'scheduled' AND devotional_id IN ($in)");
        $stmt->execute($ids);
        return $stmt->rowCount();
    } catch (Throwable $e) {
        return 0;
    }
}

/**
 * Re-schedule an EXISTING telegram_log row (including already-SENT ones) at a
 * new post time / date. Flips it back to 'scheduled' so the cron posts it
 * again — used by the "Reschedule" action on sent broadcasts.
 *
 * @return bool true when the row was updated
 */
function tgReschedule(string $rowId, string $postTime, ?string $scheduledDate = null, ?int $year = null): bool
{
    global $pdo;
    if (!$pdo instanceof PDO || $rowId === '') return false;
    // Validate HH:MM
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $postTime)) return false;
    try {
        $stmt = $pdo->prepare(
            "UPDATE telegram_log
             SET post_time = ?, scheduled_date = COALESCE(?, scheduled_date),
                 scheduled_year = COALESCE(?, scheduled_year),
                 status = 'scheduled', sent_at = NULL, error = NULL
             WHERE id = ?"
        );
        $stmt->execute([$postTime, $scheduledDate, $year, $rowId]);
        return $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * List telegram_log rows for a month/year (all statuses), newest schedule
 * first, mapped to the camelCase shape the frontend expects.
 */
function tgScheduledForMonth(string $month, int $year): array {
    global $pdo;
    if (!$pdo instanceof PDO) return [];
    try {
        $stmt = $pdo->prepare(
            "SELECT * FROM telegram_log
             WHERE LOWER(scheduled_date) LIKE LOWER(?) AND scheduled_year = ?
             ORDER BY scheduled_date ASC, created_at DESC"
        );
        $stmt->execute([$month . ' %', $year]);
        $rows = $stmt->fetchAll();
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id'               => (string)$r['id'],
                'devotionalId'     => $r['devotional_id'],
                'devotionalTitle'  => $r['devotional_title'],
                'scheduledDate'    => $r['scheduled_date'],
                'scheduledYear'    => (int)$r['scheduled_year'],
                'postTime'         => $r['post_time'],
                'status'           => $r['status'],
                'sentAt'           => $r['sent_at'],
                'telegramMessageId'=> $r['telegram_message_id'],
                'error'            => $r['error'],
            ];
        }
        return $out;
    } catch (Throwable $e) {
        return [];
    }
}
