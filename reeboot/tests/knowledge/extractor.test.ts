import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { extractText } from '../../src/knowledge/extractor.js';

function tmpDir(): string {
  const dir = join(tmpdir(), `extractor-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('extractText', () => {
  it('returns raw content for .md files', async () => {
    const dir = tmpDir();
    const path = join(dir, 'doc.md');
    writeFileSync(path, '# Hello\n\nThis is markdown.', 'utf-8');

    const result = await extractText(path);
    expect(result).toBe('# Hello\n\nThis is markdown.');
  });

  it('returns raw content for .txt files', async () => {
    const dir = tmpDir();
    const path = join(dir, 'notes.txt');
    writeFileSync(path, 'plain text content here', 'utf-8');

    const result = await extractText(path);
    expect(result).toBe('plain text content here');
  });

  it('returns column-context rows for .csv files', async () => {
    const dir = tmpDir();
    const path = join(dir, 'data.csv');
    writeFileSync(path, 'Name,Age,City\nAlice,30,London\nBob,25,Paris', 'utf-8');

    const result = await extractText(path);
    expect(result).toContain('Name: Alice');
    expect(result).toContain('Age: 30');
    expect(result).toContain('City: London');
    expect(result).toContain('Name: Bob');
    expect(result).toContain('Age: 25');
    expect(result).toContain('City: Paris');
  });

  it('returns plain text for unrecognised extensions (.log, .yaml)', async () => {
    const dir = tmpDir();
    const path = join(dir, 'output.log');
    writeFileSync(path, 'some log output', 'utf-8');

    const result = await extractText(path);
    expect(result).toBe('some log output');
  });

  it('throws an error for binary files (null byte detection)', async () => {
    const dir = tmpDir();
    const path = join(dir, 'image.png');
    // Write a buffer with a null byte — binary detection trigger
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]));

    await expect(extractText(path)).rejects.toThrow(/binary/i);
  });

  it('returns extracted text for .pdf files (real PDF buffer)', async () => {
    // Use a real system PDF to verify actual extraction without metadata/header noise
    const systemPdf = '/System/Library/Assistant/UIPlugins/MailUI.siriUIBundle/Contents/Resources/MessageListAttachmentTemplate.pdf';
    const { existsSync } = await import('fs');

    if (!existsSync(systemPdf)) {
      // Skip on non-macOS or missing file
      console.log('Skipping real PDF test — system PDF not available');
      return;
    }

    const result = await extractText(systemPdf);
    // Should return a string (even if minimal content for this PDF)
    expect(typeof result).toBe('string');
    // Should NOT contain raw PDF object markers (stripped)
    expect(result).not.toMatch(/^\d+ \d+ obj/m);
    // Should NOT contain %PDF header
    expect(result).not.toMatch(/^%PDF/m);
  });

  it('extracts and strips PDF metadata/headers from real PDF content', async () => {
    // This test verifies the metadata stripping logic by checking that
    // the returned text is clean of PDF structural markers
    const systemPdf = '/System/Library/Assistant/UIPlugins/MailUI.siriUIBundle/Contents/Resources/MessageListAttachmentTemplate.pdf';
    const { existsSync } = await import('fs');

    if (!existsSync(systemPdf)) {
      console.log('Skipping PDF header stripping test — system PDF not available');
      return;
    }

    const result = await extractText(systemPdf);
    // Verify no PDF internal structure appears in the output
    expect(result).not.toContain('BT ');
    expect(result).not.toContain('endstream');
    expect(result).not.toContain('xref');
  });
});
