import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-agent-name-'))
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ─── Task 15: Agent name template substitution ────────────────────────────────

describe('scaffoldSetup agent name substitution', () => {
  it('AGENTS.md contains the agent name and NOT "Reeboot" or "{{AGENT_NAME}}"', async () => {
    // Call scaffoldSetup with agentName = 'Ree'
    // We test via runSetupWizard with all steps mocked
    vi.doMock('@src/wizard/steps/provider.js', () => ({
      runProviderStep: vi.fn().mockResolvedValue({
        authMode: 'own', provider: 'anthropic', modelId: 'claude-sonnet-4-5', apiKey: 'sk-test', ollamaBaseUrl: '',
      }),
    }))
    vi.doMock('@src/wizard/steps/name.js', () => ({ runNameStep: vi.fn().mockResolvedValue('Ree') }))
    vi.doMock('@src/wizard/steps/channels.js', () => ({
      runChannelsStep: vi.fn().mockResolvedValue({ whatsapp: false, signal: false }),
    }))
    vi.doMock('@src/wizard/steps/web-search.js', () => ({
      runWebSearchStep: vi.fn().mockResolvedValue({ provider: 'duckduckgo', apiKey: '', searxngBaseUrl: '' }),
    }))
    vi.doMock('@src/wizard/steps/launch.js', () => ({
      runLaunchStep: vi.fn().mockResolvedValue(undefined),
    }))

    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter(['native', false]) // deployment + decline start-now
    const configPath = join(tmpDir, 'config.json')

    const { runSetupWizard } = await import('@src/wizard/index.js')
    await runSetupWizard({ prompter, configPath, configDir: tmpDir })

    const agentsMd = join(tmpDir, 'contexts', 'main', 'AGENTS.md')
    expect(existsSync(agentsMd)).toBe(true)
    const content = readFileSync(agentsMd, 'utf-8')
    expect(content).toContain('Ree')
    expect(content).not.toContain('Reeboot')
    expect(content).not.toContain('{{AGENT_NAME}}')
  })

  it('main-agents.md template contains {{AGENT_NAME}} and NOT hardcoded "Reeboot"', async () => {
    // Read the actual template file
    const { join: pathJoin, dirname } = await import('path')
    const { fileURLToPath } = await import('url')
    const { readFileSync: rfs } = await import('fs')
    // Find the template relative to src/wizard/index.ts
    const here = dirname(fileURLToPath(import.meta.url))
    const templatePath = pathJoin(here, '..', '..', 'src', 'templates', 'main-agents.md')
    // Actually templates are at reeboot root level
    const templatePath2 = pathJoin(here, '..', '..', 'templates', 'main-agents.md')
    const template = existsSync(templatePath) ? rfs(templatePath, 'utf-8')
                   : rfs(templatePath2, 'utf-8')
    expect(template).toContain('{{AGENT_NAME}}')
    expect(template).not.toContain('Reeboot')
  })
})

// ─── Task 16: reeboot setup propagates name change ───────────────────────────

describe('scaffoldSetup always overwrites AGENTS.md on re-run', () => {
  it('AGENTS.md updated to new name when re-running wizard with different name', async () => {
    // First run: write AGENTS.md with name "Ree"
    vi.doMock('@src/wizard/steps/provider.js', () => ({
      runProviderStep: vi.fn().mockResolvedValue({
        authMode: 'own', provider: 'anthropic', modelId: 'claude-sonnet-4-5', apiKey: 'sk-test', ollamaBaseUrl: '',
      }),
    }))
    vi.doMock('@src/wizard/steps/name.js', () => ({ runNameStep: vi.fn().mockResolvedValue('Nova') }))
    vi.doMock('@src/wizard/steps/channels.js', () => ({
      runChannelsStep: vi.fn().mockResolvedValue({ whatsapp: false, signal: false }),
    }))
    vi.doMock('@src/wizard/steps/web-search.js', () => ({
      runWebSearchStep: vi.fn().mockResolvedValue({ provider: 'duckduckgo', apiKey: '', searxngBaseUrl: '' }),
    }))
    vi.doMock('@src/wizard/steps/launch.js', () => ({
      runLaunchStep: vi.fn().mockResolvedValue(undefined),
    }))

    // First write an AGENTS.md with old name "Ree"
    const { mkdirSync, writeFileSync } = await import('fs')
    const agentsMd = join(tmpDir, 'contexts', 'main', 'AGENTS.md')
    mkdirSync(join(tmpDir, 'contexts', 'main'), { recursive: true })
    writeFileSync(agentsMd, '# Ree — Personal Assistant\n\nYou are Ree', 'utf-8')

    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter(['native', false])
    const configPath = join(tmpDir, 'config-nova.json')

    const { runSetupWizard } = await import('@src/wizard/index.js')
    await runSetupWizard({ prompter, configPath, configDir: tmpDir })

    const content = readFileSync(agentsMd, 'utf-8')
    expect(content).toContain('Nova')
    expect(content).not.toContain('Ree')
  })
})
