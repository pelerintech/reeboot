// ─── Prompter Interface ───────────────────────────────────────────────────────

export interface SelectOptions {
  message: string
  choices: Array<{ name: string; value: string }>
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
 * Production prompter backed by inquirer.
 * Lazy-loads inquirer so tests that inject FakePrompter never import it.
 */
export class InquirerPrompter implements Prompter {
  async select(opts: SelectOptions): Promise<string> {
    const { default: inquirer } = await import('inquirer')
    const { answer } = await inquirer.prompt([{
      type: 'list',
      name: 'answer',
      message: opts.message,
      choices: opts.choices,
      default: opts.default,
    }])
    return answer
  }

  async input(opts: InputOptions): Promise<string> {
    const { default: inquirer } = await import('inquirer')
    const { answer } = await inquirer.prompt([{
      type: 'input',
      name: 'answer',
      message: opts.message,
      default: opts.default,
      validate: opts.validate,
    }])
    return answer
  }

  async password(opts: PasswordOptions): Promise<string> {
    const { default: inquirer } = await import('inquirer')
    const { answer } = await inquirer.prompt([{
      type: 'password',
      name: 'answer',
      message: opts.message,
      mask: '*',
      validate: opts.validate,
    }])
    return answer
  }

  async checkbox(opts: CheckboxOptions): Promise<string[]> {
    const { default: inquirer } = await import('inquirer')
    const { answer } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'answer',
      message: opts.message,
      choices: opts.choices,
    }])
    return answer
  }

  async confirm(opts: ConfirmOptions): Promise<boolean> {
    const { default: inquirer } = await import('inquirer')
    const { answer } = await inquirer.prompt([{
      type: 'confirm',
      name: 'answer',
      message: opts.message,
      default: opts.default,
    }])
    return answer
  }
}
