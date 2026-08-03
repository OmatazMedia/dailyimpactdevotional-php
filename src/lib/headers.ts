/**
 * Shared helpers for mapped header images.
 *
 * The Dashboard's header-mapping flow uploads banner images per date. Both
 * App (which preloads the map in parallel with the devotional list) and
 * DevotionalView (which needs the image on first paint) use these helpers so
 * the correct header renders immediately instead of popping in after a second
 * round-trip.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Normalize a date string like "July 20" / "July 20, 2026" / "20 July"
 * into a lookup key "july|20" so mapped headers match stored devotional dates.
 */
export const normalizeHeaderKey = (dateStr: string): string => {
  let month = "";
  let day = "";
  const clean = (dateStr || "").trim();
  const matchMD = clean.match(/^([A-Za-z]+)\s+(\d+)/i);
  if (matchMD) {
    month = matchMD[1];
    day = parseInt(matchMD[2], 10).toString();
  } else {
    const matchDM = clean.match(/^(\d+)\s+([A-Za-z]+)/i);
    if (matchDM) {
      day = parseInt(matchDM[1], 10).toString();
      month = matchDM[2];
    }
  }
  if (!month) {
    for (const m of MONTHS) {
      if (clean.toLowerCase().includes(m.toLowerCase())) {
        month = m;
        break;
      }
    }
    const numMatch = clean.match(/\d+/);
    if (numMatch) day = parseInt(numMatch[0], 10).toString();
  }
  if (!month || !day) return "";
  return `${month.toLowerCase()}|${day}`;
};

export interface HeaderMappingRow {
  dateKey: string;
  filePath?: string;
  dataUrl?: string;
}

/**
 * Build a dateKey -> url map from the /headers.php response array.
 */
export const buildHeaderMap = (rows: HeaderMappingRow[]): Record<string, string> => {
  const map: Record<string, string> = {};
  if (!Array.isArray(rows)) return map;
  for (const h of rows) {
    const url = h?.filePath || h?.dataUrl || "";
    if (!url) continue;
    const key = normalizeHeaderKey(h.dateKey);
    if (key) map[key] = url;
  }
  return map;
};
