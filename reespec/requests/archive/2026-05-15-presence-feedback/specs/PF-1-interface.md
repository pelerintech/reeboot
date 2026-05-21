# Spec PF-1 — ChannelAdapter presence interface

## Capability

`ChannelAdapter` gains three optional methods: `markRead`, `startTyping`, `stopTyping`.
Existing adapters that do not implement them continue to compile and pass all tests
unchanged.

---

## Scenarios

### PF-1-A: Optional methods are defined on the interface

GIVEN the `ChannelAdapter` interface in `src/channels/interface.ts`  
WHEN the interface is read  
THEN it includes:
- `markRead?(msg: IncomingMessage): Promise<void>`
- `startTyping?(msg: IncomingMessage): Promise<void>`
- `stopTyping?(msg: IncomingMessage): Promise<void>`
all declared as optional (`?`)

### PF-1-B: Adapters without presence methods remain valid

GIVEN an adapter that implements only the existing required methods  
(`init`, `start`, `stop`, `send`, `status`, `connectedAt`, `selfAddress`)  
WHEN TypeScript compiles the adapter  
THEN no type error is produced — the optional methods are absent but valid

### PF-1-C: The broken Tier 1 contract stub still compiles and fails as designed

GIVEN the intentionally broken stub in `tests/channels/contract/tier1.contract.test.ts`  
WHEN the test suite runs  
THEN the stub still compiles without type errors  
AND the contract-violation tests still report as expected (load-bearing failures unchanged)
