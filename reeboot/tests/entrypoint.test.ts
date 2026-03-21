import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { FakePrompter } from './helpers/fake-prompter.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-ep-test-'))
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ─── Helper: make a minimal valid config ─────────────────────────────────────

function writeConfig(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({
      agent: { name: 'Reeboot', model: { provider: 'anthropic', id: 'claude-sonnet-4-5', apiKey: 'sk-test' } },
    }),
    'utf-8'
  )
}

// ─── no-args → wizard when no config ─────────────────────────────────────────

describe('first-run-entrypoint: no config', () => {
  it('runs wizard when config does not exist', async () => {
    const configPath = join(tmpDir, 'config.json')
    const wizardCalls: string[] = []

    const { handleDefaultAction } = await import('@src/index.js')
    await handleDefaultAction({
      configPath,
      _deps: {
        runWizard: async () => { wizardCalls.push('called') },
      },
    })
    expect(wizardCalls).toHaveLength(1)
  })
})

// ─── no-args → start when config present ─────────────────────────────────────

describe('first-run-entrypoint: config present', () => {
  it('starts agent when config exists', async () => {
    writeConfig(tmpDir)
    const configPath = join(tmpDir, 'config.json')
    const startCalls: string[] = []

    const { handleDefaultAction } = await import('@src/index.js')
    await handleDefaultAction({
      configPath,
      _deps: {
        startAgent: async (_path: string) => { startCalls.push('called') },
      },
    })
    expect(startCalls).toHaveLength(1)
  })
})

// ─── REEBOOT_CONFIG_PATH override ────────────────────────────────────────────

describe('first-run-entrypoint: REEBOOT_CONFIG_PATH override', () => {
  it('uses REEBOOT_CONFIG_PATH env var to determine config path', async () => {
    const customDir = join(tmpDir, 'custom')
    writeConfig(customDir)
    const customConfigPath = join(customDir, 'config.json')

    process.env.REEBOOT_CONFIG_PATH = customConfigPath
    const startCalls: string[] = []

    try {
      const { handleDefaultAction } = await import('@src/index.js')
      await handleDefaultAction({
        _deps: {
          startAgent: async (_path: string) => { startCalls.push('called') },
        },
      })
      expect(startCalls).toHaveLength(1)
    } finally {
      delete process.env.REEBOOT_CONFIG_PATH
    }
  })
})

// ─── reeboot setup overwrite prompt ──────────────────────────────────────────

describe('reeboot setup: overwrite prompt', () => {
  it('skips overwrite prompt when no config exists', async () => {
    const configPath = join(tmpDir, 'config.json')
    const wizardCalls: string[] = []
    const prompter = new FakePrompter([])

    const { runSetupCommand } = await import('@src/index.js')
    await runSetupCommand({
      configPath,
      prompter,
      _deps: {
        runWizard: async () => { wizardCalls.push('called') },
      },
    })
    expect(wizardCalls).toHaveLength(1)
    expect(prompter.isDrained()).toBe(true) // no confirm prompt needed
  })

  it('prompts overwrite confirmation when config exists — user confirms', async () => {
    writeConfig(tmpDir)
    const configPath = join(tmpDir, 'config.json')
    const wizardCalls: string[] = []

    const prompter = new FakePrompter([true]) // user says yes
    const { runSetupCommand } = await import('@src/index.js')
    await runSetupCommand({
      configPath,
      prompter,
      _deps: {
        runWizard: async () => { wizardCalls.push('called') },
      },
    })
    expect(wizardCalls).toHaveLength(1)
    expect(prompter.isDrained()).toBe(true)
  })

  it('aborts when user declines overwrite', async () => {
    writeConfig(tmpDir)
    const configPath = join(tmpDir, 'config.json')
    const wizardCalls: string[] = []

    const prompter = new FakePrompter([false]) // user says no
    const { runSetupCommand } = await import('@src/index.js')
    await runSetupCommand({
      configPath,
      prompter,
      _deps: {
        runWizard: async () => { wizardCalls.push('called') },
      },
    })
    expect(wizardCalls).toHaveLength(0) // wizard should NOT run
    expect(prompter.isDrained()).toBe(true)
  })
})
