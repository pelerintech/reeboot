import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock both the old and new inquirer APIs
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn().mockResolvedValue('mock-select'),
  input: vi.fn().mockResolvedValue('mock-input'),
  password: vi.fn().mockResolvedValue('mock-password'),
  checkbox: vi.fn().mockResolvedValue(['mock-checkbox']),
  confirm: vi.fn().mockResolvedValue(true),
  // Separator is a class used by InquirerPrompter to render visual dividers
  Separator: class { constructor(public line?: string) {} },
}))

// Also mock legacy inquirer to prevent TTY hang if old code path runs
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({ answer: 'legacy-answer' }),
  },
}))

describe('InquirerPrompter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('implements the Prompter interface (has all 5 methods)', async () => {
    const { InquirerPrompter } = await import('@src/wizard/prompter.js')
    const p = new InquirerPrompter()
    expect(typeof p.select).toBe('function')
    expect(typeof p.input).toBe('function')
    expect(typeof p.password).toBe('function')
    expect(typeof p.checkbox).toBe('function')
    expect(typeof p.confirm).toBe('function')
  })

  it('select() calls @inquirer/prompts select (v13 API), not legacy inquirer.prompt()', async () => {
    const { select } = await import('@inquirer/prompts')
    const { default: inquirer } = await import('inquirer')
    const { InquirerPrompter } = await import('@src/wizard/prompter.js')
    const p = new InquirerPrompter()
    const result = await p.select({ message: 'Pick one', choices: [{ name: 'A', value: 'a' }] })
    expect(select).toHaveBeenCalled()
    expect((inquirer as any).prompt).not.toHaveBeenCalled()
    expect(result).toBe('mock-select')
  })

  it('input() calls @inquirer/prompts input (v13 API), not legacy inquirer.prompt()', async () => {
    const { input } = await import('@inquirer/prompts')
    const { default: inquirer } = await import('inquirer')
    const { InquirerPrompter } = await import('@src/wizard/prompter.js')
    const p = new InquirerPrompter()
    const result = await p.input({ message: 'Enter text' })
    expect(input).toHaveBeenCalled()
    expect((inquirer as any).prompt).not.toHaveBeenCalled()
    expect(result).toBe('mock-input')
  })

  it('password() calls @inquirer/prompts password (v13 API), not legacy inquirer.prompt()', async () => {
    const { password } = await import('@inquirer/prompts')
    const { default: inquirer } = await import('inquirer')
    const { InquirerPrompter } = await import('@src/wizard/prompter.js')
    const p = new InquirerPrompter()
    const result = await p.password({ message: 'Enter key' })
    expect(password).toHaveBeenCalled()
    expect((inquirer as any).prompt).not.toHaveBeenCalled()
    expect(result).toBe('mock-password')
  })

  it('checkbox() calls @inquirer/prompts checkbox (v13 API), not legacy inquirer.prompt()', async () => {
    const { checkbox } = await import('@inquirer/prompts')
    const { default: inquirer } = await import('inquirer')
    const { InquirerPrompter } = await import('@src/wizard/prompter.js')
    const p = new InquirerPrompter()
    const result = await p.checkbox({ message: 'Pick many', choices: [{ name: 'A', value: 'a' }] })
    expect(checkbox).toHaveBeenCalled()
    expect((inquirer as any).prompt).not.toHaveBeenCalled()
    expect(Array.isArray(result)).toBe(true)
  })

  it('confirm() calls @inquirer/prompts confirm (v13 API), not legacy inquirer.prompt()', async () => {
    const { confirm } = await import('@inquirer/prompts')
    const { default: inquirer } = await import('inquirer')
    const { InquirerPrompter } = await import('@src/wizard/prompter.js')
    const p = new InquirerPrompter()
    const result = await p.confirm({ message: 'Are you sure?' })
    expect(confirm).toHaveBeenCalled()
    expect((inquirer as any).prompt).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })
})
