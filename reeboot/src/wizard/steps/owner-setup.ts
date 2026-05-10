import { join } from 'path'
import { homedir } from 'os'
import type { Prompter } from '../prompter.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A cancellation handle passed to startAdapter so tests can trigger Q-cancel. */
export interface CancelRef {
  cancel: () => void
}

export interface OwnerSetupDeps {
  /**
   * Starts a minimal WhatsApp receive-only listener.
   * Calls onMessage(peerId) when the first message arrives.
   * The optional cancelRef lets the caller trigger Q-cancel.
   * Returns a stop function.
   */
  startAdapter?: (onMessage: (peerId: string) => void, cancelRef?: CancelRef) => Promise<() => Promise<void>>
}

export interface OwnerSetupOpts {
  configPath?: string
  prompter: Prompter
  _deps?: OwnerSetupDeps
}

// ─── runOwnerSetupCommand ─────────────────────────────────────────────────────

/**
 * Captures and saves the owner's WhatsApp identity.
 * - Self-chat mode: clears owner_id (single-number setup)
 * - Different number: waits for first incoming message, captures exact peerId
 */
export async function runOwnerSetupCommand(opts: OwnerSetupOpts): Promise<void> {
  const { prompter } = opts
  const deps = opts._deps ?? {}
  const configPath = opts.configPath
    ?? process.env.REEBOOT_CONFIG_PATH
    ?? join(homedir(), '.reeboot', 'config.json')

  const { loadConfig, saveConfig } = await import('../../config.js')
  const cfg = loadConfig(configPath)

  if (!cfg.channels.whatsapp.enabled) {
    console.error('✗ WhatsApp is not enabled. Run `reeboot channels login whatsapp` first.')
    process.exit(1)
  }

  console.log('\n📱 Owner WhatsApp Setup\n')

  const choice = await prompter.select({
    message: 'How will you message this agent?',
    choices: [
      { name: 'From this same WhatsApp number (self-chat)', value: 'self' },
      { name: 'From a different number — I\'ll send a test message now', value: 'other' },
    ],
    default: 'self',
  })

  if (choice === 'self') {
    // Clear owner_id — self-chat mode, owner_only stays true
    cfg.channels.whatsapp.owner_id = ''
    saveConfig(cfg, configPath)
    console.log('  ✓ Self-chat mode configured. No owner_id needed.\n')
    return
  }

  // Different number: wait for first incoming message
  console.log('  Waiting for a message from your phone... (press Q to cancel)\n')

  let captured: string | null = null
  let stopFn: (() => Promise<void>) | null = null

  // cancelRef: lets both Q-keypress and injected deps trigger cancel
  let _cancelResolve: (() => void) | null = null
  const cancelRef: CancelRef = {
    cancel: () => {
      console.log('\n  Cancelled.')
      if (_cancelResolve) _cancelResolve()
    },
  }

  // Q keypress cancel
  const onKeypress = (chunk: Buffer) => {
    if (chunk.toString().toLowerCase() === 'q') {
      cancelRef.cancel()
    }
  }
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onKeypress)
  }

  let cancelled = false

  try {
    await new Promise<void>(async (resolve) => {
      _cancelResolve = () => {
        cancelled = true
        resolve()
      }

      const onMessage = (peerId: string) => {
        captured = peerId
        resolve()
      }

      if (deps.startAdapter) {
        stopFn = await deps.startAdapter(onMessage, cancelRef)
      } else {
        // Production: start WhatsApp adapter in receive-only mode
        const { linkWhatsAppDevice } = await import('../../channels/whatsapp.js')
        const authDir = join(homedir(), '.reeboot', 'channels', 'whatsapp', 'auth')
        linkWhatsAppDevice({
          authDir,
          onQr: () => {},
          onSuccess: () => {},
          onTimeout: () => {},
          onMessage,
        })
      }
    })
  } finally {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('data', onKeypress)
    }
    if (stopFn) await stopFn()
  }

  if (cancelled) {
    process.exit(0)
  }

  if (captured) {
    cfg.channels.whatsapp.owner_id = captured
    saveConfig(cfg, configPath)
    console.log(`  ✓ Owner identity captured: ${captured}`)
    console.log('  ✓ Saved to config.\n')
  }
}
