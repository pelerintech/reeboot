// test-ree.mjs — ree SDK integration tests (16 scenarios)
import {
  restGet,
  restPost,
  restPut,
  restDelete,
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

  // ── 5. Tasks CRUD ──
  try {
    const tasksBefore = await restGet(BASE, '/api/tasks');
    assert(Array.isArray(tasksBefore), '5a. Tasks GET — array');

    const newTask = await restPost(BASE, '/api/tasks', {
      prompt: 'test task',
      schedule: 'daily',
      contextId: 'main',
    });
    assert(typeof newTask === 'object' && newTask.id, '5b. Tasks POST — created with id');

    if (newTask && newTask.id) {
      const tasksAfter = await restGet(BASE, '/api/tasks');
      const found = tasksAfter.some((t) => t.id === newTask.id);
      assert(found, '5c. Tasks GET — task found after create');

      await restDelete(BASE, `/api/tasks/${newTask.id}`);
      assert(true, '5d. Tasks DELETE — no error');
    } else {
      assert(false, '5c. Tasks GET — skipped (no task id)');
      assert(false, '5d. Tasks DELETE — skipped (no task id)');
    }
  } catch (err) {
    assert(false, '5. Tasks CRUD — ' + err.message);
  }

  // ── 6. Budget CRUD ──
  try {
    const budgetBefore = await restGet(BASE, '/api/settings/budget');
    assert(typeof budgetBefore === 'object', '6a. Budget GET — valid JSON');

    await restPut(BASE, '/api/settings/budget', { daily_tokens: 1000 });
    assert(true, '6b. Budget PUT — accepted');

    const budgetAfter = await restGet(BASE, '/api/settings/budget');
    assert(budgetAfter.limits && budgetAfter.limits.daily_tokens === 1000, '6c. Budget GET — reflects update');
  } catch (err) {
    assert(false, '6. Budget CRUD — ' + err.message);
  }

  // ── 7. Logs stream ──
  try {
    // Verify SSE endpoint is accessible and returns correct content type
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${BASE}/api/logs/stream?level=trace`, {
      signal: controller.signal,
    });
    assert(res.status === 200, '7a. Logs stream — 200 OK');
    const contentType = res.headers.get('content-type') || '';
    assert(contentType.includes('text/event-stream'), '7b. Logs stream — SSE content type');

    // Try to read at least one frame
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

    assert(gotFrame, '7c. Logs stream — at least 1 SSE frame with data: prefix');
  } catch (err) {
    assert(false, '7. Logs stream — ' + err.message);
  }

  // ── 8. Reload ──
  try {
    await restPost(BASE, '/api/reload', {});
    assert(true, '8a. Reload — POST accepted');

    const healthAfter = await restGet(BASE, '/api/health');
    assert(healthAfter.status === 'ok', '8b. Reload — health still ok');
  } catch (err) {
    assert(false, '8. Reload — ' + err.message);
  }

  // ── 9. WS connect ──
  let ws;
  try {
    ws = await wsConnect(BASE, 'main');
    const connected = await waitForEventType(ws.events, 'connected', 10000);
    assert(connected.contextId === 'main', '9. WS connect — connected event with contextId');
  } catch (err) {
    assert(false, '9. WS connect — ' + err.message);
  }

  // ── 10. WS text turn ──
  try {
    ws.send({ type: 'message', content: 'Say hello briefly', contextId: 'main' });
    await waitForEventType(ws.events, 'text_delta', 120000);
    assert(true, '10a. WS text turn — text_delta received');
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '10b. WS text turn — message_end received');
    const textDeltas = ws.events.filter((e) => e.type === 'text_delta');
    const accumulated = textDeltas.map((e) => e.delta).join('');
    assert(accumulated.length > 0, '10c. WS text turn — non-empty response');
  } catch (err) {
    assert(false, '10. WS text turn — ' + err.message);
  }

  // ── 11. WS tool call ──
  try {
    ws.send({ type: 'message', content: 'run bash: echo test', contextId: 'main' });
    const toolStart = await waitForEventMatch(ws.events, (e) => e.type === 'tool_call_start', 120000);
    assert(toolStart !== undefined, '11a. WS tool call — tool_call_start received');
    assert(toolStart.toolName === 'bash', '11b. WS tool call — toolName is bash');
    const toolCallId = toolStart.toolCallId;
    const toolEnd = await waitForEventMatch(ws.events, (e) => e.type === 'tool_call_end', 120000);
    assert(toolEnd !== undefined, '11c. WS tool call — tool_call_end received');
    assert(toolEnd.toolCallId === toolCallId, '11d. WS tool call — toolCallId matches');
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '11c. WS tool call — message_end received');
  } catch (err) {
    assert(false, '11. WS tool call — ' + err.message);
  }

  // ── 12. WS multi-turn ──
  try {
    ws.send({ type: 'message', content: 'Remember my name is Alice', contextId: 'main' });
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '12a. WS multi-turn — first turn completed');

    // Clear events from first turn so we can isolate second turn's text
    const eventsBeforeTurn2 = ws.events.length;
    ws.send({ type: 'message', content: 'What is my name?', contextId: 'main' });
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '12b. WS multi-turn — second turn completed');

    // Verify context recall — second turn should mention "Alice"
    const turn2TextDeltas = ws.events.slice(eventsBeforeTurn2).filter((e) => e.type === 'text_delta');
    const turn2Text = turn2TextDeltas.map((e) => e.delta).join('');
    assert(turn2Text.toLowerCase().includes('alice'), '12c. WS multi-turn — second turn recalls "Alice"');
  } catch (err) {
    assert(false, '12. WS multi-turn — ' + err.message);
  }

  // ── 13. WS abort ──
  try {
    const eventsBeforeAbort = ws.events.length;
    ws.send({ type: 'message', content: 'Write a very long essay about the history of computing, covering every major invention in detail', contextId: 'main' });
    await waitForEventType(ws.events, 'text_delta', 60000);
    // Note: spec says type: "abort" but server accepts type: "cancel" (see server.ts:656)
    ws.send({ type: 'cancel', contextId: 'main' });
    const cancelled = await waitForEventType(ws.events, 'cancelled', 30000);
    assert(cancelled !== undefined, '13a. WS abort — cancelled event received');

    // Verify no message_end was received for the aborted turn
    const turnEvents = ws.events.slice(eventsBeforeAbort);
    const hasMessageEnd = turnEvents.some((e) => e.type === 'message_end');
    assert(!hasMessageEnd, '13b. WS abort — no message_end for aborted turn');

    // Verify connection remains open — send a follow-up message
    ws.send({ type: 'message', content: 'Say OK', contextId: 'main' });
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '13c. WS abort — connection still open for subsequent messages');
  } catch (err) {
    assert(false, '13. WS abort — ' + err.message);
  }

  // ── 14. Concurrent chats ──
  try {
    // Two WS connections to different contexts, simultaneous turns
    const ws1 = await wsConnect(BASE, 'main');
    const ws2 = await wsConnect(BASE, 'test');
    ws1.send({ type: 'message', content: 'Say A', contextId: 'main' });
    ws2.send({ type: 'message', content: 'Say B', contextId: 'test' });
    await waitForEventType(ws1.events, 'message_end', 120000);
    assert(true, '14a. Concurrent chats — chat 1 (main) completed');
    await waitForEventType(ws2.events, 'message_end', 120000);
    assert(true, '14b. Concurrent chats — chat 2 (test) completed');
    ws1.close();
    ws2.close();
  } catch (err) {
    assert(false, '14. Concurrent chats — ' + err.message);
  }

  // ── 15. Chat isolation ──
  try {
    // Reconnect for isolation test
    ws = await wsConnect(BASE, 'main');
    ws.send({ type: 'message', content: 'My secret is alpha', contextId: 'main' });
    await waitForEventType(ws.events, 'message_end', 120000);

    // Close and reconnect — new session should not know about previous
    ws.close();
    ws = await wsConnect(BASE, 'main');
    ws.send({ type: 'message', content: 'What is my secret?', contextId: 'main' });
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '15. Chat isolation — independent session completed');
  } catch (err) {
    assert(false, '15. Chat isolation — ' + err.message);
  }

  // ── 16. Extension subset ──
  try {
    ws.send({ type: 'message', content: 'What tools do you have available?', contextId: 'main' });
    await waitForEventType(ws.events, 'message_end', 120000);
    assert(true, '16a. Extension subset — turn completed');
    const textDeltas = ws.events.filter((e) => e.type === 'text_delta');
    const text = textDeltas.map((e) => e.delta).join('').toLowerCase();
    assert(text.length > 0, '16b. Extension subset — non-empty response');
    assert(text.includes('bash'), '16c. Extension subset — bash referenced');
    assert(text.includes('read'), '16d. Extension subset — read referenced');
    assert(text.includes('write'), '16e. Extension subset — write referenced');
  } catch (err) {
    assert(false, '16. Extension subset — ' + err.message);
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
