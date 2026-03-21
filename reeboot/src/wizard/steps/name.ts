import type { Prompter } from '../prompter.js'

// ─── runNameStep ──────────────────────────────────────────────────────────────

/**
 * Step 2: prompt for the agent's display name.
 * Returns the chosen name (defaults to "Reeboot").
 */
export async function runNameStep(opts: { prompter: Prompter }): Promise<string> {
  const { prompter } = opts

  console.log('\n── Step 2: Agent Name ───────────────────────────────────────────\n')

  const name = await prompter.input({
    message: 'Agent name:',
    default: 'Reeboot',
    validate: (val) => val.trim().length > 0 ? true : 'agent name cannot be empty',
  })

  return name.trim() || 'Reeboot'
}
