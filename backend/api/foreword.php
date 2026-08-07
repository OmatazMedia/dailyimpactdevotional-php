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
 * Daily Impact Devotional - Foreword API
 * 
 * GET    /api/foreword            - List all foreword posts
 * POST   /api/foreword            - Create a new foreword post
 * PUT    /api/foreword            - Bulk replace all foreword posts
 * PUT    /api/foreword?id=X       - Update a specific foreword post
 * DELETE /api/foreword?id=X       - Delete a foreword post
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

$method = httpMethod();
$id     = $_GET['id'] ?? null;

switch ($method) {
    case 'GET':
        // GET /api/foreword - List all posts
        $stmt = $pdo->query("SELECT * FROM foreword_posts ORDER BY published_at DESC");
        $posts = $stmt->fetchAll();

        $result = [];
        foreach ($posts as $p) {
            $result[] = [
                'id'          => (string)$p['id'],
                'title'       => $p['title'],
                'content'     => $p['content'],
                'author'      => $p['author'],
                'publishedAt' => $p['published_at'],
                'updatedAt'   => $p['updated_at'],
            ];
        }

        jsonResponse($result);
        break;

    case 'POST':
        requireSection('foreword');
        // POST /api/foreword - Create new post
        $input = jsonInput();
        $postId = generateId();

        $stmt = $pdo->prepare(
            "INSERT INTO foreword_posts (id, title, content, author) VALUES (?, ?, ?, ?)"
        );
        $stmt->execute([
            $postId,
            $input['title'] ?? 'Untitled',
            $input['content'] ?? '',
            $input['author'] ?? 'Dr. Andy Osakwe',
        ]);

        // Real-time activity feed entry — shows on the dashboard instantly.
        logActivity('foreword_create', "Foreword \"" . ($input['title'] ?? 'Untitled') . "\" published.", 'foreword', $postId);

        jsonResponse([
            'id'          => $postId,
            'title'       => $input['title'] ?? 'Untitled',
            'content'     => $input['content'] ?? '',
            'author'      => $input['author'] ?? 'Dr. Andy Osakwe',
            'publishedAt' => date('c'),
            'updatedAt'   => date('c'),
        ], 201);
        break;

    case 'PUT':
        requireSection('foreword');
        if ($id) {
            // PUT /api/foreword?id=X - Update specific post
            $input = jsonInput();

            $stmt = $pdo->prepare(
                "UPDATE foreword_posts SET title=?, content=?, author=? WHERE id=?"
            );
            $stmt->execute([
                $input['title'] ?? 'Untitled',
                $input['content'] ?? '',
                $input['author'] ?? 'Dr. Andy Osakwe',
                $id,
            ]);

            if ($stmt->rowCount() === 0) {
                jsonError('Foreword post not found', 404);
            }

            logActivity('foreword_update', "Foreword \"" . ($input['title'] ?? 'Untitled') . "\" updated.", 'foreword', $id);

            jsonResponse(['success' => true, 'id' => $id]);
        } else {
            // PUT /api/foreword - Bulk replace all posts
            $input = jsonInput();

            if (!is_array($input)) {
                jsonError('Expected an array of foreword posts');
            }

            // Clear existing and insert new
            $pdo->exec("TRUNCATE TABLE foreword_posts");

            if (empty($input)) {
                logActivity('foreword_replace', "All foreword posts replaced with an empty list.", 'foreword');
                jsonResponse(['success' => true]);
            }

            $stmt = $pdo->prepare(
                "INSERT INTO foreword_posts (id, title, content, author, published_at) VALUES (?, ?, ?, ?, ?)"
            );
            foreach ($input as $post) {
                $pid = $post['id'] ?? generateId();
                $stmt->execute([
                    $pid,
                    $post['title'] ?? 'Untitled',
                    $post['content'] ?? '',
                    $post['author'] ?? 'Dr. Andy Osakwe',
                    $post['publishedAt'] ?? $post['published_at'] ?? date('Y-m-d H:i:s'),
                ]);
            }

            logActivity('foreword_replace', 'All foreword posts bulk-replaced.', 'foreword');

            jsonResponse(['success' => true]);
        }
        break;

    case 'DELETE':
        requireSection('foreword');
        // DELETE /api/foreword?id=X
        if (!$id) jsonError('Missing foreword id', 400);

        $stmt = $pdo->prepare("DELETE FROM foreword_posts WHERE id = ?");
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            jsonError('Foreword post not found', 404);
        }

        logActivity('foreword_delete', 'Foreword post deleted.', 'foreword', $id);

        jsonResponse(['success' => true]);
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}
