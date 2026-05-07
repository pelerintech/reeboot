/**
 * Knowledge Manager Extension
 *
 * Provides domain knowledge management for the reeboot agent via:
 *   - Local document ingestion (md/txt/csv/pdf)
 *   - Hybrid search (vector + FTS5) over ingested corpus
 *   - Optional wiki synthesis layer (LLM-maintained markdown pages)
 *
 * Registers:
 *   - `knowledge_search`  (when knowledge.enabled)
 *   - `knowledge_ingest`  (when knowledge.enabled)
 *   - `knowledge_file`    (when knowledge.wiki.enabled)
 *   - `knowledge_lint`    (when knowledge.wiki.enabled)
 *
 * Lifecycle hooks:
 *   - before_agent_start — injects wiki schema block when wiki.enabled
 *   - agent_end          — checks pending files, triggers ingest notification
 *   - session_shutdown   — stops file watcher
 */

import { Type } from 'typebox';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { nanoid } from 'nanoid';
import type Database from 'better-sqlite3';
import type { KnowledgeConfig } from '../src/config.js';
import { loadVecExtension, runKnowledgeMigration } from '../src/db/index.js';
import { ingestDocument } from '../src/knowledge/ingest.js';
import { hybridSearch } from '../src/knowledge/search.js';
import { KnowledgeWatcher } from '../src/knowledge/watcher.js';

// ─── Directory init ───────────────────────────────────────────────────────────

export function initKnowledgeDirs(rawDir: string, wikiDir?: string): void {
  mkdirSync(join(rawDir, 'template'), { recursive: true });
  mkdirSync(join(rawDir, 'owner'), { recursive: true });

  if (wikiDir) {
    mkdirSync(join(wikiDir, 'concepts'), { recursive: true });
    mkdirSync(join(wikiDir, 'sources'), { recursive: true });
    mkdirSync(join(wikiDir, 'comparisons'), { recursive: true });

    const indexPath = join(wikiDir, 'index.md');
    if (!existsSync(indexPath)) {
      writeFileSync(indexPath, '# Knowledge Wiki Index\n\nNo pages yet.\n', 'utf-8');
    }
    const logPath = join(wikiDir, 'log.md');
    if (!existsSync(logPath)) {
      writeFileSync(logPath, '# Wiki Activity Log\n\n', 'utf-8');
    }
  }
}

// ─── Wiki system prompt block ─────────────────────────────────────────────────

export function buildWikiBlock(wikiDir: string): string {
  return `
## Knowledge Base Wiki

Your wiki lives at ${wikiDir}. You maintain it entirely.
- wiki/index.md — master catalog, update on every ingest
- wiki/log.md — append-only activity record
- wiki/concepts/ — domain concept pages
- wiki/sources/ — per-document summaries
- wiki/comparisons/ — filed query insights

Every wiki page has YAML frontmatter:
  source_tier: wiki-synthesis
  confidence: low | medium | high
  sources: [list of doc ids]
  updated: YYYY-MM-DD

When answering questions, search the knowledge base first (knowledge_search), then check the wiki index.
When filing insights, use the knowledge_file tool.

## Citation Rules

Every answer that draws on the knowledge base must cite its sources. Citation format:
  [filename | source_tier | confidence]

Rules:
- Always include source_tier and confidence in citations so the owner can judge trustworthiness.
- wiki-synthesis pages MUST be flagged: append "(verify against primary sources)" to every wiki citation.
- Never present wiki-synthesis content as equivalent to raw source content.
- When a wiki page contradicts a raw source, the raw source takes precedence.
- If confidence is 'low', flag it: append "(low confidence — treat with caution)".
`;
}

// ─── Wiki context helper ─────────────────────────────────────────────────────

/**
 * Reads wiki/index.md, extracts concept page references, reads matching
 * concept pages, and returns a formatted wiki context string for the query.
 * Returns null if wiki dir doesn't exist or index is empty.
 */
