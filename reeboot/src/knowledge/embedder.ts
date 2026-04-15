import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { join } from 'path';
import { homedir } from 'os';

// ─── Singleton state ──────────────────────────────────────────────────────────

let _extractor: FeatureExtractionPipeline | null = null;
let _cacheDirConfigured = false;

// ─── configureCacheDir ───────────────────────────────────────────────────────

/**
 * Redirects the HuggingFace model cache into ~/.reeboot/hf-cache/ (or a
 * path supplied via the HF_CACHE_DIR env var).
 *
 * Called once before the first pipeline() load. Keeps the model inside the
 * volume-mounted ~/.reeboot directory in Docker deployments so it persists
 * across container restarts instead of being re-downloaded every time.
 *
 * The HuggingFace Transformers.js library does not read HF_HOME or
 * TRANSFORMERS_CACHE from the environment — env.cacheDir must be set
 * programmatically before the first model load.
 */
async function configureCacheDir(): Promise<void> {
  if (_cacheDirConfigured) return;
  _cacheDirConfigured = true;

  const { env } = await import('@huggingface/transformers');
  const cacheDir =
    process.env.HF_CACHE_DIR ??
    join(homedir(), '.reeboot', 'hf-cache');

  env.cacheDir = cacheDir;
}

// ─── Task prefix types ────────────────────────────────────────────────────────

export type TaskPrefix = 'search_document' | 'search_query';

// ─── resetEmbedder ────────────────────────────────────────────────────────────

/**
 * Resets the singleton embedder. Used for test isolation.
 */
export function resetEmbedder(): void {
  _extractor = null;
  _cacheDirConfigured = false;
}

// ─── getExtractor ─────────────────────────────────────────────────────────────

async function getExtractor(modelName: string): Promise<FeatureExtractionPipeline> {
  if (_extractor) return _extractor;

  // Redirect cache into ~/.reeboot/hf-cache/ before first load
  await configureCacheDir();

  const { pipeline } = await import('@huggingface/transformers');
  _extractor = await pipeline('feature-extraction', modelName, {
    revision: 'main',
  }) as FeatureExtractionPipeline;

  return _extractor;
}

// ─── embed ────────────────────────────────────────────────────────────────────

/**
 * Embeds an array of texts using the specified task prefix.
 * Prepends the task instruction prefix before each text for improved retrieval quality.
 * Returns an array of Float32Array embeddings (one per input text).
 *
 * @param texts - The texts to embed
 * @param taskPrefix - 'search_document' for corpus chunks, 'search_query' for user queries
 * @param modelName - Optional model override (defaults to nomic-embed-text-v1.5)
 * @param dimensions - Optional Matryoshka dimension truncation (default 768)
 */
export async function embed(
  texts: string[],
  taskPrefix: TaskPrefix,
  modelName = 'nomic-ai/nomic-embed-text-v1.5',
  dimensions = 768
): Promise<Float32Array[]> {
  const prefixed = texts.map((t) => `${taskPrefix}: ${t}`);
  const extractor = await getExtractor(modelName);

  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  const vectors: number[][] = output.tolist();

  return vectors.map((vec) => {
    const truncated = dimensions < 768 ? vec.slice(0, dimensions) : vec;
    return new Float32Array(truncated);
  });
}

// ─── embedOne ─────────────────────────────────────────────────────────────────

/**
 * Embeds a single text. Convenience wrapper around `embed`.
 */
export async function embedOne(
  text: string,
  taskPrefix: TaskPrefix,
  modelName = 'nomic-ai/nomic-embed-text-v1.5',
  dimensions = 768
): Promise<Float32Array> {
  const [result] = await embed([text], taskPrefix, modelName, dimensions);
  return result;
}
