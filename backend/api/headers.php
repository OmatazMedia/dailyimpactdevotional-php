<?php
/**
 * Daily Impact Devotional - Header Images API
 * 
 * GET    /api/headers              - List all header mappings
 * POST   /api/headers              - Save/update header mapping (base64 data URL)
 * DELETE /api/headers?dateKey=X    - Delete header mapping
 * 
 * Files are saved to: upload/headers/{month}_{year}/
 * Example: upload/headers/july_2025/header.jpg
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method  = httpMethod();
$dateKey = $_GET['dateKey'] ?? null;

/**
 * Remove staged header files that are no longer referenced by a mapping.
 *
 * The bulk-upload flow writes the file TWICE — once via upload.php
 * (upload/headers/{month_folder}/{month}_{year}_{name}) and again via the
 * headers.php POST handler (a differently-named file that owns the mapping).
 * The upload.php copy is never referenced by header_mappings afterwards, so
 * any uploaded_files row in this month folder that doesn't match a current
 * mapping file_path is an orphan: unlink it from disk and drop the row.
 * Never throws — cleanup must not break the request that triggered it.
 */
function sweepHeaderOrphans(PDO $pdo, string $monthFolder): void {
    if ($monthFolder === '') return;
    try {
        $orphanStmt = $pdo->prepare(
            "SELECT file_path FROM uploaded_files
             WHERE file_type = 'header' AND month_folder = ?
             AND file_path NOT IN (
                 SELECT file_path FROM header_mappings
                 WHERE month_folder = ? AND file_path IS NOT NULL AND file_path != ''
             )"
        );
        $orphanStmt->execute([$monthFolder, $monthFolder]);
        $orphans = $orphanStmt->fetchAll();
        foreach ($orphans as $orphan) {
            if (!empty($orphan['file_path'])) {
                $oAbs = __DIR__ . '/../../' . ltrim($orphan['file_path'], '/');
                if (file_exists($oAbs)) {
                    @unlink($oAbs);
                }
            }
        }
        $pdo->prepare(
            "DELETE FROM uploaded_files
             WHERE file_type = 'header' AND month_folder = ?
             AND file_path NOT IN (
                 SELECT file_path FROM header_mappings
                 WHERE month_folder = ? AND file_path IS NOT NULL AND file_path != ''
             )"
        )->execute([$monthFolder, $monthFolder]);
    } catch (Exception $e) {
        // table may not exist — ignore
    }
}

