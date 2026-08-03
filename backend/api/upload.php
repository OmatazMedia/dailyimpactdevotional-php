<?php
/**
 * Daily Impact Devotional - File Upload API
 * 
 * POST /api/upload - Upload a file (DOCX, image, etc.)
 *   Fields: file, type (header|devotional_docx|homepage_hero), month, year, dateKey
 * 
 * Files are saved to monthly folders like:
 *   upload/headers/july_2025/filename.jpg
 *   upload/devotionals/july_2025/filename.docx
 *   upload/homepage_hero.jpg (no monthly folder for hero banner)
 */

require_once __DIR__ . '/../config/db.php';

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Require admin auth
requireAdmin();

header('Content-Type: application/json; charset=utf-8');

// Check for uploaded file
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $errorCode = $_FILES['file']['error'] ?? -1;
    $errorMessages = [
        UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload limit',
        UPLOAD_ERR_FORM_SIZE  => 'File exceeds form size limit',
        UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE    => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Server missing temporary directory',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
    ];
    $msg = $errorMessages[$errorCode] ?? 'Unknown upload error';
    http_response_code(400);
    echo json_encode(['error' => $msg]);
    exit;
}

$file       = $_FILES['file'];
$type       = $_POST['type'] ?? 'header';
$month      = $_POST['month'] ?? '';
$year       = (int)($_POST['year'] ?? date('Y'));
$dateKey    = $_POST['dateKey'] ?? '';
$fileName   = $_POST['fileName'] ?? $file['name'];

// Allowed file types
$allowedMimes = [
    'header'         => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    'devotional_docx'=> ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/octet-stream'],
    'homepage_hero'  => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    'footer_sponsor' => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    'author_image'   => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
];

$allowedExts = [
    'header'          => ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    'devotional_docx' => ['docx', 'doc'],
    'homepage_hero'   => ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    'footer_sponsor'  => ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    'author_image'    => ['jpg', 'jpeg', 'png', 'gif', 'webp'],
];

// Validate file type
$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$mime = detectRealMime($file['tmp_name']);

if (!isset($allowedExts[$type])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid upload type: ' . $type]);
    exit;
}

if (!in_array($ext, $allowedExts[$type])) {
    http_response_code(400);
    echo json_encode(['error' => 'File type not allowed for ' . $type . '. Allowed: ' . implode(', ', $allowedExts[$type])]);
    exit;
}

// Determine target directory and filename
$targetDir = '';
$savedRelativePath = '';

switch ($type) {
    case 'homepage_hero':
        $targetDir = UPLOADS_DIR;
        $savedName = 'homepage_hero.' . $ext;
        $savedRelativePath = 'upload/' . $savedName;
        break;

    case 'footer_sponsor':
        $targetDir = UPLOADS_DIR;
        $savedName = 'footer_sponsor.' . $ext;
        $savedRelativePath = 'upload/' . $savedName;
        break;

    case 'author_image':
        $targetDir = UPLOADS_DIR;
        $savedName = 'author_image.' . $ext;
        $savedRelativePath = 'upload/' . $savedName;
        break;

    case 'header':
        if (empty($month)) {
            // Extract month from dateKey if provided
            if ($dateKey) {
                $parts = parseDateParts($dateKey);
                $month = $parts['month'];
            } else {
                $month = date('F');
            }
        }
        $monthFolder = getMonthFolder($month, $year);
        $targetDir = ensureUploadDir('headers/' . $monthFolder);
        // Clean filename
        $safeBase = preg_replace('/[^a-zA-Z0-9._-]/', '_', pathinfo($fileName, PATHINFO_FILENAME));
        $savedName = strtolower($month) . '_' . $year . '_' . $safeBase . '.' . $ext;
        $savedRelativePath = 'upload/headers/' . $monthFolder . '/' . $savedName;
        break;

    case 'devotional_docx':
        if (empty($month)) {
            $month = date('F');
        }
        $monthFolder = getMonthFolder($month, $year);
        $targetDir = ensureUploadDir('devotionals/' . $monthFolder);
        $safeBase = preg_replace('/[^a-zA-Z0-9._-]/', '_', pathinfo($fileName, PATHINFO_FILENAME));
        $savedName = strtolower($month) . '_' . $year . '_' . $safeBase . '.' . $ext;
        // Folder is 'devotionals' (plural) — matches the actual on-disk folder.
        $savedRelativePath = 'upload/devotionals/' . $monthFolder . '/' . $savedName;
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown upload type']);
        exit;
}

