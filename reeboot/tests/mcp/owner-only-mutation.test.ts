/**
 * Task 9 — Owner-only memory/knowledge mutation for remote runners.
 *
 * A restricted (remote A2A/webhook) runner does NOT get the memory-write or
 * knowledge-corpus write tools registered, while a non-restricted (local
 * assistant) runner does. The natural-language "remove X from memory" write path
 * is therefore unavailable to remote turns. Reads (session_search, knowledge_search,
 * recall) remain available to both.
 */
import { describe, it, expect } from 'vitest';
import { makeMemoryExtension } from '@src/extensions/memory-manager.js';
import { makeKnowledgeExtension } from '@src/extensions/knowledge-manager.js';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

function recorder(restricted: boolean) {
  const tools: string[] = [];
  const pi = {
    context: { restricted },
    registerTool: (t: any) => { tools.push(t.name); },
    on: () => () => {},
  } as unknown as ExtensionAPI;
  return { pi, tools };
}

describe('owner-only mutation (restricted remote runners)', () => {
  it('memory write tool is NOT registered for a restricted runner; recall IS', () => {
    const { pi, tools } = recorder(true);
    makeMemoryExtension(pi, { memory: { enabled: true, provider: 'builtin', providerConfig: {} } });
    expect(tools).not.toContain('memory');      // write surface — owner-only
    expect(tools).toContain('session_search');  // read — always available
  });

  it('memory write tool IS registered for a non-restricted (local) runner', () => {
    const { pi, tools } = recorder(false);
    makeMemoryExtension(pi, { memory: { enabled: true, provider: 'builtin', providerConfig: {} } });
    expect(tools).toContain('memory');
  });

  it('knowledge write tools are NOT registered for a restricted runner; search IS', () => {
    const { pi, tools } = recorder(true);
    makeKnowledgeExtension(pi, {
      knowledge: { enabled: true, embeddingModel: 'x', dimensions: 3, chunkSize: 16, chunkOverlap: 4, wiki: { enabled: true } },
    });
    expect(tools).toContain('knowledge_search');
    expect(tools).not.toContain('knowledge_ingest');
    expect(tools).not.toContain('knowledge_file');
  });

  it('knowledge write tools ARE registered for a non-restricted (local) runner', () => {
    const { pi, tools } = recorder(false);
    makeKnowledgeExtension(pi, {
      knowledge: { enabled: true, embeddingModel: 'x', dimensions: 3, chunkSize: 16, chunkOverlap: 4, wiki: { enabled: true } },
    });
    expect(tools).toContain('knowledge_ingest');
    expect(tools).toContain('knowledge_file');
  });
});
