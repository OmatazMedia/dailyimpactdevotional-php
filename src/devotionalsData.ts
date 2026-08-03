/**
 * devotionalsData.ts
 *
 * Data access layer for devotionals.
 * Reads/writes exclusively via the PHP API (backend).
 * NO localStorage caching, NO seed data, NO fallback placeholders.
 *
 * If the API is unavailable, functions return empty data ([]) or throw.
 * The UI handles empty states gracefully — "No Devotional for Today".
 */

import { Devotional } from "./types";
import { api, apiDelete } from "./lib/api";

// ─── Public API ────────────────────────────────────────────────────────────
// ALL functions are API-only. No localStorage caching. No seed/fallback data.

/** Load all devotionals from the API — returns [] if unavailable */
export async function getDevotionalsAsync(): Promise<Devotional[]> {
  try {
    return await api<Devotional[]>("/devotionals.php");
  } catch {
    // API unavailable — return empty list, no fallback to localStorage
  }
  return [];
}

/** Save a single new devotional via the API */
export async function saveDevotionalAsync(devotional: Omit<Devotional, "id">): Promise<Devotional> {
  return api<Devotional>("/devotionals.php", {
    method: "POST",
    body: JSON.stringify(devotional),
  });
}

/** Import many devotionals at once via the API */
export async function saveMultipleDevotionalsAsync(
  devotionals: Omit<Devotional, "id">[]
): Promise<Devotional[]> {
  return api<Devotional[]>("/devotionals.php?bulk=1", {
    method: "POST",
    body: JSON.stringify({ devotionals }),
  });
}

/** Update an existing devotional via the API */
export async function updateDevotionalAsync(updated: Devotional): Promise<void> {
  await api(`/devotionals.php?id=${encodeURIComponent(updated.id)}`, {
    method: "PUT",
    body: JSON.stringify(updated),
  });
}

/** Delete a devotional via the API (with POST ?_method=DELETE fallback) */
export async function deleteDevotionalAsync(id: string): Promise<void> {
  await apiDelete(`/devotionals.php?id=${encodeURIComponent(id)}`);
}

// ─── Mapped Headers ────────────────────────────────────────────────────────
// API-only — no localStorage fallback. Data is always fetched from server.

export interface MappedHeaderRecord {
  dateKey: string;
  fileName: string;
  dataUrl: string;
  filePath?: string;
}

/** Save a header image mapping to the API */
export async function saveMappedHeaderAsync(record: {
  dateKey: string;
  fileName: string;
  dataUrl: string;
  month: string;
  day: string;
  year?: number;
}): Promise<string> {
  const json = await api<{ filePath?: string; success?: boolean; error?: string }>("/headers.php", {
    method: "POST",
    body: JSON.stringify(record),
  });
  if (json.success) {
    return json.filePath ?? "";
  }
  // Throw on failure so callers can catch and display the error
  throw new Error(json.error || "Failed to save header image");
}

/** Load all header mappings from the API */
export async function getMappedHeadersAsync(): Promise<MappedHeaderRecord[]> {
  try {
    return await api<MappedHeaderRecord[]>("/headers.php");
  } catch {
    // API unavailable — return empty list
  }
  return [];
}

// ─── Settings ──────────────────────────────────────────────────────────────
// API-only for persistence. localStorage used only for fast read of local
// preferences (timezone, theme) — no data storage.

export async function saveSettingsAsync(settings: Record<string, string>): Promise<void> {
  await api("/settings.php", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getSettingsAsync(): Promise<Record<string, string>> {
  try {
    return await api<Record<string, string>>("/settings.php");
  } catch {
    // API unavailable
  }
  return {};
}
