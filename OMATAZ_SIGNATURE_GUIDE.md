# 🖊️ Omataz Media — Developer Signature Guide (for vibe coders)

> **Purpose:** This guide tells any coding assistant (or human developer) exactly where and how to embed the **Omataz Media** developer signature into a project — visible only in the *code* (DevTools, source files, repo), never on the live website. Copy the blocks below into your prompt, or follow the checklist manually.

---

## 1. The canonical credit block (all details)

Use this everywhere. Keep it consistent across the project:

```text
Omataz Media — Web Development & Design
Website   : https://www.omatazmedia.com.ng
Email     : hello@omatazmedia.com.ng
Phone     : +234 9024599289, +234 7037373304
WhatsApp  : https://wa.me/message/M3QUHNVONY6NK1
Social    : @omatazmedia — Facebook · Instagram · X · YouTube
GitHub    : https://github.com/omatazmedia
Contact   : Johnson Toluwani
```

**Company data for any structured field (package.json, README tables, JSON-LD):**

| Field | Value |
|---|---|
| Company | Omataz Media — Web Development & Design |
| Contact person | Johnson Toluwani |
| Website | https://www.omatazmedia.com.ng |
| Email | hello@omatazmedia.com.ng |
| Phone | +234 9024599289, +234 7037373304 |
| WhatsApp | https://wa.me/message/M3QUHNVONY6NK1 |
| Facebook | https://facebook.com/omatazmedia |
| Instagram | https://instagram.com/omatazmedia |
| X (Twitter) | https://x.com/omatazmedia |
| YouTube | https://youtube.com/@omatazmedia |
| GitHub | https://github.com/omatazmedia |

---

## 2. Where to add it (checklist, in priority order)

### ✅ A. Built JS/CSS bundles (Vite) — the most important one
When a dev opens the inspector and views the compiled bundle, the credit is the **first thing** at the top of the file.

**File:** `vite.config.ts` (or `vite.config.js`)

Add a `banner` to the build output and a small plugin that does the same for CSS:

```ts
const OMATAZ_BANNER = `/*!
 * ══════════════════════════════════════════════════════════
 *   Omataz Media — Web Development & Design
 *   Project   : <PROJECT NAME>
 *   Website   : https://www.omatazmedia.com.ng
 *   Email     : hello@omatazmedia.com.ng
 *   Phone     : +234 9024599289, +234 7037373304
 *   WhatsApp  : https://wa.me/message/M3QUHNVONY6NK1
 *   Social    : @omatazmedia — Facebook · Instagram · X · YouTube
 *   GitHub    : https://github.com/omatazmedia
 *   Contact   : Johnson Toluwani
 * ══════════════════════════════════════════════════════════
 */
`;

// CSS needs its own plugin — Vite's `banner` only covers JS chunks.
function omatazCssBanner(banner: string): Plugin {
  return {
    name: 'omataz-css-banner',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css') && typeof file.source === 'string') {
          file.source = banner + file.source;
        }
      }
    },
  };
}
```

Then in the config: `plugins: [react(), ..., omatazCssBanner(OMATAZ_BANNER)]` and `build: { rollupOptions: { output: { banner: OMATAZ_BANNER } } }`.

> ⚠️ The `/*!` prefix is what keeps the comment in **minified** output — don't drop it.

### ✅ B. `index.html` — top-of-file comment + meta generator tag
**File:** `index.html`

1. Right after `<!doctype html>`, add the credit as an HTML comment (same block as above, `#` → no prefix needed; use `<!-- -->`).
2. In `<head>`, add a `generator` meta tag (invisible to visitors, visible to devs/SEO):

```html
<meta name="generator" content="Built by Omataz Media — https://www.omatazmedia.com.ng · hello@omatazmedia.com.ng · Johnson Toluwani" />
```

### ✅ C. Browser console signature (React/JS entry)
**File:** the app entry (`src/main.tsx`, `src/index.js`, etc.)

