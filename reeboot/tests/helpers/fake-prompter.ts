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

// ─── FakePrompter ────────────────────────────────────────────────────────────

type Answer = string | boolean | string[]

/**
 * FakePrompter drives wizard steps without a real TTY.
 * Provide a queue of answers; each call pops the next answer.
 * Throws if the queue is empty (catches missing answers in tests).
 */
export class FakePrompter implements Prompter {
  private _queue: Answer[]
  readonly calls: Array<{ method: string; opts: unknown; answer: Answer }> = []

  constructor(answers: Answer[]) {
    this._queue = [...answers]
  }

  private _next(method: string, opts: unknown): Answer {
    if (this._queue.length === 0) {
      throw new Error(`FakePrompter: no answer queued for ${method}(${JSON.stringify(opts)})`)
    }
    const answer = this._queue.shift()!
    this.calls.push({ method, opts, answer })
    return answer
  }

  async select(opts: SelectOptions): Promise<string> {
    const ans = this._next('select', opts)
    if (typeof ans !== 'string') throw new Error(`FakePrompter: expected string for select, got ${typeof ans}`)
    // run validation-style check: answer must be one of the choices
    const valid = opts.choices.some(c => c.value === ans)
    if (!valid) throw new Error(`FakePrompter: value "${ans}" not in select choices`)
    return ans
  }

  async input(opts: InputOptions): Promise<string> {
    const ans = this._next('input', opts)
    if (typeof ans !== 'string') throw new Error(`FakePrompter: expected string for input, got ${typeof ans}`)
    if (opts.validate) {
      const result = opts.validate(ans)
      if (result !== true) throw new Error(`FakePrompter: input validation failed: ${result}`)
    }
    return ans
  }

  async password(opts: PasswordOptions): Promise<string> {
    const ans = this._next('password', opts)
    if (typeof ans !== 'string') throw new Error(`FakePrompter: expected string for password, got ${typeof ans}`)
    if (opts.validate) {
      const result = opts.validate(ans)
      if (result !== true) throw new Error(`FakePrompter: password validation failed: ${result}`)
    }
    return ans
  }

  async checkbox(opts: CheckboxOptions): Promise<string[]> {
    const ans = this._next('checkbox', opts)
    if (!Array.isArray(ans)) throw new Error(`FakePrompter: expected array for checkbox, got ${typeof ans}`)
    return ans
  }

  async confirm(opts: ConfirmOptions): Promise<boolean> {
    const ans = this._next('confirm', opts)
    if (typeof ans !== 'boolean') throw new Error(`FakePrompter: expected boolean for confirm, got ${typeof ans}`)
    return ans
  }

  /** Returns true if all queued answers have been consumed */
  isDrained(): boolean {
    return this._queue.length === 0
  }

  /** Remaining queue length */
  remaining(): number {
    return this._queue.length
  }
}