export function readWikiContext(wikiDir: string, query: string): string | null {
  const indexPath = join(wikiDir, 'index.md');
  if (!existsSync(indexPath)) return null;

  let indexContent: string;
  try {
    indexContent = readFileSync(indexPath, 'utf-8');
  } catch {
    return null;
  }

  // Extract all concept page filenames referenced in index.md
  // Matches: [[concept-name]], links like [text](concepts/foo.md), or ## headers
  const refs = new Set<string>();

  // [[wiki-link]] style
  for (const m of indexContent.matchAll(/\[\[([^\]]+)\]\]/g)) {
    refs.add(m[1].trim().toLowerCase().replace(/\s+/g, '-'));
  }

  // ## Header style — treat as concept names
  for (const m of indexContent.matchAll(/^##\s+([^\n]+)/gm)) {
    refs.add(m[1].trim().toLowerCase().replace(/\s+/g, '-'));
  }

  if (refs.size === 0) return null;

  // Normalise query to find relevant concept pages
  const queryWords = new Set(
    query.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
  );

  const conceptsDir = join(wikiDir, 'concepts');
  const wikiSections: string[] = [];

  for (const ref of refs) {
    // Check if this concept is relevant to the query (word overlap)
    const refWords = ref.split('-');
    const isRelevant = refWords.some((w) => queryWords.has(w)) ||
      Array.from(queryWords).some((qw) => ref.includes(qw));
    if (!isRelevant) continue;

    // Try to find matching concept page file
    const candidateFiles = [
      join(conceptsDir, `${ref}.md`),
      join(conceptsDir, `${ref.replace(/-/g, ' ')}.md`),
    ];

    for (const filePath of candidateFiles) {
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          // Take first 500 chars of the page as excerpt
          const excerpt = content.slice(0, 500).trim();
          wikiSections.push(`**${basename(filePath)}** (wiki-synthesis/verify against primary sources):\n${excerpt}`);
        } catch { /* skip unreadable pages */ }
        break;
      }
    }
  }

  if (wikiSections.length === 0) return null;
  return wikiSections.join('\n\n');
}

// ─── makeKnowledgeExtension ───────────────────────────────────────────────────

export interface KnowledgeExtensionOptions {
  rawDir?: string;
  wikiDir?: string;
}

/**
 * Core extension factory. Accepts optional directory overrides for tests.
 */
