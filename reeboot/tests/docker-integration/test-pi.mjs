// test-pi.mjs — pi SDK integration tests (14 scenarios)
import {
  restGet,
  restPost,
  wsConnect,
  waitForEventType,
  waitForEventMatch,
  assert,
  summary,
} from './helpers.mjs';

const BASE = 'http://localhost:3000';

async function run() {
  // ── 1. Health check ──
  try {
    const health = await restGet(BASE, '/api/health');
    assert(health.status === 'ok', '1. Health check — status ok');
    assert(typeof health.version === 'string' && health.version.length > 0, '1. Health check — version present');
    assert(typeof health.uptime === 'number' && health.uptime > 0, '1. Health check — uptime present and > 0');
  } catch (err) {
    assert(false, '1. Health check — ' + err.message);
  }

  // ── 2. Runtime status ──
  try {
    const status = await restGet(BASE, '/api/status');
    assert(typeof status === 'object' && status !== null, '2. Runtime status — valid JSON');
  } catch (err) {
    assert(false, '2. Runtime status — ' + err.message);
  }

  // ── 3. Channels registered ──
  try {
    const channels = await restGet(BASE, '/api/channels');
    assert(Array.isArray(channels), '3. Channels — is array');
    const hasWeb = channels.some((ch) => ch.type === 'web');
    assert(hasWeb, '3. Channels — web present');
  } catch (err) {
    assert(false, '3. Channels — ' + err.message);
  }

  // ── 4. Contexts exist ──
  try {
    const contexts = await restGet(BASE, '/api/contexts');
    assert(Array.isArray(contexts) && contexts.length >= 1, '4. Contexts — non-empty array');
    const hasMain = contexts.some((c) => c.id === 'main');
    assert(hasMain, '4. Contexts — main exists');
  } catch (err) {
    assert(false, '4. Contexts — ' + err.message);
  }

  // ── 5. Sessions endpoint ──
  try {
    const sessions = await restGet(BASE, '/api/contexts/main/sessions');
    assert(Array.isArray(sessions), '5. Sessions — array returned');
  } catch (err) {
    assert(false, '5. Sessions — ' + err.message);
  }

  // ── 6. Extensions loaded (reload) ──
  try {
    await restPost(BASE, '/api/reload', {});
    assert(true, '6a. Extensions — reload accepted');
    const healthAfter = await restGet(BASE, '/api/health');
    assert(healthAfter.status === 'ok', '6b. Extensions — health still ok after reload');
  } catch (err) {
    assert(false, '6. Extensions — ' + err.message);
  }

  // ── 7. WS connect ──
  let ws;
  try {
    ws = await wsConnect(BASE, 'main');
    const connected = await waitForEventType(ws.events, 'connected', 10000);
    assert(connected.contextId === 'main', '7. WS connect — connected event with contextId');
  } catch (err) {
    assert(false, '7. WS connect — ' + err.message);
  }

  // ── 8. WS text turn ──
  try {
    ws.send({ type: 'message', content: 'Say hello briefly', contextId: 'main' });
    await waitForEventType(ws.events, 'text_delta', 120000);
    assert(true, '8a. WS text turn — text_delta received');
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '8b. WS text turn — message_end received');
    const textDeltas = ws.events.filter((e) => e.type === 'text_delta');
    const accumulated = textDeltas.map((e) => e.delta).join('');
    assert(accumulated.length > 0, '8c. WS text turn — non-empty response');
  } catch (err) {
    assert(false, '8. WS text turn — ' + err.message);
  }

  // ── 9. WS tool call (bash) ──
  try {
    ws.send({ type: 'message', content: 'run bash: echo test', contextId: 'main' });
    const toolStart = await waitForEventMatch(ws.events, (e) => e.type === 'tool_call_start', 120000);
    assert(toolStart !== undefined, '9a. WS tool call (bash) — tool_call_start received');
    assert(toolStart.toolName === 'bash', '9b. WS tool call (bash) — toolName is bash');
    const toolCallId = toolStart.toolCallId;
    const toolEnd = await waitForEventMatch(ws.events, (e) => e.type === 'tool_call_end', 120000);
    assert(toolEnd !== undefined, '9c. WS tool call (bash) — tool_call_end received');
    assert(toolEnd.toolCallId === toolCallId, '9d. WS tool call (bash) — toolCallId matches');
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '9c. WS tool call (bash) — message_end received');
  } catch (err) {
    assert(false, '9. WS tool call (bash) — ' + err.message);
  }

  // ── 10. WS tool call (read) ──
  try {
    ws.send({ type: 'message', content: 'read the file package.json', contextId: 'main' });
    const toolStart = await waitForEventMatch(ws.events, (e) => e.type === 'tool_call_start', 120000);
    assert(toolStart !== undefined, '10a. WS tool call (read) — tool_call_start received');
    assert(toolStart.toolName === 'read', '10b. WS tool call (read) — toolName is read');
    const toolCallId = toolStart.toolCallId;
    const toolEnd = await waitForEventMatch(ws.events, (e) => e.type === 'tool_call_end', 120000);
    assert(toolEnd !== undefined, '10c. WS tool call (read) — tool_call_end received');
    assert(toolEnd.toolCallId === toolCallId, '10d. WS tool call (read) — toolCallId matches');
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '10e. WS tool call (read) — message_end received');
  } catch (err) {
    assert(false, '10. WS tool call (read) — ' + err.message);
  }

  // ── 10b. WS tool call (write) ──
  try {
    ws.send({ type: 'message', content: 'write a file called /tmp/test.txt with content "hello"', contextId: 'main' });
    const toolStart = await waitForEventMatch(ws.events, (e) => e.type === 'tool_call_start', 120000);
    assert(toolStart !== undefined, '10ba. WS tool call (write) — tool_call_start received');
    assert(toolStart.toolName === 'write', '10bb. WS tool call (write) — toolName is write');
    const toolCallId = toolStart.toolCallId;
    const toolEnd = await waitForEventMatch(ws.events, (e) => e.type === 'tool_call_end', 120000);
    assert(toolEnd !== undefined, '10bc. WS tool call (write) — tool_call_end received');
    assert(toolEnd.toolCallId === toolCallId, '10bd. WS tool call (write) — toolCallId matches');
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '10be. WS tool call (write) — message_end received');
  } catch (err) {
    assert(false, '10b. WS tool call (write) — ' + err.message);
  }

  // ── 11. WS multi-turn ──
  try {
    ws.send({ type: 'message', content: 'Remember my name is Bob', contextId: 'main' });
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '11a. WS multi-turn — first turn completed');

    // Clear events from first turn so we can isolate second turn's text
    const eventsBeforeTurn2 = ws.events.length;
    ws.send({ type: 'message', content: 'What is my name?', contextId: 'main' });
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '11b. WS multi-turn — second turn completed');

    // Verify context recall — second turn should mention "Bob"
    const turn2TextDeltas = ws.events.slice(eventsBeforeTurn2).filter((e) => e.type === 'text_delta');
    const turn2Text = turn2TextDeltas.map((e) => e.delta).join('');
    assert(turn2Text.toLowerCase().includes('bob'), '11c. WS multi-turn — second turn recalls "Bob"');
  } catch (err) {
    assert(false, '11. WS multi-turn — ' + err.message);
  }

  // ── 12. Tasks endpoint ──
  try {
    const tasks = await restGet(BASE, '/api/tasks');
    assert(Array.isArray(tasks), '12. Tasks endpoint — array returned');
  } catch (err) {
    assert(false, '12. Tasks endpoint — ' + err.message);
  }

  // ── 13. Budget endpoint ──
  try {
    const budget = await restGet(BASE, '/api/settings/budget');
    assert(typeof budget === 'object', '13. Budget endpoint — valid JSON');
  } catch (err) {
    assert(false, '13. Budget endpoint — ' + err.message);
  }

  // ── 14. Logs stream ──
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${BASE}/api/logs/stream?level=trace`, {
      signal: controller.signal,
    });
    assert(res.status === 200, '14a. Logs stream — 200 OK');
    const contentType = res.headers.get('content-type') || '';
    assert(contentType.includes('text/event-stream'), '14b. Logs stream — SSE content type');

    // Read at least one SSE frame
    const reader = res.body.getReader();
    let gotFrame = false;
    let data = '';

    // Trigger reload in background to generate log entries
    const reloadPromise = (async () => {
      await new Promise((r) => setTimeout(r, 500));
      try { await restPost(BASE, '/api/reload', {}); } catch {}
    })();

    const readStart = Date.now();
    while (Date.now() - readStart < 8000) {
      try {
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('read timeout')), 4000),
          ),
        ]);
        if (done) break;
        if (value) {
          data += new TextDecoder().decode(value);
          if (data.includes('data: ')) {
            gotFrame = true;
            break;
          }
        }
      } catch {
        // read timeout — keep trying
      }
    }
    clearTimeout(timeoutId);
    await reloadPromise;

    assert(gotFrame, '14c. Logs stream — at least 1 SSE frame with data: prefix');
  } catch (err) {
    assert(false, '14. Logs stream — ' + err.message);
  }

  // Cleanup
  if (ws) ws.close();

  // Print results
  const allPassed = summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  summary();
  process.exit(1);
});
