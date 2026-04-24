import { randomBytes } from 'crypto';
import { encrypt, decrypt } from './crypto.util';

describe('crypto.util', () => {
  // AES-256 requires a 32-byte (64 hex chars) key
  const validKey = randomBytes(32).toString('hex');

  it('should encrypt and decrypt text correctly (roundtrip)', () => {
    const plaintext = 'Hello, secret world!';

    const encrypted = encrypt(plaintext, validKey);
    const decrypted = decrypt(encrypted, validKey);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'Same message every time';

    const encrypted1 = encrypt(plaintext, validKey);
    const encrypted2 = encrypt(plaintext, validKey);

    expect(encrypted1).not.toBe(encrypted2);

    // Both should still decrypt to the same value
    expect(decrypt(encrypted1, validKey)).toBe(plaintext);
    expect(decrypt(encrypted2, validKey)).toBe(plaintext);
  });

  it('should throw on invalid key', () => {
    const plaintext = 'test';
    const invalidKey = 'too-short';

    expect(() => encrypt(plaintext, invalidKey)).toThrow();
  });

  it('should throw on tampered ciphertext', () => {
    const plaintext = 'sensitive data';
    const encrypted = encrypt(plaintext, validKey);

    // Tamper with the encrypted portion (third segment after the second colon)
    const parts = encrypted.split(':');
    const tampered = parts[2].split('');
    tampered[0] = tampered[0] === 'a' ? 'b' : 'a';
    parts[2] = tampered.join('');
    const tamperedCiphertext = parts.join(':');

    expect(() => decrypt(tamperedCiphertext, validKey)).toThrow();
  });
});
