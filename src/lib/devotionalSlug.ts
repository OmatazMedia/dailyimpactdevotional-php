/**
 * devotionalSlug.ts
 *
 * Human-friendly share slugs for devotionals. Instead of exposing the random
 * UUID in the URL (e.g. ?devotional=13ecb7f2-79be-482c-9d83-2f714d2259f3) the
 * link uses the devotional's OWN date, e.g. ?devotional=5-aug-2025.
 *
 *   slugForDevotional("August 5", 2025) -> "5-aug-2025"
 *   findDevotionalBySlug(list, "5-aug-2025") -> the matching devotional
 *
 * The old UUID format is still parsed for backward compatibility, so links
 * shared before this change keep working.
 */

import { Devotional } from "../types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT: Record<string, string> = {
  jan: "jan", feb: "feb", mar: "mar", apr: "apr", may: "may", jun: "jun",
  jul: "jul", aug: "aug", sep: "sep", oct: "oct", nov: "nov", dec: "dec",
};

/** Normalize any month token to its 3-letter lowercase form. */
function monthToken(input: string): string {
  const clean = input.trim().toLowerCase();
  if (!clean) return "";
  // Already a short token (jan, feb, ...)
  if (MONTH_SHORT[clean]) return clean;
  // Full month name (January, ...)
  const full = MONTHS.find((m) => m.toLowerCase().startsWith(clean) && clean.length >= 3);
  if (full) return full.slice(0, 3).toLowerCase();
  // Partial / first-3-letters fallback
  return clean.slice(0, 3);
}

/**
 * Parse a devotional's `date` ("August 5", "5 August") into { month, day }.
 * Returns null when the day or month cannot be determined.
 */
export function parseDevotionalDate(dateStr: string): { month: string; day: number } | null {
  const clean = (dateStr || "").trim();
  if (!clean) return null;

  let month = "";
  let day = 0;

  const matchMD = clean.match(/^([A-Za-z]+)\s+(\d+)/);
  if (matchMD) {
    month = monthToken(matchMD[1]);
    day = parseInt(matchMD[2], 10);
  } else {
    const matchDM = clean.match(/^(\d+)\s+([A-Za-z]+)/);
    if (matchDM) {
      day = parseInt(matchDM[1], 10);
      month = monthToken(matchDM[2]);
    }
  }

  if (!month || !(day >= 1 && day <= 31)) return null;
  return { month, day };
}

/** Build the share slug: "5-aug-2025" (day-month-year, lowercase). */
export function slugForDevotional(dateStr: string, year: number): string {
  const parsed = parseDevotionalDate(dateStr);
  if (!parsed) return "";
  return `${parsed.day}-${parsed.month}-${year}`;
}

/** True when the string looks like the legacy UUID format. */
function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/**
 * Resolve a devotional from a `?devotional=` query value.
 * Accepts BOTH the new date slug ("5-aug-2025") and the legacy UUID.
 * Returns null when nothing matches.
 */
export function findDevotionalBySlug(
  list: Devotional[],
  rawValue: string | null,
): Devotional | null {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;

  // Legacy: exact UUID match (links shared before date slugs existed).
  if (isUuidLike(value)) {
    return list.find((d) => d.id === value) || null;
  }

  // New: date slug "day-mon-year", e.g. "5-aug-2025".
  const m = value.match(/^(\d{1,2})-([a-z]{3})-(\d{4})$/i);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const month = m[2].toLowerCase();
  const year = parseInt(m[3], 10);

  const exact = list.find((d) => {
    const parsed = parseDevotionalDate(d.date);
    return parsed !== null && parsed.day === day && parsed.month === month && d.year === year;
  });
  if (exact) return exact;

  // Same day+month in another year (someone shared a date that isn't in the
  // current archive) — prefer the entry whose year is CLOSEST to the link's
  // year so a 2025 link shows the 2025-adjacent devotional, not the oldest.
  let best: Devotional | null = null;
  let bestDistance = Infinity;
  for (const d of list) {
    const parsed = parseDevotionalDate(d.date);
    if (parsed === null || parsed.day !== day || parsed.month !== month) continue;
    const distance = Math.abs(d.year - year);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = d;
    }
  }
  return best;
}
