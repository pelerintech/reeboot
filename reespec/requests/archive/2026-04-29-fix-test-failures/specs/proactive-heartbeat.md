# Spec: Proactive-Agent Heartbeat Tests

## Capability

Rewrite the `System heartbeat` test block in `tests/proactive-agent.test.ts` to target the actual bus-based `startHeartbeat` implementation.

## Interface

No runtime API changes. Only test changes.

## Current State (broken)

```ts
// OLD signature — does not exist anymore
startHeartbeat(config, db, orchestrator)
// orchestrator: { handleHeartbeatTick, sendToDefaultChannel }

// NEW signature — actual implementation
startHeartbeat(config, db, bus)
// bus: MessageBus with publish(message)
```

## RED Checklist

- [ ] `npm run test:run -- tests/proactive-agent.test.ts` shows 5 failures in `System heartbeat`
- [ ] Console shows `[Heartbeat] tick failed: TypeError: bus.publish is not a function`

## GREEN Checklist (new tests)

### Test: disabled by default — no publish when enabled=false

```ts
it('disabled by default — no heartbeat loop started when enabled=false', async () => {
  const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
  const { MessageBus } = await import('@src/channels/interface.js');
  const bus = new MessageBus();
  const publishSpy = vi.spyOn(bus, 'publish');

  startHeartbeat({ enabled: false, interval: 'every 5m', contextId: 'main' }, db, bus);
  await vi.advanceTimersByTimeAsync(400_000);
  
  expect(publishSpy).not.toHaveBeenCalled();
  stopHeartbeat();
});
```

### Test: fires at configured interval

```ts
it('fires at configured interval when enabled', async () => {
  const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
  const { MessageBus } = await import('@src/channels/interface.js');
  const bus = new MessageBus();
  const publishSpy = vi.spyOn(bus, 'publish');

  startHeartbeat({ enabled: true, interval: 'every 1m', contextId: 'main' }, db, bus);
  await vi.advanceTimersByTimeAsync(65_000);
  
  expect(publishSpy).toHaveBeenCalledTimes(1);
  stopHeartbeat();
});
```

### Test: fires multiple times

```ts
it('fires multiple times across multiple intervals', async () => {
  const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
  const { MessageBus } = await import('@src/channels/interface.js');
  const bus = new MessageBus();
  const publishSpy = vi.spyOn(bus, 'publish');

  startHeartbeat({ enabled: true, interval: 'every 1m', contextId: 'main' }, db, bus);
  await vi.advanceTimersByTimeAsync(130_000);
  
  expect(publishSpy).toHaveBeenCalledTimes(2);
  stopHeartbeat();
});
```

### Test: published message contains correct metadata

```ts
it('published message has correct channelType, peerId, and content', async () => {
  const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
  const { MessageBus } = await import('@src/channels/interface.js');
  const bus = new MessageBus();
  const publishSpy = vi.spyOn(bus, 'publish');

  startHeartbeat({ enabled: true, interval: 'every 1m', contextId: 'main' }, db, bus);
  await vi.advanceTimersByTimeAsync(65_000);

  expect(publishSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      channelType: 'heartbeat',
      peerId: 'main',
      content: expect.stringContaining('System heartbeat'),
    })
  );
  stopHeartbeat();
});
```

### Test: stopHeartbeat prevents further ticks

```ts
it('stopHeartbeat prevents further ticks', async () => {
  const { startHeartbeat, stopHeartbeat } = await import('../src/scheduler/heartbeat.js');
  const { MessageBus } = await import('@src/channels/interface.js');
  const bus = new MessageBus();
  const publishSpy = vi.spyOn(bus, 'publish');

  startHeartbeat({ enabled: true, interval: 'every 1m', contextId: 'main' }, db, bus);
  await vi.advanceTimersByTimeAsync(65_000);
  expect(publishSpy).toHaveBeenCalledTimes(1);

  stopHeartbeat();
  await vi.advanceTimersByTimeAsync(65_000);
  expect(publishSpy).toHaveBeenCalledTimes(1);
});
```

## Tests to remove

The following test orchestrator-level behavior (IDLE suppression, default-channel routing), not `startHeartbeat`. They should be deleted; orchestrator heartbeat behavior is covered by `orchestrator.test.ts`:

- `IDLE response suppressed — sendToDefaultChannel not called`
- `non-IDLE response sent to default channel`
- `IDLE detection is case-insensitive`

## Tests to keep (already passing, unaffected)

- `prompt contains IDLE instruction` — tests `renderHeartbeatPrompt` directly
- `prompt contains overdue task when one exists` — tests `renderHeartbeatPrompt` directly  
- `prompt contains upcoming task (next 24h)` — tests `renderHeartbeatPrompt` directly

## Verification

- [ ] `npm run test:run -- tests/proactive-agent.test.ts` → 0 failures
- [ ] All `System heartbeat` tests use `MessageBus` not `{ handleHeartbeatTick, sendToDefaultChannel }`
- [ ] `renderHeartbeatPrompt` tests remain unchanged
- [ ] `TimerManager` tests remain unchanged (sections 1.2, 1.3, 1.4)
