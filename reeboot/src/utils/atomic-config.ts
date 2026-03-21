import { writeFileSync, renameSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { saveConfig, type Config } from '../config.js'

// ─── saveConfigAtomic ─────────────────────────────────────────────────────────

/**
 * Saves config atomically using the temp-file + rename pattern.
 * Delegates to the existing saveConfig() which already implements atomic writes.
 */
export function saveConfigAtomic(config: Config, configPath: string): void {
  saveConfig(config, configPath)
}
