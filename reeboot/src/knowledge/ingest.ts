import { createHash } from 'crypto';
import { basename, extname } from 'path';
import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import type Database from 'better-sqlite3';
import type { KnowledgeConfig } from '../config.js';
import { extractText } from './extractor.js';
import { chunk } from './chunker.js';
import { embed } from './embedder.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestResult {
  docId: string;
  chunkCount: number;
  confidence: 'high' | 'medium' | 'low';
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function hashFile(filePath: string): string {
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

function detectFormat(filePath: string): string {
  const ext = extname(filePath).toLowerCase().replace('.', '');
  if (!ext) return 'plain';
  return ['md', 'txt', 'csv', 'pdf'].includes(ext) ? ext : 'plain';
}

// ─── ingestDocument ──────────────────────────────────────────────────────────

/**
 * Full ingest pipeline for a single document.
 *
 * Steps:
 * 1. Hash file content for dedup
 * 2. Extract text (format-dependent)
 * 3. Chunk with overlap
 * 4. Embed all chunks (batched)
 * 5. Delete old chunks for this path (re-ingest case)
 * 6. Insert into knowledge_chunks (vec0) + knowledge_fts
 * 7. Upsert knowledge_sources row
 */
export async function ingestDocument(
  filePath: string,
  sourceTier: 'template' | 'owner',
  confidence: 'high' | 'medium' | 'low',
  config: KnowledgeConfig,
  db: Database.Database
): Promise<IngestResult> {
  const hash = hashFile(filePath);
  const filename = basename(filePath);
  const format = detectFormat(filePath);

  // Check for unchanged existing document
  const existing = db
    .prepare('SELECT id, hash FROM knowledge_sources WHERE path = ?')
    .get(filePath) as { id: string; hash: string } | undefined;

  if (existing && existing.hash === hash) {
    // Same content — skip ingest, return existing result
    const row = db
      .prepare('SELECT id, chunk_count, confidence FROM knowledge_sources WHERE path = ?')
      .get(filePath) as { id: string; chunk_count: number; confidence: string };
    return {
      docId: row.id,
      chunkCount: row.chunk_count,
      confidence: row.confidence as 'high' | 'medium' | 'low',
    };
  }

  const docId = existing?.id ?? nanoid();

  try {
    // Step 1: Extract text
    const text = await extractText(filePath);

    // Step 2: Chunk
    const chunks = chunk(text, config.chunkSize, config.chunkOverlap);

    // Step 3: Embed all chunks
    const embeddings = await embed(chunks, 'search_document', config.embeddingModel, config.dimensions);

    // Step 4: Delete old chunks (for re-ingest case)
    if (existing) {
      db.prepare('DELETE FROM knowledge_fts WHERE doc_id = ?').run(docId);
      // For vec0, delete by rowid — we need to track rowids
      // vec0 supports DELETE WHERE auxiliary column equality
      db.prepare('DELETE FROM knowledge_chunks WHERE doc_id = ?').run(docId);
    }

    // Step 5: Insert new chunks
    const insertChunk = db.prepare(
      `INSERT INTO knowledge_chunks (embedding, doc_id, chunk_index, content)
       VALUES (?, ?, ?, ?)`
    );
    const insertFts = db.prepare(
      `INSERT INTO knowledge_fts (content, doc_id, chunk_index, source_tier)
       VALUES (?, ?, ?, ?)`
    );

    const insertAll = db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const vec = embeddings[i];
        const buf = Buffer.from(vec.buffer);
        // chunk_index stored as TEXT in vec0 auxiliary column (sqlite-vec constraint)
        insertChunk.run(buf, docId, String(i), chunks[i]);
        insertFts.run(chunks[i], docId, i, sourceTier);
      }
    });

    insertAll();

    // Step 6: Upsert knowledge_sources
    db.prepare(`
      INSERT INTO knowledge_sources (id, path, hash, source_tier, confidence, filename, format, chunk_count, status, ingested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ingested', datetime('now'))
      ON CONFLICT(path) DO UPDATE SET
        hash = excluded.hash,
        confidence = excluded.confidence,
        chunk_count = excluded.chunk_count,
        status = 'ingested',
        ingested_at = excluded.ingested_at,
        error = NULL
    `).run(docId, filePath, hash, sourceTier, confidence, filename, format, chunks.length);

    return { docId, chunkCount: chunks.length, confidence };
  } catch (err) {
    // Record error in knowledge_sources
    const errMsg = err instanceof Error ? err.message : String(err);

    db.prepare(`
      INSERT INTO knowledge_sources (id, path, hash, source_tier, confidence, filename, format, chunk_count, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'error', ?)
      ON CONFLICT(path) DO UPDATE SET
        status = 'error',
        error = excluded.error
    `).run(docId, filePath, hash, sourceTier, confidence, filename, format, errMsg);

    throw err;
  }
}
