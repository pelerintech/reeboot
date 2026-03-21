/**
 * Docker image integration tests.
 *
 * These tests build and run the Docker image.
 * They require Docker to be running and are slower than unit tests.
 *
 * Run with: REEBOOT_DOCKER_TEST=1 npx vitest run tests/docker.test.ts
 *
 * Skip gracefully when REEBOOT_DOCKER_TEST is not set (CI behaviour).
 */

import { execSync, spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const IMAGE_TAG = 'reeboot-test:latest';
const CONTAINER_NAME = `reeboot-docker-test-${Date.now()}`;
const RUN_DOCKER_TESTS = process.env.REEBOOT_DOCKER_TEST === '1';

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!RUN_DOCKER_TESTS)('Docker image', () => {
  beforeAll(() => {
    // Build the image
    const result = spawnSync(
      'docker',
      ['build', '-f', 'container/Dockerfile', '-t', IMAGE_TAG, '.'],
      { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' }
    );
    if (result.status !== 0) {
      throw new Error(`Docker build failed:\n${result.stderr}`);
    }
  }, 120_000);

  afterAll(() => {
    // Clean up container and image
    spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'pipe' });
    spawnSync('docker', ['rmi', '-f', IMAGE_TAG], { stdio: 'pipe' });
  });

  it('health endpoint returns 200 within 10 seconds', async () => {
    // Start container in background (no real config needed — health endpoint always responds)
    spawnSync(
      'docker',
      [
        'run', '-d',
        '--name', CONTAINER_NAME,
        '-p', '13001:3000',
        '-e', 'REEBOOT_SKIP_CONFIG=1',
        IMAGE_TAG,
      ],
      { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' }
    );

    // Poll health endpoint for up to 10 seconds
    const deadline = Date.now() + 10_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const res = await fetch('http://localhost:13001/api/health');
        if (res.status === 200) {
          return; // pass
        }
      } catch (e) {
        lastError = e;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Health endpoint did not return 200 within 10s. Last error: ${lastError}`);
  }, 20_000);

  it('container runs as non-root user (uid 1000)', () => {
    const result = spawnSync(
      'docker',
      ['exec', CONTAINER_NAME, 'id', '-u'],
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    const uid = result.stdout.trim();
    expect(uid).toBe('1000');
  });
});

// Always-running sanity check: Dockerfile and entrypoint exist
describe('Docker artifacts', () => {
  it('container/Dockerfile exists', () => {
    const { existsSync } = require('fs');
    expect(existsSync(resolve(projectRoot, 'container', 'Dockerfile'))).toBe(true);
  });

  it('container/entrypoint.sh exists', () => {
    const { existsSync } = require('fs');
    expect(existsSync(resolve(projectRoot, 'container', 'entrypoint.sh'))).toBe(true);
  });
});
