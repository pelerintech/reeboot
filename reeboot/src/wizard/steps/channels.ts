import { mkdirSync, rmSync, existsSync, readdirSync, renameSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Prompter } from '../prompter.js'
import { checkDockerStatus } from '../../utils/docker.js'
import { linkWhatsAppDevice } from '../../channels/whatsapp.js'
import { linkSignalDevice } from '../../channels/signal.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChannelsStepResult {
  whatsapp: boolean
  signal: boolean
  signalPhone?: string
}

export interface ChannelsStepDeps {
  linkWhatsApp?: typeof linkWhatsAppDevice
  linkSignal?: typeof linkSignalDevice
  checkDocker?: typeof checkDockerStatus
}

// ─── runChannelsStep ──────────────────────────────────────────────────────────

export async function runChannelsStep(opts: {
  prompter: Prompter
  configDir?: string
  _deps?: ChannelsStepDeps
}): Promise<ChannelsStepResult> {
  const { prompter } = opts
  const configDir = opts.configDir ?? join(homedir(), '.reeboot')
  const deps = opts._deps ?? {}

  const _linkWhatsApp = deps.linkWhatsApp ?? linkWhatsAppDevice
  const _linkSignal = deps.linkSignal ?? linkSignalDevice
  const _checkDocker = deps.checkDocker ?? checkDockerStatus

  console.log('\n── Step 3: Channels ─────────────────────────────────────────────\n')
  console.log('  ✓ WebChat is always enabled (built-in web UI)\n')

  const selected = await prompter.checkbox({
    message: 'Select additional channels to set up now (optional):',
    choices: [
      { name: 'WhatsApp (scan QR code)', value: 'whatsapp' },
      { name: 'Signal (requires Docker)', value: 'signal' },
    ],
  })

  const result: ChannelsStepResult = {
    whatsapp: false,
    signal: false,
  }

  if (selected.includes('whatsapp')) {
    result.whatsapp = await runWhatsAppSubflow({ configDir, linkFn: _linkWhatsApp })
  }

  if (selected.includes('signal')) {
    // Skip real Docker container setup when link function is injected (test mode)
    const skipDockerSetup = !!deps.linkSignal
    const signalResult = await runSignalSubflow({
      prompter,
      configDir,
      checkDocker: _checkDocker,
      linkFn: _linkSignal,
      skipDockerSetup,
    })
    result.signal = signalResult.enabled
    if (signalResult.phone) result.signalPhone = signalResult.phone
  }

  return result
}

// ─── WhatsApp sub-flow ────────────────────────────────────────────────────────

async function runWhatsAppSubflow(opts: {
  configDir: string
  linkFn: typeof linkWhatsAppDevice
}): Promise<boolean> {
  const { configDir, linkFn } = opts

  console.log('\n  📱 WhatsApp Setup')
  console.log('  ─────────────────────────────────────────────────────────────')

  // Clean up any orphaned temp auth dirs from previous wizard runs
  cleanOrphanedWizardAuthDirs(configDir)

  const tempAuthDir = join(configDir, `.wiz-wa-auth-${Date.now()}`)
  mkdirSync(tempAuthDir, { recursive: true })

  let success = false

  try {
    const qrTerminal = await import('qrcode-terminal')

    await new Promise<void>((resolve) => {
      linkFn({
        authDir: tempAuthDir,
        onQr: (qr: string) => {
          console.log('\n  Scan this QR code with WhatsApp:')
          console.log('  (Settings → Linked Devices → Link a Device)\n')
          ;(qrTerminal as any).default.generate(qr, { small: true })
          console.log('\n  Waiting up to 2 minutes...\n')
        },
        onSuccess: () => {
          success = true
          // Move temp auth dir to permanent location
          const permDir = join(configDir, 'channels', 'whatsapp', 'auth')
          mkdirSync(join(configDir, 'channels', 'whatsapp'), { recursive: true })
          try {
            if (existsSync(tempAuthDir)) {
              rmSync(permDir, { recursive: true, force: true })
              renameSync(tempAuthDir, permDir)
            }
          } catch { /* ignore move errors */ }
          console.log('  ✓ WhatsApp linked!')
          resolve()
        },
        onTimeout: () => {
          success = false
          console.log('  ✗ WhatsApp QR timed out.')
          console.log('  → Run `reeboot channel login whatsapp` later to link.\n')
          try { rmSync(tempAuthDir, { recursive: true, force: true }) } catch { /* ignore */ }
          resolve()
        },
      })
    })
  } catch {
    success = false
  }

  return success
}

