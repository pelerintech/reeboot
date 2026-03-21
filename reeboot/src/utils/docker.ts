import { execSync } from 'child_process'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DockerStatus = 'not-installed' | 'not-running' | 'running'

// ─── checkDockerStatus ────────────────────────────────────────────────────────

/**
 * Checks the current Docker daemon status.
 * Returns:
 *   'not-installed' — docker binary not found
 *   'not-running'   — docker binary found but daemon not responding
 *   'running'       — docker daemon is running and healthy
 */
export async function checkDockerStatus(): Promise<DockerStatus> {
  // First, check if docker binary exists
  try {
    execSync('docker --version', { stdio: ['pipe', 'pipe', 'pipe'] })
  } catch {
    return 'not-installed'
  }

  // Then check if daemon is running
  try {
    execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'] })
    return 'running'
  } catch {
    return 'not-running'
  }
}
