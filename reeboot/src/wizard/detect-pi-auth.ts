/**
 * detectPiAuth
 *
 * Checks whether a pi installation exists on this machine with valid credentials.
 * Reads ~/.pi/agent/auth.json and ~/.pi/agent/settings.json.
 *
 * Returns:
 *   { available: true, provider, model }  — pi is installed and authenticated
 *   { available: false }                  — no pi auth found
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PI_AGENT_DIR = join(homedir(), '.pi', 'agent');

export type PiAuthResult =
  | { available: true; provider: string; model: string }
  | { available: false };

export async function detectPiAuth(): Promise<PiAuthResult> {
  try {
    const authPath = join(PI_AGENT_DIR, 'auth.json');
    const settingsPath = join(PI_AGENT_DIR, 'settings.json');

    if (!existsSync(authPath)) return { available: false };

    const auth = JSON.parse(readFileSync(authPath, 'utf-8'));
    const providers = Object.keys(auth);
    if (providers.length === 0) return { available: false };

    if (!existsSync(settingsPath)) return { available: false };

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const provider: string = settings.defaultProvider ?? providers[0];
    const model: string = settings.defaultModel ?? '';

    return { available: true, provider, model };
  } catch {
    return { available: false };
  }
}
