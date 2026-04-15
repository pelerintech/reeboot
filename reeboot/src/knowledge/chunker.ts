/**
 * Sliding window text chunker with word-boundary respect and overlap.
 *
 * Splits `text` into chunks of at most `chunkSize` characters, with each
 * successive chunk beginning `overlap` characters back from where the
 * previous chunk ended. Word boundaries are respected — chunks are never
 * split mid-word.
 */
export function chunk(text: string, chunkSize: number, overlap: number): string[] {
  if (!text || text.trim().length === 0) return [];

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let startIdx = 0;

  while (startIdx < words.length) {
    // Build a chunk by accumulating words until chunkSize is reached
    let current = '';
    let endIdx = startIdx;

    while (endIdx < words.length) {
      const next = current ? current + ' ' + words[endIdx] : words[endIdx];
      if (next.length > chunkSize && current.length > 0) {
        // Adding the next word would exceed chunkSize — stop here
        break;
      }
      current = next;
      endIdx++;
    }

    // If a single word exceeds chunkSize, include it anyway (can't split)
    if (current.length === 0 && endIdx < words.length) {
      current = words[endIdx];
      endIdx++;
    }

    chunks.push(current.trim());

    if (endIdx >= words.length) break;

    // Move start back by `overlap` characters to create overlap between chunks
    // Find the word index where the overlap starts
    const chunkEnd = endIdx;
    let overlapChars = 0;
    let overlapStart = chunkEnd - 1;

    while (overlapStart > startIdx && overlapChars < overlap) {
      overlapChars += words[overlapStart].length + 1; // +1 for the space
      overlapStart--;
    }

    // Ensure progress — always move at least one word forward
    startIdx = Math.max(startIdx + 1, overlapStart + 1);
  }

  return chunks;
}
