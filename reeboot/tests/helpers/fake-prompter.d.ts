export interface SelectOptions {
    message: string;
    choices: Array<{
        name: string;
        value: string;
    }>;
    default?: string;
}
export interface InputOptions {
    message: string;
    default?: string;
    validate?: (val: string) => true | string;
}
export interface PasswordOptions {
    message: string;
    validate?: (val: string) => true | string;
}
export interface CheckboxOptions {
    message: string;
    choices: Array<{
        name: string;
        value: string;
        checked?: boolean;
    }>;
}
export interface ConfirmOptions {
    message: string;
    default?: boolean;
}
export interface Prompter {
    select(opts: SelectOptions): Promise<string>;
    input(opts: InputOptions): Promise<string>;
    password(opts: PasswordOptions): Promise<string>;
    checkbox(opts: CheckboxOptions): Promise<string[]>;
    confirm(opts: ConfirmOptions): Promise<boolean>;
}
type Answer = string | boolean | string[];
/**
 * FakePrompter drives wizard steps without a real TTY.
 * Provide a queue of answers; each call pops the next answer.
 * Throws if the queue is empty (catches missing answers in tests).
 */
export declare class FakePrompter implements Prompter {
    private _queue;
    readonly calls: Array<{
        method: string;
        opts: unknown;
        answer: Answer;
    }>;
    constructor(answers: Answer[]);
    private _next;
    select(opts: SelectOptions): Promise<string>;
    input(opts: InputOptions): Promise<string>;
    password(opts: PasswordOptions): Promise<string>;
    checkbox(opts: CheckboxOptions): Promise<string[]>;
    confirm(opts: ConfirmOptions): Promise<boolean>;
    /** Returns true if all queued answers have been consumed */
    isDrained(): boolean;
    /** Remaining queue length */
    remaining(): number;
}
export {};
//# sourceMappingURL=fake-prompter.d.ts.map