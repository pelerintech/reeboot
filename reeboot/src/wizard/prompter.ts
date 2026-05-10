// ─── Prompter Interface ───────────────────────────────────────────────────────

/** A visual divider entry in a select list — rendered as a horizontal rule in the terminal. */
export interface SeparatorEntry {
  type: 'separator'
  name?: string
}

export interface SelectOptions {
  message: string
  choices: Array<{ name: string; value: string } | SeparatorEntry>
  default?: string
}

export interface InputOptions {
  message: string
  default?: string
  validate?: (val: string) => true | string
}

export interface PasswordOptions {
  message: string
  validate?: (val: string) => true | string
}

export interface CheckboxOptions {
  message: string
  choices: Array<{ name: string; value: string; checked?: boolean }>
}

export interface ConfirmOptions {
  message: string
  default?: boolean
}

export interface Prompter {
  select(opts: SelectOptions): Promise<string>
  input(opts: InputOptions): Promise<string>
  password(opts: PasswordOptions): Promise<string>
  checkbox(opts: CheckboxOptions): Promise<string[]>
  confirm(opts: ConfirmOptions): Promise<boolean>
}

// ─── InquirerPrompter ─────────────────────────────────────────────────────────

/**
 * Production prompter backed by inquirer v13 (@inquirer/prompts individual functions).
 * Uses the v13 API to correctly render interactive menus on all terminals including
 * Linux SSH sessions. Lazy-loads so tests that inject FakePrompter never import it.
 */
export class InquirerPrompter implements Prompter {
  async select(opts: SelectOptions): Promise<string> {
    const { select, Separator } = await import('@inquirer/prompts')
    // Map SeparatorEntry items to @inquirer/prompts Separator instances
    const choices = opts.choices.map((c) =>
      'type' in c && c.type === 'separator'
        ? new Separator(c.name)
        : c as { name: string; value: string }
    )
    return select({
      message: opts.message,
      choices,
      default: opts.default,
    })
  }

  async input(opts: InputOptions): Promise<string> {
    const { input } = await import('@inquirer/prompts')
    return input({
      message: opts.message,
      default: opts.default,
      validate: opts.validate,
    })
  }

  async password(opts: PasswordOptions): Promise<string> {
    const { password } = await import('@inquirer/prompts')
    return password({
      message: opts.message,
      mask: '*',
      validate: opts.validate,
    })
  }

  async checkbox(opts: CheckboxOptions): Promise<string[]> {
    const { checkbox } = await import('@inquirer/prompts')
    const result = await checkbox({
      message: opts.message,
      choices: opts.choices,
    })
    return result as string[]
  }

  async confirm(opts: ConfirmOptions): Promise<boolean> {
    const { confirm } = await import('@inquirer/prompts')
    return confirm({
      message: opts.message,
      default: opts.default,
    })
  }
}
