// helpers.mjs — shared test primitives for Docker integration tests
// Pure Node.js — uses built-in fetch (Node 18+) and ws package

import { WebSocket } from 'ws';

const results = [];

/**
 * Poll GET /api/health every 1s until 200 or timeout.
 * @param {string} base - Base URL (e.g., http://localhost:3000)
 * @param {number} timeout - Max wait in ms (default 30000)
 * @returns {Promise<object>} Health response body
 */
export async function waitForHealth(base, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.status === 200) {
        return await res.json();
      }
    } catch {
      // keep polling
    }
    await sleep(1000);
  }
  throw new Error(`Health check timed out after ${timeout}ms`);
}

/**
 * HTTP GET with JSON parsing
 * @param {string} base - Base URL
 * @param {string} path - API path (e.g., /api/status)
 * @returns {Promise<object>} Parsed JSON body
 */
export async function restGet(base, path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  return JSON.parse(text);
}

/**
 * HTTP POST with JSON body
 * @param {string} base - Base URL
 * @param {string} path - API path
 * @param {object} body - Request body
 * @returns {Promise<object>} Parsed JSON response
 */
export async function restPost(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return text.length ? JSON.parse(text) : {};
}

/**
 * HTTP PUT with JSON body
 * @param {string} base - Base URL
 * @param {string} path - API path
 * @param {object} body - Request body
 * @returns {Promise<object>} Parsed JSON response
 */
export async function restPut(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return text.length ? JSON.parse(text) : {};
}

/**
 * HTTP DELETE
 * @param {string} base - Base URL
 * @param {string} path - API path
 * @returns {Promise<object>} Parsed JSON response (or empty object for 204)
 */
export async function restDelete(base, path) {
  const res = await fetch(`${base}${path}`, { method: 'DELETE' });
  const text = await res.text();
  return text.length ? JSON.parse(text) : {};
}

/**
 * Connect to WebSocket chat endpoint
 * @param {string} base - Base URL (http://localhost:3000)
 * @param {string} contextId - Context ID
 * @returns {{ ws: WebSocket, events: object[], send: function, close: function }}
 */
export function wsConnect(base, contextId) {
  const wsUrl = base.replace('http://', 'ws://').replace('https://', 'wss://');
  const ws = new WebSocket(`${wsUrl}/ws/chat/${contextId}`);
  const events = [];

  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      resolve({
        ws,
        events,
        send: (msg) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        },
        close: () => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        },
      });
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        events.push(msg);
      } catch {
        events.push({ type: 'raw', data: data.toString() });
      }
    });

    ws.on('error', (err) => {
      reject(err);
    });

    // Timeout after 10s if connection doesn't open
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`WebSocket connection to ${contextId} timed out`));
      }
    }, 10000);
  });
}

/**
 * Wait for a specific event type in the events array
 * @param {object[]} events - Events array from wsConnect
 * @param {string} type - Event type to wait for
 * @param {number} timeout - Max wait in ms
 * @returns {Promise<object>} The matching event
 */
export async function waitForEventType(events, type, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const event = events.find((e) => e.type === type);
    if (event) return event;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for event type "${type}" after ${timeout}ms. Got ${events.length} events.`);
}

/**
 * Wait for any event matching a predicate
 * @param {object[]} events - Events array from wsConnect
 * @param {Function} predicate - Test function
 * @param {number} timeout - Max wait in ms
 * @returns {Promise<object>} The matching event
 */
export async function waitForEventMatch(events, predicate, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const event = events.find(predicate);
    if (event) return event;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for event match after ${timeout}ms. Got ${events.length} events.`);
}

/**
 * Assert that an event of a given type exists in the events array
 * @param {object[]} events - Events array from wsConnect
 * @param {string} type - Event type to assert
 * @param {string} label - Test label
 */
export function assertEvent(events, type, label) {
  const found = events.some((e) => e.type === type);
  results.push({ label: label || `event ${type}`, pass: Boolean(found) });
  return found;
}

/**
 * Assert a condition, tracking pass/fail
 * @param {boolean} condition - Must be truthy to pass
 * @param {string} label - Test label
 */
export function assert(condition, label) {
  results.push({ label, pass: Boolean(condition) });
}

/**
 * Print test results summary
 * @returns {boolean} true if all passed
 */
export function summary() {
  console.log('\n=== Test Results ===');
  for (const r of results) {
    console.log(r.pass ? `[PASS] ${r.label}` : `[FAIL] ${r.label}`);
  }
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  return results.every((r) => r.pass);
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
