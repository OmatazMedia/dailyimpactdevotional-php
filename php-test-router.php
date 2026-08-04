<?php
/**
 * Local test router — mimics the cPanel .htaccess behavior for the PHP
 * built-in server so we can verify the BUILT app against the real PHP backend.
 *
 * Usage: php -d extension_dir=... php-test-router.php  (with -S 127.0.0.1:PORT)
 *
 * Static dist/ files are served explicitly (the built-in server's docroot is
 * the CWD, not dist/, so we can't rely on `return false` for them).
 */
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$root = __DIR__ . '/dist';
$backendRoot = __DIR__ . '/backend';

// ── Backend API — let the built-in server execute real PHP files ──
if (strpos($uri, '/backend/') === 0) {
    $rel = substr($uri, strlen('/backend/'));
    $file = realpath($backendRoot . '/' . $rel);
    if ($file && strpos($file, realpath($backendRoot)) === 0 && is_file($file)) {
        return false; // built-in server runs it (executes PHP)
    }
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Not found']);
    return true;
}

// ── Static files from dist — serve explicitly with the right content type ──
$mime = [
    'js'    => 'application/javascript',
    'css'   => 'text/css',
    'html'  => 'text/html; charset=utf-8',
    'json'  => 'application/json',
    'png'   => 'image/png',
    'jpg'   => 'image/jpeg',
    'jpeg'  => 'image/jpeg',
    'svg'   => 'image/svg+xml',
    'webp'  => 'image/webp',
    'ico'   => 'image/x-icon',
    'woff'  => 'font/woff',
    'woff2' => 'font/woff2',
    'txt'   => 'text/plain',
    'webmanifest' => 'application/manifest+json',
];

$file = realpath($root . $uri);
if ($uri !== '/' && $file && strpos($file, realpath($root)) === 0 && is_file($file)) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if (isset($mime[$ext])) header('Content-Type: ' . $mime[$ext]);
    header('Content-Length: ' . filesize($file));
    readfile($file);
    return true;
}

// ── SPA fallback -> index.html ──
$idx = $root . '/index.html';
if (is_file($idx)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($idx);
    return true;
}
http_response_code(404);
echo 'index.html not found — run npm run build first';
return true;
