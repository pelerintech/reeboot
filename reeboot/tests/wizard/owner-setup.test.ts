import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-owner-setup-'))
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

async function makeConfig(overrides: Record<string, any> = {}) {
  const { defaultConfig, saveConfig } = await import('@src/config.js')
  const configPath = join(tmpDir, 'config.json')
  const cfg = {
    ...defaultConfig,
    channels: {
      ...defaultConfig.channels,
      whatsapp: { ...defaultConfig.channels.whatsapp, enabled: true },
    },
    ...overrides,
  }
  saveConfig(cfg, configPath)
  return configPath
}

// ─── Task 13: runOwnerSetupCommand ───────────────────────────────────────────

describe('runOwnerSetupCommand', () => {
  it('self-chat: clears owner_id and preserves other fields', async () => {
    const configPath = await makeConfig()
    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter(['self'])

    const { runOwnerSetupCommand } = await import('@src/wizard/steps/owner-setup.js')
    await runOwnerSetupCommand({ configPath, prompter })

    const { loadConfig } = await import('@src/config.js')
    const cfg = loadConfig(configPath)
    expect(cfg.channels.whatsapp.owner_id ?? '').toBe('')
  })

  it('different number: saves captured peerId as owner_id', async () => {
    const configPath = await makeConfig()
    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter(['other'])

    // Inject a mock WhatsApp adapter that emits a message immediately
    const mockAdapter = {
      onMessage: null as any,
      init: vi.fn(),
      start: vi.fn().mockImplementation(function(this: any) {
        // fire the onMessage handler after "start"
        if (this.onMessage) this.onMessage('43624150659184@lid')
      }),
      stop: vi.fn(),
    }

    const { runOwnerSetupCommand } = await import('@src/wizard/steps/owner-setup.js')
    await runOwnerSetupCommand({
      configPath,
      prompter,
      _deps: { startAdapter: async (onMessage: (peerId: string) => void) => {
        onMessage('43624150659184@lid')
        return async () => {} // stop fn
      }},
    })

    const { loadConfig } = await import('@src/config.js')
    const cfg = loadConfig(configPath)
    expect((cfg.channels.whatsapp as any).owner_id).toBe('43624150659184@lid')
  })

  it('Q-cancel: exits cleanly without modifying config', async () => {
    const configPath = await makeConfig()
    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter(['other'])

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

    const { runOwnerSetupCommand } = await import('@src/wizard/steps/owner-setup.js')
    // Inject startAdapter that never calls onMessage;
    // inject onCancel to register a cancel trigger — immediately cancel
    await expect(
      runOwnerSetupCommand({
        configPath,
        prompter,
        _deps: {
          startAdapter: async (_onMessage, cancelRef) => {
            // trigger Q-cancel immediately
            if (cancelRef) cancelRef.cancel()
            return async () => {}
          },
        },
      })
    ).rejects.toThrow('exit')

    expect(exitSpy).toHaveBeenCalledWith(0)

    // config must NOT have been modified
    const { loadConfig } = await import('@src/config.js')
    const cfg = loadConfig(configPath)
    expect((cfg.channels.whatsapp as any).owner_id ?? '').toBe('')

    exitSpy.mockRestore()
  })

  it('errors if WhatsApp is not enabled', async () => {
    const { defaultConfig, saveConfig } = await import('@src/config.js')
    const configPath = join(tmpDir, 'config-disabled.json')
    saveConfig({
      ...defaultConfig,
      channels: { ...defaultConfig.channels, whatsapp: { ...defaultConfig.channels.whatsapp, enabled: false } },
    }, configPath)

    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter([])

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })

    const { runOwnerSetupCommand } = await import('@src/wizard/steps/owner-setup.js')
    await expect(runOwnerSetupCommand({ configPath, prompter })).rejects.toThrow('exit')

    const errOutput = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(errOutput).toContain('not enabled')

    consoleSpy.mockRestore()
    exitSpy.mockRestore()
  })
})
