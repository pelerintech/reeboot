# Design — webchat-ui

## Overview

Build a **TypeScript SPA** (Vite + React + TanStack) served by Hono as the default webchat implementation. The SPA uses a **protocol-agnostic component architecture** with an adapter layer that translates reeboot's WebSocket events into a generic `MessagePart` model. The webchat is **pluggable** via config (builtin SPA, static HTML, or external URL).

## Architecture

```
reeboot/server.ts (Hono)
├── REST endpoints (existing)
├── WebSocket (/ws/chat/:contextId)
├── SSE (/api/logs/stream)
└── Static serving
    └── webchat/dist/  (built SPA, Hono serves index.html + assets)
        │
        └── client-side SPA (Vite build)
            ├── App.tsx (layout: sidebar + content)
            ├── pages/ (Chat, Channels, Logs, Settings)
            ├── components/ (Chat, Message, Input, ToolCall, Panel)
            ├── hooks/ (useStream, useChat, useEvents)
            ├── adapters/ (HonoApiClient, WebChatAdapter)
            ├── providers/ (WebSocketProvider, ApiClientProvider)
            └── types/ (MessagePart, ChatEvent, etc.)
```

## Key Decisions

### 1. Vite + React + TypeScript

**Why Vite:**
- Fast HMR (hot module replacement) during development
- TypeScript-first (built-in type checking)
- Ecosystem (plugins, devtools, deployment)
- Industry standard for React SPAs

**Why React:**
- Largest ecosystem (shadcn/ui, TanStack, etc.)
- Component model (reusable, composable)
- HMR and devtools maturity
- Future-proof (React 19, concurrent features)

**Why TypeScript:**
- Type safety across API calls (no JSON shape surprises)
- IDE navigation (go to definition, find references)
- Compile-time errors (catch bugs before runtime)
- Required for shadcn/ui integration

### 2. TanStack Router + Query

**Why TanStack Router:**
- Typesafe routing (routes are TypeScript types)
- Layouts and nested routes (sidebar + content)
- Devtools (route inspection, state)
- Industry standard (TanStack ecosystem)

**Why TanStack Query:**
- Data fetching/caching (tasks, channels, contexts)
- Refetch logic (polling, mutation invalidation)
- Devtools (query inspection, debugging)
- Eliminates boilerplate (loading, error, retry states)

### 3. Shadcn/ui with Base UI Primitives

**Why Shadcn:**
- Copy-paste architecture (you own the code)
- Tailwind CSS (utility-first, flexible)
- Accessible (a11y built-in)
- Extractable (future `@reeboot/ui` package)

**Why Base UI (over Radix):**
- Team Tailwind maintains it (consistent with Tailwind)
- Better Tailwind integration (fewer class conflicts)
- Same accessibility guarantees as Radix
- Designed for Tailwind from the ground up

### 4. Agnostic Components + Adapter Layer

**Why agnostic components:**
- Components don't know about Hono, reeboot, or WebSocket
- They only know about `MessagePart` model
- Extractable as `@reeboot/ui` in the future
- Swappable adapters (different backends, same UI)

**Why adapter layer:**
- Translates reeboot's WebSocket events → generic `MessagePart`
- One adapter per backend (HonoAdapter, MockAdapter, etc.)
- Components remain protocol-agnostic
- Easy to test (mock adapters, no real server needed)

### 5. MessagePart Model

```typescript
type MessagePart =
  | { kind: 'text', content: string }
  | { kind: 'tool_call', name: string, args: unknown, result?: string, isError?: boolean }
  | { kind: 'thinking', content: string }
  | { kind: 'error', message: string }
  | { kind: 'system', message: string }
```

**Why this model:**
- Covers all reeboot WebSocket events (text_delta, tool_call_start/end, etc.)
- Extensible (add new kinds without breaking components)
- Simple (easy to understand, easy to test)
- Matches chat UI mental model (messages, tool calls, errors)

### 6. Layout: Sidebar + Content

**Why sidebar:**
- Always visible (quick navigation)
- Collapses on mobile (bottom nav or hamburger)
- Industry standard (Slack, Discord, VS Code)
- Fits reeboot's feature set (6+ tabs)

**Why responsive:**
- Desktop: sidebar (50px wide, icons only)
- Mobile: bottom nav (icons + labels) or hamburger menu
- Touch-friendly (large tap targets)
- Consistent UX across devices

### 7. Build Pipeline

```
Vite build
├── src/ (TypeScript, React, Tailwind)
└── dist/ (built assets, Hono serves)

Hono server
├── /api/* (REST endpoints, existing)
├── /ws/chat/* (WebSocket, existing)
└── /* (static files, serves webchat/dist/ index.html)
```

**Why this pipeline:**
- Hono serves everything (single origin, no CORS)
- Vite handles build (fast, TypeScript, Tailwind)
- Static files are versioned (hash in filenames)
- Easy to deploy (copy dist/ to production)

## Risks & Mitigations

### Risk 1: TanStack Router breaking changes (pre-1.0)

**Impact:** Low (minor API adjustments)
**Mitigation:** Pin versions, monitor TanStack releases, write tests

### Risk 2: Vite build size (bundle too large)

**Impact:** Medium (slow page loads)
**Mitigation:** Code splitting, tree-shaking, lazy loading

### Risk 3: WebSocket protocol changes

**Impact:** Medium (adapter layer breaks)
**Mitigation:** Test adapter against real server, version the protocol

### Risk 4: Responsive layout issues

**Impact:** Low (mobile UX)
**Mitigation:** Test on real devices, use mobile-first CSS

### Risk 5: Component extraction complexity

**Impact:** Low (future work)
**Mitigation:** Keep components agnostic from day one, document public API

## Tradeoffs

### Agnostic components vs. Tightly coupled

**Tradeoff:** Agnostic components are harder to build initially but easier to maintain and extract later.

**Decision:** Go agnostic. The adapter layer is small (~50 lines) and pays for itself in flexibility.

### Builtin SPA vs. Static HTML first

**Tradeoff:** Builtin SPA is more work upfront but provides a better user experience and foundation for future work.

**Decision:** Builtin SPA. The static HTML strategy can be added in v2 with minimal effort (just serve a file).

### Rich chat vs. Minimal chat

**Tradeoff:** Rich chat requires more components (markdown, code blocks, tool calls) but is expected by modern users.

**Decision:** Rich chat. The baseline is too low for a "product" — users expect markdown, code highlighting, and tool call visualization.

## Future Considerations

- **Multi-context support** (v2): Add context selector to sidebar or top bar
- **Soul editor** (v2): Add AGENTS.md editor to "Soul" tab
- **Corpus management** (v2): Add document ingestion/search to "Corpus" tab
- **Static HTML strategy** (v2): Add config option to serve custom HTML
- **External URL strategy** (v2): Add config option to redirect to external URL
- **@reeboot/ui package** (v3): Extract components to separate npm package
