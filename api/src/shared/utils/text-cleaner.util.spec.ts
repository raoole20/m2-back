import {
  stripHtml,
  sanitizeContent,
  normalizeUnicode,
} from './text-cleaner.util';

describe('text-cleaner.util', () => {
  describe('stripHtml()', () => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<p>Hello</p>')).toBe('Hello');
      expect(stripHtml('<b>Bold</b> and <i>italic</i>')).toBe(
        'Bold and italic',
      );
      expect(stripHtml('<script>alert("xss")</script>')).toBe(
        'alert("xss")',
      );
    });

    it('should decode HTML entities', () => {
      expect(stripHtml('&lt;div&gt;')).toBe('<div>');
      expect(stripHtml('&amp;&quot;&#x27;')).toBe('&"\'');
    });
  });

  describe('normalizeUnicode()', () => {
    it('should normalize unicode characters and trim whitespace', () => {
      // Combining character e + acute vs pre-composed e-acute
      const decomposed = 'caf\u0065\u0301';
      const composed = 'caf\u00e9';

      expect(normalizeUnicode(decomposed)).toBe(composed);
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeUnicode('  hello  ')).toBe('hello');
      expect(normalizeUnicode('\n\tspaced\t\n')).toBe('spaced');
    });
  });

  describe('sanitizeContent()', () => {
    it('should apply the full sanitization pipeline', () => {
      const dirty = '  <b>Hello</b> &amp; world  ';
      const result = sanitizeContent(dirty);

      expect(result).toBe('Hello & world');
    });

    it('should handle empty strings', () => {
      expect(sanitizeContent('')).toBe('');
    });

    it('should handle strings with only HTML tags', () => {
      expect(sanitizeContent('<br/><hr/>')).toBe('');
    });
  });
});
