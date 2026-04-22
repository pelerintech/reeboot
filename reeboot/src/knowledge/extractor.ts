import { readFileSync } from 'fs';
import { extname } from 'path';

// ─── Binary detection ─────────────────────────────────────────────────────────

/**
 * Checks if a buffer contains a null byte — a reliable binary file indicator
 * for common binary formats (images, executables, archives).
 */
function isBinary(buf: Buffer): boolean {
  return buf.indexOf(0) !== -1;
}

// ─── CSV extraction ───────────────────────────────────────────────────────────

/**
 * Parses a CSV string and transforms rows into column-context format:
 * "Col1: val1, Col2: val2" — one entry per row, self-contained.
 */
function extractCsv(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return '';

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const parts = headers.map((h, idx) => `${h}: ${values[idx] ?? ''}`);
    rows.push(parts.join(', '));
  }

  return rows.join('\n');
}

// ─── PDF extraction ───────────────────────────────────────────────────────────

async function extractPdf(filePath: string): Promise<string> {
  // Dynamically import to allow mocking in tests
  const pdfModule = await import('pdf-parse');

  // pdf-parse v2 API: PDFParse is a class constructor
  // Usage: new PDFParse({ verbosity: 0 }), parser.load(data), parser.getText()
  const PDFParse = (pdfModule as any).PDFParse ?? (pdfModule as any).default;

  const buf = readFileSync(filePath);
  const data = new Uint8Array(buf);

  if (typeof PDFParse === 'function') {
    // pdf-parse v2: class-based API
    // Data must be passed in constructor options (not to load())
    // new PDFParse({ verbosity: 0, data: Uint8Array }) then parser.load() then parser.getText()
    const parser = new PDFParse({ verbosity: 0, data });
    await parser.load();
    const textResult = await parser.getText();
    await parser.destroy?.();
    // v2 getText() returns { text, pages, total }
    const rawText = typeof textResult === 'string' ? textResult : (textResult.text ?? '');
    // Strip PDF metadata/headers: remove lines that look like PDF internal markers
    return rawText
      .replace(/^%PDF[^\n]*\n?/gm, '')          // %PDF headers
      .replace(/^\d+ \d+ obj[\s\S]*?endobj/gm, '') // PDF object markers
      .trim();
  }

  // Last-resort fallback
  const result = await (pdfModule as any)(buf);
  return result.text ?? '';
}

// ─── extractText ─────────────────────────────────────────────────────────────

/**
 * Extracts plain text from a file at `filePath`.
 * Dispatches based on file extension:
 *   .md, .txt, and unrecognised → read as plain text
 *   .csv → column-context transform
 *   .pdf → pdf-parse
 *
 * Throws if the file contains binary content (null byte detection).
 */
export async function extractText(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return extractPdf(filePath);
  }

  // For all text-based formats: read buffer first to detect binary
  const buf = readFileSync(filePath);

  if (isBinary(buf)) {
    throw new Error(
      `Cannot process binary file: ${filePath}. Only text-based formats are supported.`
    );
  }

  const text = buf.toString('utf-8');

  if (ext === '.csv') {
    return extractCsv(text);
  }

  // .md, .txt, .log, .yaml, and any other plain-text format
  return text;
}
