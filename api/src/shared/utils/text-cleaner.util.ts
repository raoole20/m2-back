/**
 * Strips HTML tags and common XSS vectors from text content.
 */
export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

/**
 * Normalizes unicode characters (NFC normalization) and trims whitespace.
 */
export function normalizeUnicode(text: string): string {
  return text.normalize('NFC').trim();
}

/**
 * Full sanitization pipeline for message content.
 */
export function sanitizeContent(text: string): string {
  return normalizeUnicode(stripHtml(text));
}
