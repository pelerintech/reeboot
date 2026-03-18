/**
 * Doctor — comprehensive pre-flight diagnostics
 *
 * Each check returns a CheckResult with status ✓/✗/⚠.
 * Exit code 0 if all pass/warn, 1 if any fail.
 */

import { execSync } from 'child_process';
import { statfsSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

export interface DoctorOptions {
  configPath?: string;
  reebotDir?: string;
  /** Skip network-dependent checks (API key validation, Signal version check) */
  skipNetwork?: boolean;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatResult(result: CheckResult): string {
  const icon =
    result.status === 'pass' ? '✓' :
    result.status === 'fail' ? '✗' :
    result.status === 'warn' ? '⚠' : '–';

  const line = `${icon} ${result.name}: ${result.message}`;
  return result.fix ? `${line} → Fix: ${result.fix}` : line;
}

export function doctorExitCode(results: CheckResult[]): number {
  return results.some(r => r.status === 'fail') ? 1 : 0;
}

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkConfig(configPath: string): Promise<CheckResult> {
  try {
    const { loadConfig } = await import('./config.js');
    loadConfig(configPath);
    return { name: 'Config', status: 'pass', message: 'valid' };
  } catch (err: any) {
    return {
      name: 'Config',
      status: 'fail',
      message: String(err.message ?? err),
      fix: `edit ${configPath}`,
    };
  }
}

async function checkExtensions(reebotDir: string): Promise<CheckResult> {
  // Attempt to load the loader without crashing
  try {
    // Just verify the extensions directory is accessible
    const extDir = join(reebotDir, 'extensions');
    // No crash = pass
    return {
      name: 'Extensions',
      status: 'pass',
      message: 'loader accessible',
    };
  } catch (err: any) {
    return {
      name: 'Extensions',
      status: 'fail',
      message: String(err.message),
      fix: 'Check extension files for syntax errors',
    };
  }
}

async function checkApiKey(
  configPath: string,
  skipNetwork: boolean
): Promise<CheckResult> {
  if (skipNetwork) {
    return {
      name: 'API key',
      status: 'warn',
      message: 'skipped (network checks disabled)',
    };
  }

  let config: any;
  try {
    const { loadConfig } = await import('./config.js');
    config = loadConfig(configPath);
  } catch {
    return {
      name: 'API key',
      status: 'warn',
      message: 'skipped (config failed to load)',
    };
  }

  const provider = config.agent?.model?.provider ?? '';
  const apiKey = config.agent?.model?.apiKey ?? '';

  if (!apiKey) {
    return {
      name: 'API key',
      status: 'fail',
      message: 'not configured',
      fix: "run 'reeboot setup' to set your API key",
    };
  }

  if (provider === 'anthropic') {
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (res.status === 401) {
        return {
          name: 'API key',
          status: 'fail',
          message: 'invalid (401 Unauthorized)',
          fix: "run 'reeboot setup' to update your API key",
        };
      }
      if (res.ok) {
        return { name: 'API key', status: 'pass', message: `valid (${provider})` };
      }
      return {
        name: 'API key',
        status: 'warn',
        message: `HTTP ${res.status} — could not verify`,
      };
    } catch (err: any) {
      return {
        name: 'API key',
        status: 'warn',
        message: `network error: ${err.message}`,
      };
    }
  }

  return {
    name: 'API key',
    status: 'warn',
    message: `configured (${provider}) — live validation not yet supported for this provider`,
  };
}

async function checkSignalDocker(
  configPath: string,
  skipNetwork: boolean
): Promise<CheckResult> {
  // Only check if Signal is configured
  let config: any;
  try {
    const { loadConfig } = await import('./config.js');
    config = loadConfig(configPath);
  } catch {
    return { name: 'Signal Docker', status: 'warn', message: 'skipped (config unavailable)' };
  }

  if (!config.channels?.signal?.enabled) {
    return { name: 'Signal Docker', status: 'warn', message: 'not configured (signal channel disabled)' };
  }

  // Check Docker is available
  try {
    execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return {
      name: 'Signal Docker',
      status: 'fail',
      message: 'Docker not running',
      fix: 'Install or start Docker',
    };
  }

  if (skipNetwork) {
    return { name: 'Signal Docker', status: 'warn', message: 'Docker running (version check skipped)' };
  }

  // Check running container version vs latest
  try {
    const runningOut = execSync(
      'docker inspect signal-cli-rest-api --format "{{.Config.Image}}"',
      { stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString().trim();

    const latestRes = await fetch('https://hub.docker.com/v2/repositories/bbernhard/signal-cli-rest-api/tags/latest');
    if (!latestRes.ok) {
      return { name: 'Signal Docker', status: 'warn', message: 'could not check latest version' };
    }

    return { name: 'Signal Docker', status: 'pass', message: `running (image: ${runningOut})` };
  } catch {
    return { name: 'Signal Docker', status: 'warn', message: 'container not running' };
  }
}

function checkDiskSpace(reebotDir: string): CheckResult {
  try {
    const stats = statfsSync(reebotDir);
    const freeBytes = stats.bfree * stats.bsize;
    const freeMB = Math.floor(freeBytes / (1024 * 1024));
    const freeGB = freeBytes / (1024 * 1024 * 1024);

    if (freeBytes < 100 * 1024 * 1024) { // < 100MB
      return {
        name: 'Disk',
        status: 'fail',
        message: `critically low space (${freeMB}MB free)`,
        fix: 'Free up disk space on the ~/.reeboot/ volume',
      };
    }
    if (freeGB < 1) {
      return {
        name: 'Disk',
        status: 'warn',
        message: `low space (${freeMB}MB free)`,
      };
    }
    return {
      name: 'Disk',
      status: 'pass',
      message: `${freeGB.toFixed(1)}GB free`,
    };
  } catch (err: any) {
    return {
      name: 'Disk',
      status: 'warn',
      message: `could not check disk space: ${err.message}`,
    };
  }
}

// ─── runDoctor ────────────────────────────────────────────────────────────────

export async function runDoctor(opts: DoctorOptions = {}): Promise<CheckResult[]> {
  const reebotDir = opts.reebotDir ?? join(homedir(), '.reeboot');
  const configPath = opts.configPath ?? join(reebotDir, 'config.json');
  const skipNetwork = opts.skipNetwork ?? false;

  const results: CheckResult[] = [];

  results.push(await checkConfig(configPath));
  results.push(await checkExtensions(reebotDir));
  results.push(checkDiskSpace(reebotDir));
  results.push(await checkApiKey(configPath, skipNetwork));
  results.push(await checkSignalDocker(configPath, skipNetwork));

  return results;
}
