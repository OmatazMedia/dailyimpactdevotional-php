<?php
/**
 * Daily Impact Devotional - Donations API
 * 
 * GET  /api/donations - List all donations
 * POST /api/donations - Record a donation
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        requireAdmin();
        $stmt = $pdo->query("SELECT * FROM donations ORDER BY donated_at DESC");
        $donations = $stmt->fetchAll();

        $result = [];
        foreach ($donations as $d) {
            $result[] = [
                'id'        => (string)$d['id'],
                'reference' => $d['reference'],
                'amount'    => (float)$d['amount'],
                'currency'  => $d['currency'],
                'email'     => $d['email'],
                'name'      => $d['name'],
                'provider'  => $d['provider'],
                'status'    => $d['status'],
                'date'      => $d['donated_at'],
            ];
        }

        jsonResponse($result);
        break;

    case 'POST':
        $input = jsonInput();
        $donationId = generateId();

        $stmt = $pdo->prepare(
            "INSERT INTO donations (id, reference, amount, currency, email, name, provider, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $donationId,
            $input['reference'] ?? '',
            $input['amount'] ?? 0,
            $input['currency'] ?? 'NGN',
            $input['email'] ?? '',
            $input['name'] ?? '',
            $input['provider'] ?? 'manual',
            $input['status'] ?? 'success',
        ]);

        jsonResponse([
            'id'        => $donationId,
            'reference' => $input['reference'] ?? '',
            'amount'    => (float)($input['amount'] ?? 0),
            'currency'  => $input['currency'] ?? 'NGN',
            'email'     => $input['email'] ?? '',
            'name'      => $input['name'] ?? '',
            'provider'  => $input['provider'] ?? 'manual',
            'status'    => $input['status'] ?? 'success',
            'date'      => date('c'),
        ], 201);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
