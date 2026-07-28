/**
 * A2A client — sends tasks to remote A2A peers over HTTP.
 *
 * Used by the delegate tool when a "peer" is specified.
 * Configured peers live in the `a2a.peers` section of config.json.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface A2ACapabilities {
  name: string;
  version: string;
  tools: string[];
  protocols: string[];
}

export interface A2AResult {
  status: 'completed' | 'failed';
  id?: string;
  result?: string;
  error?: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Send a task to an A2A peer and return the result.
 */
export async function a2aInvoke(
  url: string,
  task: string,
  apiKey?: string,
  timeoutMs: number = 60_000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${url.replace(/\/+$/, '')}/a2a/invoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ task, timeout: timeoutMs / 1000 }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`A2A peer returned ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as A2AResult;

    if (data.status === 'failed') {
      throw new Error(`A2A peer failed: ${data.error ?? 'Unknown error'}`);
    }

    return data.result ?? '(no result)';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`A2A request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Discover a peer's capabilities.
 */
export async function a2aDiscover(
  url: string,
  apiKey?: string,
): Promise<A2ACapabilities> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${url.replace(/\/+$/, '')}/a2a/capabilities`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to discover A2A peer: ${response.status}`);
  }

  return response.json() as Promise<A2ACapabilities>;
}
