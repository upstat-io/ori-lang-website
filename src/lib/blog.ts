/** Shared blog helpers: date formatting + reading time. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function formatDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function shortDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}`;
}

/** Estimated reading time in minutes from raw markdown (220 wpm, min 1). */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const words = body
    .replace(/```[\s\S]*?```/g, ' ')   // code blocks read faster than prose counts suggest
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** First ~N words of body prose (markdown stripped) for index excerpts. */
export function excerpt(body: string | undefined, words = 46): string {
  if (!body) return '';
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/[*_`>\[\]]/g, '')
    .replace(/\(([^)]*)\)/g, '')
    .replace(/^---$/gm, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const slice = text.slice(0, words).join(' ');
  return text.length > words ? `${slice}…` : slice;
}
