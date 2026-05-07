/**
 * Web adapter Tier 2 contract tests.
 */

import { runLiteContractTests } from './contract/runLiteContractTests.js';
import type { Tier2Factory } from './contract/runLiteContractTests.js';

const webFactory: Tier2Factory = (_bus) => {
  // Use a fresh instance (not the singleton) so tests are isolated
  const { WebAdapter } = require('@src/channels/web.js');
  const adapter = new WebAdapter();
  return { adapter };
};

// Use dynamic import for ESM compatibility
import { describe, it, beforeEach } from 'vitest';
import { MessageBus } from '@src/channels/interface.js';

describe('WebAdapter — Tier 2 contract', () => {
  let webAdapterMod: any;

  beforeEach(async () => {
    webAdapterMod = await import('@src/channels/web.js');
  });

  runLiteContractTests((_bus) => {
    const { WebAdapter } = webAdapterMod;
    const adapter = new WebAdapter();
    return { adapter };
  });
});
