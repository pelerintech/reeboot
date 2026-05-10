import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-cli-init-test-'))
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ─── Task 3: reeboot init command ──────────────────────────────────────────────

describe('runInitCommand', () => {
  it('calls runSetupWizard when init command is invoked', async () => {
    const configPath = join(tmpDir, 'config.json')
    const mockRunWizard = vi.fn().mockResolvedValue(undefined)

    const { runInitCommand } = await import('@src/index.js')
    await runInitCommand({ configPath, _deps: { runWizard: mockRunWizard } })

    expect(mockRunWizard).toHaveBeenCalledWith({ configPath })
  })
})

// ─── f1-init-command gap: reeboot start errors when no config exists ──────────

describe('runStartCommand — no config', () => {
  it('errors and does NOT launch wizard when config is missing', async () => {
    const nonExistentConfig = join(tmpDir, 'config.json')
    const mockStartAgent = vi.fn()

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called') })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { runStartCommand } = await import('@src/index.js')

    await expect(
      runStartCommand({ configPath: nonExistentConfig, _deps: { startAgent: mockStartAgent } })
    ).rejects.toThrow('process.exit called')

    expect(mockStartAgent).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)

    const errorOutput = consoleSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n')
    expect(errorOutput).toContain('reeboot init')

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})

// ─── Task 2: reeboot start errors when no config exists ──────────────────────

describe('handleDefaultAction — no config', () => {
  it('does NOT call startAgent and exits with error when config is missing', async () => {
    const nonExistentConfig = join(tmpDir, 'config.json')
    const mockStartAgent = vi.fn()
    const mockRunWizard = vi.fn()

    // Capture process.exit calls
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called') })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { handleDefaultAction } = await import('@src/index.js')

    await expect(
      handleDefaultAction({
        configPath: nonExistentConfig,
        _deps: { startAgent: mockStartAgent, runWizard: mockRunWizard },
      })
    ).rejects.toThrow('process.exit called')

    expect(mockStartAgent).not.toHaveBeenCalled()
    expect(mockRunWizard).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)

    // Should print the "reeboot init" message
    const errorOutput = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n')
    expect(errorOutput).toContain('reeboot init')

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})
