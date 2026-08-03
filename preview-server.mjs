/**
 * Daily Impact Devotional — Static Preview Server
 *
 * Serves the built React app from dist/ with SPA fallback
 * (any route that isn't a real file returns index.html).
 *
 * Run:  node preview-server.mjs
 * Port: 3002 (change the PORT constant below if needed)
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, "dist");
const PORT = 3002;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** True when the resolved path stays inside DIST_DIR. */
function isInsideRoot(resolved) {
  const rel = path.relative(DIST_DIR, resolved);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    urlPath = "/";
  }

  // Normalize and strip leading slashes; this yields a relative candidate.
  const rel = path.normalize(urlPath).replace(/^([/\\])+/, "");
  const candidate = path.resolve(DIST_DIR, rel);

  let filePath = candidate;
  if (!isInsideRoot(candidate)) {
    filePath = path.join(DIST_DIR, "index.html");
  }

  // SPA fallback: directories and missing files serve index.html.
  let stat = null;
  try {
    stat = fs.statSync(filePath);
  } catch {
    stat = null;
  }
  if (!stat || stat.isDirectory()) {
    filePath = path.join(DIST_DIR, "index.html");
    try {
      stat = fs.statSync(filePath);
    } catch {
      res.writeHead(500);
      res.end("index.html missing — run `npm run build` first.");
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    res.writeHead(500);
    res.end("Server error");
  });
  stream.pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Preview server running at http://localhost:${PORT}`);
  console.log(`   Serving: ${DIST_DIR}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