```ts
console.log(
  "%cOmataz Media%c — <PROJECT NAME>\n%cWebsite  : https://www.omatazmedia.com.ng\nEmail    : hello@omatazmedia.com.ng\nPhone    : +234 9024599289, +234 7037373304\nWhatsApp : https://wa.me/message/M3QUHNVONY6NK1\nSocial   : @omatazmedia (Facebook · Instagram · X · YouTube · GitHub)\nContact  : Johnson Toluwani",
  "background:#0d9488;color:#fff;font-weight:bold;padding:4px 10px;border-radius:4px;font-size:13px;",
  "color:#0f172a;font-weight:bold;font-size:13px;",
  "color:#475569;font-size:11px;line-height:1.7;",
);
```

Only people who open DevTools → Console see it. Adjust the brand color (`#0d9488`) to match the project.

### ✅ D. PHP files — header comment after `<?php`
Every PHP file gets the credit as a docblock right after the opening tag:

```php
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
```

> 💡 **Automated option:** this repo ships a reusable script — `scripts/add-omataz-php-credit.mjs`. Copy it into any PHP project and run `node scripts/add-omataz-php-credit.mjs` (or pass specific files). It skips files that already have the credit, so it's safe to re-run.

### ✅ E. `.htaccess` files — top-of-file comment
Every `.htaccess` gets the credit as `#`-prefixed lines at the very top (same block as above, `#` prefix instead of `*`). Invisible to visitors; visible to anyone with file access.

### ✅ F. `package.json` — author + contact
```json
"author": "Omataz Media <hello@omatazmedia.com.ng> (https://www.omatazmedia.com.ng)",
"contact": {
  "company": "Omataz Media",
  "person": "Johnson Toluwani",
  "website": "https://www.omatazmedia.com.ng",
  "email": "hello@omatazmedia.com.ng",
  "phone": ["+234 9024599289", "+234 7037373304"],
  "whatsapp": "https://wa.me/message/M3QUHNVONY6NK1",
  "social": "@omatazmedia (Facebook, Instagram, X, YouTube)",
  "github": "https://github.com/omatazmedia"
}
```

### ✅ G. `README.md` — credits section
Add a blockquote under the title and a **Credits** table near the end (copy the table from section 1 above), plus a small footer line: `Developed by [Omataz Media](https://www.omatazmedia.com.ng) 🚀`.

---

## 3. Rules (never break these)

1. **Never render the signature on the live website.** No visible footer text, no visible credit line — it must live only in code/comments/console. (Exception: the README, which is repo-only.)
2. **Never use `display:none` or hidden HTML tricks** to "hide" a visible credit — that can look like SEO gaming. If it's not supposed to show, don't render it at all.
3. **Never alter functionality** — all additions are comments, meta tags, console output, or metadata fields. Nothing changes routes, logic, or data.
4. **Keep the details exact** — the website, email, phone numbers, WhatsApp link, and contact person must match section 1 verbatim.
5. **Minified output:** always use `/*!` for JS/CSS banners so the credit survives minification.

---

## 4. One-prompt template (copy-paste into your vibe coder)

> Add the "Omataz Media" developer signature to this project WITHOUT changing any functionality and WITHOUT showing anything on the live website. Use this exact block everywhere: website https://www.omatazmedia.com.ng, email hello@omatazmedia.com.ng, phone +234 9024599289 and +234 7037373304, WhatsApp https://wa.me/message/M3QUHNVONY6NK1, social @omatazmedia (Facebook, Instagram, X, YouTube, GitHub https://github.com/omatazmedia), contact person Johnson Toluwani. Add it: (1) as a Vite build banner at the top of built JS + CSS (use /*! so it survives minification, plus a small plugin for CSS), (2) as an HTML comment after <!doctype html> plus a <meta name="generator"> tag, (3) as a styled console.log at the app entry, (4) as a header comment after <?php in every PHP file, (5) at the top of every .htaccess as # comments, (6) in package.json author + a contact field, (7) as a Credits section in README.md. Follow the guide in OMATAZ_SIGNATURE_GUIDE.md for exact formatting.
