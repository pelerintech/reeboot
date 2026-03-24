/**
 * web-search-snippets.test.ts
 *
 * Verifies that web-search extension tools carry promptSnippet fields
 * so they appear in the system prompt's "Available tools" section.
 */

import { describe, it, expect } from 'vitest';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

// Spy on registerTool to collect definitions without running the extension
async function collectWebSearchTools(): Promise<Map<string, ToolDefinition>> {
  const tools = new Map<string, ToolDefinition>();

  // Minimal mock of ExtensionAPI — only registerTool is needed
  const mockPi = {
    registerTool: (def: ToolDefinition) => { tools.set(def.name, def); },
    on: () => {},
    registerCommand: () => {},
    registerShortcut: () => {},
    registerFlag: () => {},
  } as any;

  // Import and invoke the extension factory with a minimal config
  const mod = await import('../src/extensions/web-search.ts');
  const config = { search: { provider: 'duckduckgo' } } as any;
  await mod.default(mockPi, config);

  return tools;
}

describe('web-search extension — promptSnippet', () => {
  it('web_search has a non-empty promptSnippet', async () => {
    const tools = await collectWebSearchTools();
    const tool = tools.get('web_search');
    expect(tool, 'web_search tool not registered').toBeDefined();
    expect(typeof tool!.promptSnippet).toBe('string');
    expect(tool!.promptSnippet!.trim().length).toBeGreaterThan(0);
  });

  it('fetch_url has a non-empty promptSnippet', async () => {
    const tools = await collectWebSearchTools();
    const tool = tools.get('fetch_url');
    expect(tool, 'fetch_url tool not registered').toBeDefined();
    expect(typeof tool!.promptSnippet).toBe('string');
    expect(tool!.promptSnippet!.trim().length).toBeGreaterThan(0);
  });

  it('web_search promptSnippet does not mention a specific backend', async () => {
    const tools = await collectWebSearchTools();
    const snippet = tools.get('web_search')!.promptSnippet ?? '';
    expect(snippet.toLowerCase()).not.toContain('searxng');
    expect(snippet.toLowerCase()).not.toContain('duckduckgo');
    expect(snippet.toLowerCase()).not.toContain('brave');
    expect(snippet.toLowerCase()).not.toContain('tavily');
    expect(snippet.toLowerCase()).not.toContain('serper');
    expect(snippet.toLowerCase()).not.toContain('exa');
  });
});
