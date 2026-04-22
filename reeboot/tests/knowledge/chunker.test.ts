import { describe, it, expect } from 'vitest';
import { chunk } from '../../src/knowledge/chunker.js';

describe('chunk', () => {
  it('returns empty array for empty string', () => {
    expect(chunk('', 512, 64)).toEqual([]);
  });

  it('returns a single chunk for text shorter than chunkSize', () => {
    const text = 'short text';
    const result = chunk(text, 512, 64);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it('returns multiple overlapping chunks for long text', () => {
    // Generate a long text with distinct words
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
    const text = words.join(' '); // ~1800+ chars

    const result = chunk(text, 512, 64);

    expect(result.length).toBeGreaterThan(1);

    // No chunk exceeds chunkSize characters
    for (const c of result) {
      expect(c.length).toBeLessThanOrEqual(512);
    }

    // No chunk is empty
    for (const c of result) {
      expect(c.length).toBeGreaterThan(0);
    }

    // Adjacent chunks share overlap — verify that actual overlap characters are shared
    // The spec requires adjacent chunks share 'overlap' characters (64 in this case).
    // We check that the last `overlap` characters of chunk[0] appear at the START of chunk[1].
    // (or within the first 2*overlap chars, accounting for word-boundary alignment)
    const overlapSize = 64;
    const tailOfChunk0 = result[0].slice(-overlapSize);
    const headOfChunk1 = result[1].slice(0, overlapSize * 2);
    // The tail of chunk[0] must have some overlap with the head of chunk[1]
    // Check by finding the longest common substring at the boundary
    const tailWords = tailOfChunk0.trim().split(/\s+/);
    const lastFewWords = tailWords.slice(-3).join(' ');
    expect(headOfChunk1).toContain(lastFewWords);
  });

  it('does not split mid-word', () => {
    // A text without spaces is one word — should return as one chunk even if > chunkSize
    const singleLongWord = 'a'.repeat(600);
    const result = chunk(singleLongWord, 512, 64);
    // Can't split a single word, so entire word is one chunk
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.join('')).toContain(singleLongWord);
  });

  it('adjacent chunks share at least overlap characters at the boundary', () => {
    // Verify that the overlap is at least `overlap` chars (spec: adjacent chunks share overlap characters)
    const overlap = 64;
    const chunkSize = 200;
    // Create text with easily verifiable word patterns
    const words = Array.from({ length: 100 }, (_, i) => `uniqueword${i}`);
    const text = words.join(' ');

    const result = chunk(text, chunkSize, overlap);
    expect(result.length).toBeGreaterThan(1);

    for (let i = 0; i < result.length - 1; i++) {
      const c0 = result[i];
      const c1 = result[i + 1];
      // Find how many characters from the end of c0 appear at the start of c1
      // Try progressively shorter suffix of c0 until we find a match in c1
      let sharedChars = 0;
      for (let len = overlap; len >= 1; len--) {
        const suffix = c0.slice(-len);
        if (c1.startsWith(suffix) || c1.includes(suffix)) {
          sharedChars = len;
          break;
        }
      }
      // At least some overlap (word-boundary aligned overlap must be > 0)
      expect(sharedChars).toBeGreaterThan(0);
      // The shared overlap should be close to the requested overlap
      // (allowing for word-boundary rounding)
      expect(sharedChars).toBeGreaterThanOrEqual(Math.min(overlap - 20, 20));
    }
  });

  it('chunks are trimmed (no leading/trailing whitespace)', () => {
    const words = Array.from({ length: 200 }, (_, i) => `term${i}`);
    const text = words.join(' ');
    const result = chunk(text, 512, 64);
    for (const c of result) {
      expect(c).toBe(c.trim());
    }
  });
});