// Verify target directory is writable — try to fix permissions if not
if (!is_dir($targetDir) || !is_writable($targetDir)) {
    // Try to create/recreate with broader permissions
    if (!is_dir($targetDir)) {
        @mkdir($targetDir, 0777, true);
    }
    // If dir exists but isn't writable, try chmod
    if (is_dir($targetDir) && !is_writable($targetDir)) {
        @chmod($targetDir, 0777);
    }
    if (!is_writable($targetDir)) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Upload directory is not writable. Please check server permissions.',
            'dir'   => $targetDir,
        ]);
        exit;
    }
}

// Move uploaded file to target directory
$fullPath = $targetDir . '/' . $savedName;
if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to save uploaded file. PHP may not have write permission.',
        'dir'   => $targetDir,
    ]);
    exit;
}

// Set file permissions so it's readable by the web server
@chmod($fullPath, 0644);

// Record in database
try {
    if (!$pdo) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Database connection is not available. Upload was saved to disk, but the record could not be written.',
            'dbError' => $GLOBALS['db_error'] ?? 'unknown database error',
        ]);
        exit;
    }

    $stmt = $pdo->prepare(
        "INSERT INTO uploaded_files (original_name, saved_name, file_path, file_type, file_size, mime_type, month, year, month_folder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $file['name'],
        $savedName,
        $savedRelativePath,
        $type,
        $file['size'],
        $mime,
        $month,
        $year,
        $monthFolder ?? '',
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'File was saved, but database insert failed.',
        'dbError' => $e->getMessage(),
    ]);
    exit;
}

// If it's a header image, also create/update the header mapping
if ($type === 'header' && $dateKey) {
    try {
        // Delete existing mapping for this dateKey
        if (!$pdo) {
            throw new RuntimeException('Database connection unavailable');
        }

        $stmt = $pdo->prepare("DELETE FROM header_mappings WHERE date_key = ?");
        $stmt->execute([strtolower($dateKey)]);

        $stmt = $pdo->prepare(
            "INSERT INTO header_mappings (date_key, file_name, file_path, month, day, year, month_folder)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $parts = parseDateParts($dateKey);
        $stmt->execute([
            strtolower($dateKey),
            $savedName,
            $savedRelativePath,
            $month,
            $parts['day'],
            $year,
            $monthFolder ?? '',
        ]);
    } catch (Exception $e) {
        // Ignore mapping errors
    }
}

// If it's a homepage hero, update settings
if ($type === 'homepage_hero') {
    try {
        setSetting('homepage_hero_image', '/' . $savedRelativePath);
    } catch (Exception $e) {
        // Ignore
    }
}

// If it's a footer sponsor image, update settings
if ($type === 'footer_sponsor') {
    try {
        setSetting('footer_sponsor_image', '/' . $savedRelativePath);
    } catch (Exception $e) {
        // Ignore
    }
}

// If it's an author portrait image, update settings
if ($type === 'author_image') {
    try {
        setSetting('author_image', '/' . $savedRelativePath);
    } catch (Exception $e) {
        // Ignore
    }
}

echo json_encode([
    'success'     => true,
    'filePath'    => '/' . $savedRelativePath,
    'fileName'    => $savedName,
    'fileSize'    => $file['size'],
    'fileType'    => $type,
    'monthFolder' => $monthFolder ?? '',
    'savedToDisk' => true,
]);
