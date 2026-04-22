import type Database from 'better-sqlite3';
import type { KnowledgeConfig } from '../config.js';
import { embedOne } from './embedder.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  content: string;
  filename: string;
  source_tier: 'template' | 'owner';
  confidence: 'high' | 'medium' | 'low';
  doc_id: string;
  chunk_index: number;
  score: number;
}

// ─── hybridSearch ─────────────────────────────────────────────────────────────

/**
 * Hybrid search: combines vector KNN (sqlite-vec) and FTS5 keyword search.
 *
 * 1. Embed query with `search_query:` prefix
 * 2. Vector KNN search on knowledge_chunks → top-k by cosine distance
 * 3. FTS5 keyword search on knowledge_fts → exact matches
 * 4. Merge and deduplicate (vector score takes precedence)
 * 5. Enrich with knowledge_sources metadata
 * 6. Return SearchResult[]
 */
export async function hybridSearch(
  query: string,
  limit: number,
  config: KnowledgeConfig,
  db: Database.Database
): Promise<SearchResult[]> {
  // Check if corpus is empty
  const countRow = db.prepare('SELECT COUNT(*) as count FROM knowledge_sources WHERE status = ?').get('ingested') as { count: number };
  if (countRow.count === 0) return [];

  // Step 1: Embed the query
  const queryVec = await embedOne(query, 'search_query', config.embeddingModel, config.dimensions);
  const queryBuf = Buffer.from(queryVec.buffer);

  // Step 2: Vector KNN search
  const vectorResults: Array<{ doc_id: string; chunk_index: string; content: string; distance: number }> = [];
  try {
    const rows = db.prepare(`
      SELECT doc_id, chunk_index, content, distance
      FROM knowledge_chunks
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(queryBuf, limit * 2) as typeof vectorResults;
    vectorResults.push(...rows);
  } catch {
    // vec0 may return no results if empty — ignore
  }

  // Step 3: FTS5 keyword search
  const ftsResults: Array<{ doc_id: string; chunk_index: number; content: string }> = [];
  try {
    // Sanitize query for FTS5 (escape special chars)
    const sanitizedQuery = query.replace(/['"*^()]/g, ' ').trim();
    if (sanitizedQuery.length > 0) {
      const rows = db.prepare(`
        SELECT doc_id, chunk_index, content
        FROM knowledge_fts
        WHERE knowledge_fts MATCH ?
        LIMIT ?
      `).all(sanitizedQuery, limit * 2) as typeof ftsResults;
      ftsResults.push(...rows);
    }
  } catch {
    // FTS may fail on complex queries — ignore and rely on vector results
  }

  // Step 4: Merge and deduplicate (vector score takes precedence)
  const merged = new Map<string, { doc_id: string; chunk_index: number; content: string; score: number }>();

  for (const r of vectorResults) {
    const key = `${r.doc_id}:${r.chunk_index}`;
    // Convert distance to score (lower distance = higher score)
    const score = 1 / (1 + r.distance);
    merged.set(key, {
      doc_id: r.doc_id,
      chunk_index: parseInt(r.chunk_index, 10),
      content: r.content,
      score,
    });
  }

  for (const r of ftsResults) {
    const key = `${r.doc_id}:${r.chunk_index}`;
    if (!merged.has(key)) {
      // FTS-only match — assign a base score
      merged.set(key, {
        doc_id: r.doc_id,
        chunk_index: r.chunk_index,
        content: r.content,
        score: 0.5,
      });
    }
  }

  // Step 5: Sort by score descending, take limit
  const sorted = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (sorted.length === 0) return [];

  // Step 6: Enrich with knowledge_sources metadata
  const sourceCache = new Map<string, { filename: string; source_tier: string; confidence: string }>();

  const results: SearchResult[] = [];
  for (const item of sorted) {
    let meta = sourceCache.get(item.doc_id);
    if (!meta) {
      const row = db.prepare(
        'SELECT filename, source_tier, confidence FROM knowledge_sources WHERE id = ?'
      ).get(item.doc_id) as { filename: string; source_tier: string; confidence: string } | undefined;

      if (!row) continue;
      meta = row;
      sourceCache.set(item.doc_id, meta);
    }

    results.push({
      content: item.content,
      filename: meta.filename,
      source_tier: meta.source_tier as 'template' | 'owner',
      confidence: meta.confidence as 'high' | 'medium' | 'low',
      doc_id: item.doc_id,
      chunk_index: item.chunk_index,
      score: item.score,
    });
  }

  return results;
}