switch ($method) {
    case 'GET':
        // GET /api/headers - List all header mappings
        $stmt = $pdo->query("SELECT * FROM header_mappings ORDER BY year DESC, FIELD(month,
            'January','February','March','April','May','June',
            'July','August','September','October','November','December'
        ), day DESC");
        $headers = $stmt->fetchAll();

        // Map to frontend format (camelCase)
        $result = [];
        foreach ($headers as $h) {
            $result[] = [
                'dateKey'  => $h['date_key'],
                'fileName' => $h['file_name'],
                'dataUrl'  => $h['data_url'] ?? '',
                'filePath' => $h['file_path'] ? ('/' . ltrim($h['file_path'], '/')) : '',
            ];
        }

        jsonResponse($result);
        break;

    case 'POST':
        requireAdmin();
        // POST /api/headers - Save/update header mapping
        $input = jsonInput();
        $inputDateKey = $input['dateKey'] ?? '';
        $fileName     = $input['fileName'] ?? 'header.jpg';
        $dataUrl      = $input['dataUrl'] ?? '';
        $month        = $input['month'] ?? '';
        $day          = $input['day'] ?? '';
        $year         = $input['year'] ?? date('Y');

        if (empty($inputDateKey) || empty($dataUrl)) {
            jsonError('dateKey and dataUrl are required');
        }

        // Determine month folder
        if (empty($month)) {
            $month = ucfirst(strtolower(trim(explode(' ', $inputDateKey)[0] ?? 'January')));
        }
        $monthFolder = getMonthFolder($month, (int)$year);
        $headersDir = ensureUploadDir('headers/' . $monthFolder);

        // Save base64 image to file
        $savedFilePath = '';
        $fileSaveError = '';
        
        // Decode base64 data
        $base64Data = preg_replace('/^data:image\/\w+;base64,/', '', $dataUrl);
        $ext = 'jpg';
        if (preg_match('/^data:image\/(\w+);base64,/', $dataUrl, $m)) {
            $ext = strtolower($m[1]);
        }
        // Validate extension
        $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!in_array($ext, $allowedExts)) $ext = 'jpg';

        $safeFileName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $fileName);
        $diskFileName = strtolower($month) . '_' . $day . ($year ? '_' . $year : '') . '_' . $safeFileName;
        // Ensure extension
        if (!preg_match('/\.\w+$/', $diskFileName)) {
            $diskFileName .= '.' . $ext;
        }

        $fullPath = $headersDir . '/' . $diskFileName;
        
        // Check if directory is writable — try to fix permissions if not
        if (!is_writable($headersDir)) {
            @chmod($headersDir, 0777);
        }
        if (!is_writable($headersDir)) {
            $fileSaveError = "Upload directory '$headersDir' is not writable by PHP";
        } else {
            $decodedData = base64_decode($base64Data, true);
            if ($decodedData === false) {
                $fileSaveError = 'Failed to decode base64 image data';
            } else {
                $bytesWritten = @file_put_contents($fullPath, $decodedData);
                if ($bytesWritten === false) {
                    $fileSaveError = "Failed to write file to disk (path: $fullPath)";
                } else {
                    $savedFilePath = 'upload/headers/' . $monthFolder . '/' . $diskFileName;
                }
            }
        }

        // Upsert into database
        if (!$pdo) {
            jsonError('Database connection is not available', 500);
        }

        // If this dateKey already has a mapping, unlink the OLD file from disk
        // before replacing it — otherwise every re-upload leaves an orphaned
        // file behind in the cPanel upload folders (and its uploaded_files row).
        try {
            $oldStmt = $pdo->prepare("SELECT file_path FROM header_mappings WHERE date_key = ?");
            $oldStmt->execute([strtolower($inputDateKey)]);
            $oldRow = $oldStmt->fetch();
            if ($oldRow && !empty($oldRow['file_path'])) {
                $oldAbs = __DIR__ . '/../../' . ltrim($oldRow['file_path'], '/');
                if (file_exists($oldAbs)) {
                    @unlink($oldAbs);
                }
            }
        } catch (Exception $e) {
            // ignore — best-effort cleanup
        }

        $stmt = $pdo->prepare("DELETE FROM header_mappings WHERE date_key = ?");
        $stmt->execute([strtolower($inputDateKey)]);

        $stmt = $pdo->prepare(
            "INSERT INTO header_mappings (date_key, file_name, data_url, file_path, month, day, year, month_folder)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            strtolower($inputDateKey),
            $fileName,
            $dataUrl,
            $savedFilePath,
            $month,
            (int)$day,
            (int)$year,
            $monthFolder,
        ]);

        // If disk write failed, return an error so the frontend can alert the user
        if (!empty($fileSaveError)) {
            http_response_code(500);
            jsonResponse([
                'success'  => false,
                'error'    => $fileSaveError,
                'dbSaved'  => true,
                'hint'     => 'The image was saved to the database but could not be written to disk. Check upload folder permissions.',
            ]);
        } else {
            // Sweep any staged upload.php copies for this month folder that are
            // no longer referenced by a mapping (see sweepHeaderOrphans()).
            sweepHeaderOrphans($pdo, $monthFolder);

            logActivity('header_upload', "Uploaded new Header Image cover file {$safeFileName} and mapped to {$inputDateKey}.", 'header', strtolower($inputDateKey), $safeFileName);
            jsonResponse([
                'success'     => true,
                'filePath'    => $savedFilePath ? '/' . $savedFilePath : '',
                'savedToDisk' => true,
            ], 201);
        }
        break;

    case 'DELETE':
        requireAdmin();
        // DELETE /api/headers?dateKey=X
        if (!$dateKey) jsonError('Missing dateKey parameter', 400);

        // Delete the file if it exists
        $stmt = $pdo->prepare("SELECT file_path, month_folder FROM header_mappings WHERE LOWER(date_key) = LOWER(?)");
        $stmt->execute([$dateKey]);
        $row = $stmt->fetch();
        $monthFolder = $row['month_folder'] ?? '';

        if ($row && !empty($row['file_path'])) {
            $absPath = __DIR__ . '/../../' . ltrim($row['file_path'], '/');
            if (file_exists($absPath)) {
                @unlink($absPath);
            }
            // Also drop the matching uploaded_files record so the uploads table
            // doesn't reference a file that no longer exists on disk.
            try {
                $pdo->prepare("DELETE FROM uploaded_files WHERE file_path = ?")->execute([$row['file_path']]);
            } catch (Exception $e) {
                // table may not exist
            }
        }

        $stmt = $pdo->prepare("DELETE FROM header_mappings WHERE LOWER(date_key) = LOWER(?)");
        $stmt->execute([$dateKey]);

        // Sweep any staged upload.php copies in the same month folder that are
        // no longer referenced by a mapping (see sweepHeaderOrphans()).
        sweepHeaderOrphans($pdo, $monthFolder);

        logActivity('header_delete', "Header Image cover for {$dateKey} removed.", 'header', strtolower($dateKey));

        jsonResponse(['success' => true]);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