// ─── Signal sub-flow ──────────────────────────────────────────────────────────

async function runSignalSubflow(opts: {
  prompter: Prompter
  configDir: string
  checkDocker: typeof checkDockerStatus
  linkFn: typeof linkSignalDevice
  skipDockerSetup: boolean
}): Promise<{ enabled: boolean; phone?: string }> {
  const { prompter, configDir, checkDocker, linkFn, skipDockerSetup } = opts

  console.log('\n  📡 Signal Setup')
  console.log('  ─────────────────────────────────────────────────────────────')

  const dockerStatus = await checkDocker()

  if (dockerStatus === 'not-installed') {
    console.log('  ✗ Docker is not installed.')
    console.log('  → Install Docker Desktop: https://www.docker.com/products/docker-desktop')
    console.log('  → Run `reeboot channel login signal` after installing Docker.\n')
    return { enabled: false }
  }

  if (dockerStatus === 'not-running') {
    const continueAnyway = await prompter.confirm({
      message: 'Docker is installed but not running. Start Docker Desktop, then continue?',
      default: false,
    })
    if (!continueAnyway) {
      console.log('  → Skipping Signal setup. Run `reeboot channel login signal` later.\n')
      return { enabled: false }
    }
    // Check again after user started Docker
    const newStatus = await checkDocker()
    if (newStatus !== 'running') {
      console.log('  ✗ Docker still not running. Skipping Signal setup.\n')
      return { enabled: false }
    }
  }

  // Docker is running — prompt for phone number
  const phone = await prompter.input({
    message: 'Your Signal phone number (with country code, e.g. +15551234567):',
    validate: (val) => val.trim().startsWith('+') ? true : 'phone number must start with + and country code',
  })

  const SIGNAL_API_PORT = 8080

  if (!skipDockerSetup) {
    console.log(`\n  Starting Signal container for ${phone}...`)

    const signalDir = join(configDir, 'channels', 'signal')
    mkdirSync(signalDir, { recursive: true })

    const { spawnSync } = await import('child_process')

    spawnSync('docker', ['rm', '-f', 'reeboot-signal-setup'], { stdio: 'pipe' })

    const start = spawnSync('docker', [
      'run', '-d',
      '--name', 'reeboot-signal-setup',
      '-p', `${SIGNAL_API_PORT}:8080`,
      '-v', `${signalDir}:/home/.local/share/signal-cli`,
      '-e', 'MODE=native',
      'bbernhard/signal-cli-rest-api:latest',
    ], { stdio: 'pipe' })

    if (start.status !== 0) {
      console.log('  ✗ Failed to start Signal container. Skipping Signal setup.\n')
      return { enabled: false, phone }
    }

    // Wait for container to be ready
    process.stdout.write('  Waiting for Signal container to be ready...')
    let ready = false
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000))
      process.stdout.write('.')
      try {
        const res = await fetch(`http://127.0.0.1:${SIGNAL_API_PORT}/v1/about`)
        if (res.ok) { ready = true; break }
      } catch { /* not ready yet */ }
    }

    if (!ready) {
      console.log(' ✗')
      console.log('  ✗ Signal container did not become ready.\n')
      return { enabled: false, phone }
    }

    console.log(' ✓')
  }

  let success = false

  await new Promise<void>((resolve) => {
    linkFn({
      phoneNumber: phone,
      apiPort: SIGNAL_API_PORT,
      onQr: (url: string) => {
        console.log(`\n  📱 Open this URL to scan the Signal QR code:`)
        console.log(`     ${url}`)
        console.log('\n  Waiting up to 3 minutes for you to scan...\n')
      },
      onSuccess: () => {
        success = true
        console.log('  ✓ Signal linked!')
        resolve()
      },
      onTimeout: () => {
        success = false
        console.log('  ✗ Signal QR timed out.')
        console.log('  → Container is still running. Run `reeboot channel login signal` later.\n')
        resolve()
      },
    })
  })

  return { enabled: success, phone }
}

// ─── cleanOrphanedWizardAuthDirs ──────────────────────────────────────────────

function cleanOrphanedWizardAuthDirs(configDir: string): void {
  try {
    const entries = readdirSync(configDir)
    for (const entry of entries) {
      if (entry.startsWith('.wiz-wa-auth-')) {
        try {
          rmSync(join(configDir, entry), { recursive: true, force: true })
        } catch { /* ignore */ }
      }
    }
  } catch { /* configDir may not exist yet */ }
}