export function makeKnowledgeExtension(
  pi: ExtensionAPI,
  options?: KnowledgeExtensionOptions
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = (pi as any).getConfig?.() ?? {};
  const knowledgeConfig: KnowledgeConfig = config.knowledge ?? {
    enabled: false,
    embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
    dimensions: 768,
    chunkSize: 512,
    chunkOverlap: 64,
    wiki: { enabled: false, lint: { schedule: '0 9 * * 1' } },
  };

  if (!knowledgeConfig.enabled) return;

  const knowledgeBase = join(homedir(), '.reeboot', 'knowledge');
  const rawDir = options?.rawDir ?? join(knowledgeBase, 'raw');
  const wikiDir = options?.wikiDir ?? join(knowledgeBase, 'wiki');
  const wikiEnabled = knowledgeConfig.wiki?.enabled ?? false;

  // Init directories
  initKnowledgeDirs(rawDir, wikiEnabled ? wikiDir : undefined);

  // Resolve db early — needed for sqlite-vec extension loading and schema migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (pi as any).getDb?.() as Database.Database | undefined;

  // Load sqlite-vec extension and run knowledge schema migration
  // (gated on knowledge.enabled — only runs when this extension is active)
  if (db) {
    loadVecExtension(db);
    runKnowledgeMigration(db);
  }

  // Lint scheduled task (when wiki is enabled)
  if (wikiEnabled) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scheduler = (pi as any).getScheduler?.();
    if (scheduler) {
      scheduler.registerJob({
        id: '__knowledge_lint__',
        contextId: 'main',
        schedule: knowledgeConfig.wiki?.lint?.schedule ?? '0 9 * * 1',
        prompt:
          '__knowledge_lint__: Run a knowledge wiki lint pass. ' +
          'Use the knowledge_lint tool to health-check the wiki and report findings via the owner channel.',
      });
    }
  }

  // File watcher
  let watcher: KnowledgeWatcher | null = null;

  if (db) {
    watcher = new KnowledgeWatcher(db);
    watcher.start(rawDir);
  }

  // ── before_agent_start — pause watcher while agent is processing ─────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pi.on('before_agent_start', async (event: any) => {
    // Close-while-processing: pause the watcher so file events don't accumulate
    // during agent processing. Resume on agent_end.
    watcher?.pause();

    if (wikiEnabled) {
      const wikiBlock = buildWikiBlock(wikiDir);
      return { systemPrompt: (event.systemPrompt ?? '') + wikiBlock };
    }
    return event;
  });

  // ── agent_end — resume watcher, check pending files ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pi.on('agent_end', async () => {
    // Resume watching after agent processing completes
    watcher?.resume();

    if (!watcher) return;
    const pending = watcher.getPendingFiles();
    if (pending.length === 0) return;

    const fileList = pending
      .map((f) => {
        const tier = f.includes('/owner/') ? 'owner' : 'template';
        return ` - ${f.split('/').pop()} (${tier})`;
      })
      .join('\n');

    const message =
      `I found ${pending.length} new document(s) to ingest:\n${fileList}\n\n` +
      `Would you like to go through them together (interactive), or shall I ` +
      `process them and send you a summary when done (silent)?`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pi as any).sendUserMessage?.(message);
  });

  // ── session_shutdown ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pi.on('session_shutdown', async () => {
    watcher?.stop();
  });

  // ── knowledge_search tool ─────────────────────────────────────────────────
  pi.registerTool({
    name: 'knowledge_search',
    label: 'Knowledge Search',
    description:
      'Search the domain knowledge corpus using hybrid vector + keyword search. ' +
      'Returns relevant document excerpts with source citations (filename, tier, confidence).',
    parameters: Type.Object({
      query: Type.String({ description: 'Search query' }),
      limit: Type.Optional(
        Type.Number({ description: 'Maximum results to return (default: 5)', minimum: 1, maximum: 20 })
      ),
    }),
    execute: async (_id: string, params: { query: string; limit?: number }) => {
      if (!db) {
        return { content: [{ type: 'text' as const, text: 'Database not available.' }] };
      }
      const results = await hybridSearch(params.query, params.limit ?? 5, knowledgeConfig, db);
      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No results found.' }] };
      }

      const formatted = results.map((r, i) => {
        const tierBadge = `[${r.source_tier}/${r.confidence}]`;
        return `${i + 1}. **${r.filename}** ${tierBadge}\n${r.content}`;
      });

      let output = `Found ${results.length} result(s):\n\n${formatted.join('\n\n')}`;

      // If wiki is enabled, augment with relevant concept page context
      if (wikiEnabled) {
        const wikiContext = readWikiContext(wikiDir, params.query);
        if (wikiContext) {
          output += `\n\n---\n\n## Wiki context\n\n${wikiContext}`;
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: output,
        }],
      };
    },
  });

  // ── knowledge_ingest tool ─────────────────────────────────────────────────
  pi.registerTool({
    name: 'knowledge_ingest',
    label: 'Knowledge Ingest',
    description:
      'Ingest a document into the knowledge corpus. Extracts text, chunks, embeds, and indexes it. ' +
      'Supports .md, .txt, .csv, and .pdf files.',
    parameters: Type.Object({
      filePath: Type.String({ description: 'Absolute path to the file to ingest' }),
      sourceTier: Type.Optional(
        Type.Union([Type.Literal('template'), Type.Literal('owner')], {
          description: 'Source tier: template (pre-packaged) or owner (user-added). Default: owner',
        })
      ),
      confidence: Type.Optional(
        Type.Union(
          [Type.Literal('high'), Type.Literal('medium'), Type.Literal('low')],
          { description: 'Content quality confidence. Default: medium' }
        )
      ),
    }),
    execute: async (_id: string, params: { filePath: string; sourceTier?: 'template' | 'owner'; confidence?: 'high' | 'medium' | 'low' }) => {
      if (!db) {
        return { content: [{ type: 'text' as const, text: 'Database not available.' }] };
      }
      const result = await ingestDocument(
        params.filePath,
        params.sourceTier ?? 'owner',
        params.confidence ?? 'medium',
        knowledgeConfig,
        db
      );
      return {
        content: [{
          type: 'text' as const,
          text: `Ingested successfully: ${result.chunkCount} chunks, confidence=${result.confidence}, docId=${result.docId}`,
        }],
      };
    },
  });

  // ── Wiki tools (gated by wiki.enabled) ──────────────────────────────────
  if (wikiEnabled) {
    // knowledge_file — file a query insight as a wiki page
    pi.registerTool({
      name: 'knowledge_file',
      label: 'Knowledge File',
      description:
        'File a query insight or analysis as a new wiki page. ' +
        'Creates the markdown file in the appropriate wiki subdirectory.',
      parameters: Type.Object({
        content: Type.String({ description: 'Markdown content of the wiki page' }),
        filename: Type.String({ description: 'Filename for the wiki page (e.g. "moe-routing.md")' }),
        pageType: Type.Union(
          [Type.Literal('concept'), Type.Literal('source'), Type.Literal('comparison')],
          { description: 'Type of wiki page determines which subdirectory it goes in' }
        ),
        confidence: Type.Optional(
          Type.Union([Type.Literal('high'), Type.Literal('medium'), Type.Literal('low')], {
            description: 'Content quality confidence for this wiki page. Default: low (wiki-synthesis pages are always lowest trust until verified)',
          })
        ),
      }),
      execute: async (_id: string, params: { content: string; filename: string; pageType: 'concept' | 'source' | 'comparison'; confidence?: 'high' | 'medium' | 'low' }) => {
        if (!db) {
          return { content: [{ type: 'text' as const, text: 'Database not available.' }] };
        }

        const subdir = `${params.pageType}s`;
        const filePath = join(wikiDir, subdir, params.filename);
        mkdirSync(join(wikiDir, subdir), { recursive: true });
        writeFileSync(filePath, params.content, 'utf-8');

        // Insert wiki_pages metadata row
        const id = nanoid();
        const pageConfidence = params.confidence ?? 'low';
        db.prepare(`
          INSERT INTO wiki_pages (id, path, page_type, source_tier, confidence, sources, updated_at)
          VALUES (?, ?, ?, 'wiki-synthesis', ?, '[]', datetime('now'))
          ON CONFLICT(path) DO UPDATE SET
            confidence = excluded.confidence,
            updated_at = excluded.updated_at
        `).run(id, filePath, params.pageType, pageConfidence);

        return {
          content: [{
            type: 'text' as const,
            text: `Filed wiki page: ${filePath}`,
          }],
        };
      },
    });

    // knowledge_lint — health-check the wiki
    pi.registerTool({
      name: 'knowledge_lint',
      label: 'Knowledge Lint',
      description:
        'Run a health-check on the knowledge wiki. Identifies contradictions, orphan pages, ' +
        'missing concept pages, and stale claims.',
      parameters: Type.Object({}),
      execute: async (_id: string) => {
        const { existsSync: fsExists, readFileSync: fsRead, readdirSync: fsReaddir } = await import('fs');

        // Read wiki pages from db for lint report
        const pages = db
          ? (db.prepare('SELECT id, path, page_type, confidence, sources, updated_at FROM wiki_pages').all() as Array<{
              id: string;
              path: string;
              page_type: string;
              confidence: string;
              sources: string;
              updated_at: string;
            }>)
          : [];

        const issues: string[] = [];

        // ── Orphan pages ─────────────────────────────────────────────────────
        // Wiki pages registered in db whose files no longer exist on filesystem
        const orphanPages: string[] = [];
        for (const page of pages) {
          if (!fsExists(page.path)) {
            orphanPages.push(page.path);
            issues.push(`Orphan page (file missing): ${page.path}`);
          }
        }

        // ── Missing concept pages ─────────────────────────────────────────────
        // Scan source summary pages for mentioned concepts that lack own pages
        const conceptPaths = new Set(
          pages
            .filter((p) => p.page_type === 'concept' && fsExists(p.path))
            .map((p) => {
              const basename = p.path.split('/').pop() ?? '';
              return basename.replace(/\.md$/, '').toLowerCase();
            })
        );
        const missingConcepts: string[] = [];
        const conceptsDir = join(wikiDir, 'concepts');
        // Also scan index.md for referenced concepts
        const indexPath = join(wikiDir, 'index.md');
        if (fsExists(indexPath)) {
          try {
            const indexContent = fsRead(indexPath, 'utf-8');
            // Look for [[concept]] wiki-link patterns or ## Concept headers
            const conceptRefs = Array.from(
              indexContent.matchAll(/\[\[([^\]]+)\]\]|##\s+([^\n]+)/g)
            ).map((m) => (m[1] ?? m[2]).trim().toLowerCase());
            for (const ref of conceptRefs) {
              if (ref && !conceptPaths.has(ref) && ref !== 'knowledge base wiki') {
                if (!missingConcepts.includes(ref)) {
                  missingConcepts.push(ref);
                  issues.push(`Missing concept page for mentioned concept: "${ref}"`);
                }
              }
            }
          } catch { /* skip on read error */ }
        }

        // ── Stale claims ──────────────────────────────────────────────────────
        // Pages that reference source docs, but those sources have been re-ingested
        // with a newer ingested_at than the page's updated_at
        const stalePages: string[] = [];
        if (db) {
          for (const page of pages) {
            if (!fsExists(page.path)) continue;
            let sourcesArr: string[] = [];
            try { sourcesArr = JSON.parse(page.sources); } catch { continue; }
            for (const docId of sourcesArr) {
              const src = db
                .prepare('SELECT ingested_at FROM knowledge_sources WHERE id = ? AND status = ?')
                .get(docId, 'ingested') as { ingested_at: string } | undefined;
              if (src && src.ingested_at && src.ingested_at > page.updated_at) {
                if (!stalePages.includes(page.path)) {
                  stalePages.push(page.path);
                  issues.push(`Stale claims: page ${page.path.split('/').pop()} may reference outdated source (source re-ingested after page was written)`);
                }
              }
            }
          }
        }

        // ── Contradictions ────────────────────────────────────────────────────
        // Read concept pages and look for contradiction markers (⚠️ / CONTRADICTS / vs. or "but" negation patterns)
        const contradictions: string[] = [];
        for (const page of pages) {
          if (page.page_type !== 'concept' || !fsExists(page.path)) continue;
          try {
            const content = fsRead(page.path, 'utf-8');
            // Heuristic contradiction markers
            if (/CONTRADICTS|contradicts|⚠️.*contradict|vs\.|however.*states/i.test(content)) {
              contradictions.push(page.path.split('/').pop() ?? page.path);
              issues.push(`Possible contradiction flagged in concept page: ${page.path.split('/').pop()}`);
            }
          } catch { /* skip on read error */ }
        }

        if (pages.length === 0) {
          issues.push('Wiki is empty — no pages to lint.');
        }

        // ── Low-confidence clusters ────────────────────────────────────────────────────────────────────────
        // List of page filenames with confidence='low' (not just a count)
        const lowConfidenceClusters = pages
          .filter((p) => p.confidence === 'low' && fsExists(p.path))
          .map((p) => p.path.split('/').pop() ?? p.path);

        if (lowConfidenceClusters.length > 0) {
          issues.push(`Low-confidence cluster: ${lowConfidenceClusters.length} page(s) rated low — consider reviewing or promoting to medium/high after verification.`);
        }

        // ── Suggested next investigations ───────────────────────────────────────────────────────────────
        // Derived from what the lint found: each category with issues becomes a suggestion
        const suggestedNextInvestigations: string[] = [];

        if (contradictions.length > 0) {
          suggestedNextInvestigations.push(
            `Resolve contradictions in: ${contradictions.join(', ')} — review against primary sources and update or remove conflicting claims.`
          );
        }
        if (orphanPages.length > 0) {
          suggestedNextInvestigations.push(
            `Remove or restore ${orphanPages.length} orphan page(s) from wiki_pages registry: ${orphanPages.map((p) => p.split('/').pop()).join(', ')}.`
          );
        }
        if (missingConcepts.length > 0) {
          suggestedNextInvestigations.push(
            `Create missing concept page(s): ${missingConcepts.slice(0, 5).join(', ')}${missingConcepts.length > 5 ? ` (+${missingConcepts.length - 5} more)` : ''}.`
          );
        }
        if (stalePages.length > 0) {
          suggestedNextInvestigations.push(
            `Re-review and update ${stalePages.length} stale page(s) referencing re-ingested sources: ${stalePages.map((p) => p.split('/').pop()).join(', ')}.`
          );
        }
        if (lowConfidenceClusters.length > 0) {
          suggestedNextInvestigations.push(
            `Verify and elevate confidence on ${lowConfidenceClusters.length} low-confidence page(s): ${lowConfidenceClusters.slice(0, 3).join(', ')}${lowConfidenceClusters.length > 3 ? ' ...' : ''}.`
          );
        }
        if (suggestedNextInvestigations.length === 0) {
          suggestedNextInvestigations.push('Wiki looks healthy — no immediate investigations required.');
        }

        const report = {
          total_pages: pages.length,
          by_type: {
            concept: pages.filter((p) => p.page_type === 'concept').length,
            source: pages.filter((p) => p.page_type === 'source').length,
            comparison: pages.filter((p) => p.page_type === 'comparison').length,
          },
          low_confidence_clusters: lowConfidenceClusters,
          orphan_pages: orphanPages.map((p) => p.split('/').pop()),
          missing_concept_pages: missingConcepts,
          stale_claims: stalePages.map((p) => p.split('/').pop()),
          contradictions,
          issues,
          suggested_next_investigations: suggestedNextInvestigations,
        };

        return {
          content: [{
            type: 'text' as const,
            text: `## Wiki Lint Report\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\``,
          }],
        };
      },
    });
  }
}

// ─── Default export ───────────────────────────────────────────────────────────

export default function knowledgeManagerExtension(pi: ExtensionAPI): void {
  makeKnowledgeExtension(pi);
}
