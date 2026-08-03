export interface Devotional {
  id: string;
  date: string; // e.g., "June 29"
  year: number; // e.g., 2026
  title: string;
  scriptureRef: string; // e.g., "James 1:1-8 (NKJV)"
  scriptureText: string;
  paragraphs: string[];
  additionalScripture: string; // e.g., "John 16:33"
  prayerConfession: string;
  bibleReading: string; // e.g., "Psalm 27"
  author: string; // e.g., "Dr. Andy Osakwe"
  imageUrl?: string;
}

export interface ForewordPost {
  id: string;
  title: string;
  content: string; // HTML from the rich text editor
  author: string;
  publishedAt: string; // ISO date string
  updatedAt?: string;
}
