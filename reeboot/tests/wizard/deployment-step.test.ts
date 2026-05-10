import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { FakePrompter } from '../helpers/fake-prompter.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-deploy-test-'))
  vi.resetModules()
  vi.doMock('@src/wizard/detect-pi-auth.js', () => ({
    detectPiAuth: vi.fn().mockResolvedValue({ available: false }),
  }))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('deployment choice step', () => {
  it('native selection proceeds to provider step', async () => {
    // Mock all steps except deployment so we can verify it ran provider step
    const mockProvider = vi.fn().mockResolvedValue({
      authMode: 'own', provider: 'anthropic', modelId: 'claude-sonnet-4-5', apiKey: 'sk-test', ollamaBaseUrl: '',
    })
    vi.doMock('@src/wizard/steps/provider.js', () => ({ runProviderStep: mockProvider }))
    vi.doMock('@src/wizard/steps/name.js', () => ({ runNameStep: vi.fn().mockResolvedValue('Reeboot') }))
    vi.doMock('@src/wizard/steps/channels.js', () => ({
      runChannelsStep: vi.fn().mockResolvedValue({ whatsapp: false, signal: false }),
    }))
    vi.doMock('@src/wizard/steps/web-search.js', () => ({
      runWebSearchStep: vi.fn().mockResolvedValue({ provider: 'duckduckgo', apiKey: '', searxngBaseUrl: '' }),
    }))
    vi.doMock('@src/wizard/steps/launch.js', () => ({
      runLaunchStep: vi.fn().mockResolvedValue(undefined),
    }))

    // FakePrompter: deployment choice = 'native', then start-now = false
    const prompter = new FakePrompter(['native', false])
    const { runSetupWizard } = await import('@src/wizard/index.js')
    const configPath = join(tmpDir, 'config.json')
    await runSetupWizard({ prompter, configPath })

    // Provider step should have been called (wizard proceeded past deployment)
    expect(mockProvider).toHaveBeenCalled()
  })

  it('docker selection shows "coming soon" and falls through to native', async () => {
    const mockProvider = vi.fn().mockResolvedValue({
      authMode: 'own', provider: 'anthropic', modelId: 'claude-sonnet-4-5', apiKey: 'sk-test', ollamaBaseUrl: '',
    })
    vi.doMock('@src/wizard/steps/provider.js', () => ({ runProviderStep: mockProvider }))
    vi.doMock('@src/wizard/steps/name.js', () => ({ runNameStep: vi.fn().mockResolvedValue('Reeboot') }))
    vi.doMock('@src/wizard/steps/channels.js', () => ({
      runChannelsStep: vi.fn().mockResolvedValue({ whatsapp: false, signal: false }),
    }))
    vi.doMock('@src/wizard/steps/web-search.js', () => ({
      runWebSearchStep: vi.fn().mockResolvedValue({ provider: 'duckduckgo', apiKey: '', searxngBaseUrl: '' }),
    }))
    vi.doMock('@src/wizard/steps/launch.js', () => ({
      runLaunchStep: vi.fn().mockResolvedValue(undefined),
    }))

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // FakePrompter: deployment = 'docker', then start-now = false
    const prompter = new FakePrompter(['docker', false])
    const { runSetupWizard } = await import('@src/wizard/index.js')
    const configPath = join(tmpDir, 'config.json')
    await runSetupWizard({ prompter, configPath })

    // Should log "coming soon" message
    const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(allLogs).toMatch(/coming soon/i)

    // Provider step should still be called (wizard continues as native)
    expect(mockProvider).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
