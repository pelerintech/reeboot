import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock budget-manager to capture its call arguments
const budgetExtensionSpy = vi.fn();
vi.mock('../../src/extensions/budget-manager.js', () => ({
  makeBudgetManagerExtension: budgetExtensionSpy,
}));

// Mock ALL the file-based extensions to avoid resolution issues
const noopExtension = vi.fn();
vi.mock('../../src/extensions/confirm-destructive.js', () => ({ default: noopExtension }));
vi.mock('../../src/extensions/protected-paths.js', () => ({ default: noopExtension }));
vi.mock('../../src/extensions/session-name.js', () => ({ default: noopExtension }));
vi.mock('../../src/extensions/custom-compaction.js', () => ({ default: noopExtension }));
vi.mock('../../src/extensions/git-checkpoint.js', () => ({ default: noopExtension }));
vi.mock('../../src/extensions/scheduler-tool.js', () => ({ default: noopExtension }));
vi.mock('../../src/extensions/token-meter.js', () => ({ default: noopExtension }));
vi.mock('../../src/extensions/web-search.js', () => ({ default: vi.fn() }));
vi.mock('../../src/extensions/skill-manager.js', () => ({ default: vi.fn() }));
vi.mock('../../src/extensions/mcp-manager.js', () => ({ default: vi.fn() }));
vi.mock('../../src/extensions/injection-guard.js', () => ({ default: vi.fn() }));
vi.mock('../../src/extensions/memory-manager.js', () => ({ default: vi.fn() }));
vi.mock('../../src/extensions/observability.js', () => ({
  makeObservabilityExtension: vi.fn(),
}));
vi.mock('../../src/extensions/capabilities.js', () => ({ default: vi.fn() }));
vi.mock('../../src/extensions/knowledge-manager.js', () => ({
  default: vi.fn(),
  makeKnowledgeExtension: vi.fn(),
}));

// Mock DB
vi.mock('../../src/db/index.js', () => ({
  getDb: vi.fn(() => ({})),
  loadVecExtension: vi.fn(),
  runKnowledgeMigration: vi.fn(),
}));

function makeMockPi() {
  return {
    on: vi.fn(),
    registerTool: vi.fn(),
    getConfig: vi.fn(),
    getAllTools: vi.fn().mockReturnValue([]),
  };
}

describe('loader context injection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('budget-manager receives context.workspacePath, not process.cwd()', async () => {
    const { getBundledFactories } = await import('../../src/extensions/loader.js');

    // build factories with a specific context
    const factories = getBundledFactories(
      { id: 'test', workspacePath: '/test/workspace' } as any,
      {} as any
    );

    // Find the budget-manager factory and execute it
    for (const factory of factories) {
      await factory(makeMockPi() as any);
    }

    // Assert budget-manager was called with the correct workspacePath
    expect(budgetExtensionSpy).toHaveBeenCalled();
    const callArgs = budgetExtensionSpy.mock.calls[0];
    const opts = callArgs[1]; // second arg is the options object
    expect(opts.workspacePath).toBe('/test/workspace');
    expect(opts.workspacePath).not.toBe(process.cwd());
  });
});