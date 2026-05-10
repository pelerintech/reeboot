import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'fs'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-wa-enable-'))
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ─── Task 12: WhatsApp enabled: true written after QR scan ───────────────────

describe('runWhatsAppSubflow — writes enabled: true on success', () => {
  it('sets whatsapp.enabled = true after onSuccess, preserving other fields', async () => {
    // Write a config with whatsapp.enabled: false and a sentinel custom field
    const configPath = join(tmpDir, 'config.json')
    const { defaultConfig, saveConfig } = await import('@src/config.js')
    const initialConfig = {
      ...defaultConfig,
      channels: {
        ...defaultConfig.channels,
        whatsapp: { ...defaultConfig.channels.whatsapp, enabled: false },
      },
      agent: { ...defaultConfig.agent, name: 'SentinelBot' }, // sentinel field
    }
    saveConfig(initialConfig, configPath)

    // Inject a linkFn that immediately calls onSuccess
    const linkFn = vi.fn(({ onSuccess }: any) => {
      onSuccess()
    })

    const { runChannelsStep } = await import('@src/wizard/steps/channels.js')
    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter([['whatsapp']]) // checkbox: select WhatsApp

    await runChannelsStep({
      prompter,
      configDir: tmpDir,
      _deps: { linkWhatsApp: linkFn as any },
    })

    // Config should now have whatsapp.enabled = true
    const { loadConfig } = await import('@src/config.js')
    const cfg = loadConfig(configPath)
    expect(cfg.channels.whatsapp.enabled).toBe(true)
    // Sentinel field must be preserved (load→merge→save pattern)
    expect(cfg.agent.name).toBe('SentinelBot')
  })

  it('does NOT write enabled: true if onTimeout fires', async () => {
    const configPath = join(tmpDir, 'config.json')
    const { defaultConfig, saveConfig } = await import('@src/config.js')
    saveConfig({
      ...defaultConfig,
      channels: { ...defaultConfig.channels, whatsapp: { ...defaultConfig.channels.whatsapp, enabled: false } },
    }, configPath)

    const linkFn = vi.fn(({ onTimeout }: any) => { onTimeout() })

    const { runChannelsStep } = await import('@src/wizard/steps/channels.js')
    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter([['whatsapp']])

    await runChannelsStep({ prompter, configDir: tmpDir, _deps: { linkWhatsApp: linkFn as any } })

    const { loadConfig } = await import('@src/config.js')
    const cfg = loadConfig(configPath)
    expect(cfg.channels.whatsapp.enabled).toBe(false)
  })
})

// ─── Task 14: Owner setup called after QR scan in wizard ─────────────────────

describe('runChannelsStep — owner setup runs after WhatsApp onSuccess', () => {
  it('calls _deps.runOwnerSetup after WhatsApp QR scan succeeds', async () => {
    const configPath = await (async () => {
      const { defaultConfig, saveConfig } = await import('@src/config.js')
      const p = join(tmpDir, 'config-t14.json')
      saveConfig({
        ...defaultConfig,
        channels: { ...defaultConfig.channels, whatsapp: { ...defaultConfig.channels.whatsapp, enabled: false } },
      }, p)
      return p
    })()

    const runOwnerSetup = vi.fn().mockResolvedValue(undefined)
    const linkFn = vi.fn(({ onSuccess }: any) => { onSuccess() })

    const { runChannelsStep } = await import('@src/wizard/steps/channels.js')
    const { FakePrompter } = await import('../helpers/fake-prompter.js')
    const prompter = new FakePrompter([['whatsapp']])

    await runChannelsStep({
      prompter,
      configDir: tmpDir,
      _deps: {
        linkWhatsApp: linkFn as any,
        runOwnerSetup,
      },
    })

    expect(runOwnerSetup).toHaveBeenCalled()
  })
})

// ─── b1-whatsapp-enabled gap: standalone channels login whatsapp ────────────────

describe('runWhatsAppLoginCommand — writes enabled: true on success', () => {
  it('sets channels.whatsapp.enabled = true after successful connection', async () => {
    const configPath = join(tmpDir, 'config.json')
    const { defaultConfig, saveConfig } = await import('@src/config.js')
    saveConfig(
      {
        ...defaultConfig,
        channels: { ...defaultConfig.channels, whatsapp: { ...defaultConfig.channels.whatsapp, enabled: false } },
        agent: { ...defaultConfig.agent, name: 'SentinelBot' },
      },
      configPath
    )

    const { runWhatsAppLoginCommand } = await import('@src/index.js')
    await runWhatsAppLoginCommand({
      configPath,
      _deps: {
        connectAdapter: vi.fn().mockResolvedValue(undefined), // simulates successful connection
      },
    })

    const { loadConfig } = await import('@src/config.js')
    const cfg = loadConfig(configPath)
    expect(cfg.channels.whatsapp.enabled).toBe(true)
    // load→merge→save: sentinel field must be preserved
    expect(cfg.agent.name).toBe('SentinelBot')
  })
})
