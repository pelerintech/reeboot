# Tasks — webchat-ui

## 1. Setup Vite + React + TypeScript project

- [ ] **RED** — Check: `reeboot/webchat/package.json` does not exist, `reeboot/webchat/src/` does not exist. Assertion fails — project structure is absent.
- [ ] **ACTION** — Create `reeboot/webchat/package.json` with Vite, React, TypeScript dependencies. Create `reeboot/webchat/vite.config.ts` with Vite configuration. Create `reeboot/webchat/tsconfig.json` with TypeScript configuration. Create `reeboot/webchat/src/main.tsx` with React root component. Create `reeboot/webchat/index.html` with HTML entry point.
- [ ] **GREEN** — Verify: `reeboot/webchat/package.json` exists with Vite/React/TS dependencies. `reeboot/webchat/vite.config.ts` exists. `reeboot/webchat/tsconfig.json` exists. `reeboot/webchat/src/main.tsx` exists. `reeboot/webchat/index.html` exists.

## 2. Configure Hono to serve built SPA

- [ ] **RED** — Check: `reeboot/src/server.ts` does not serve `webchat/dist/` for static files. Assertion fails — Hono does not serve the SPA.
- [ ] **ACTION** — Update `reeboot/src/server.ts` to serve `webchat/dist/` as static files. Add `app.use('*', serveStatic({ root: resolve(__dirname, '../webchat/dist'), index: 'index.html' }))` after all API routes.
- [ ] **GREEN** — Verify: `reeboot/src/server.ts` contains static file serving for `webchat/dist/`. Hono serves `webchat/dist/index.html` for all unmatched routes.

## 3. Build layout with sidebar and content area

- [ ] **RED** — Check: `reeboot/webchat/src/App.tsx` does not contain sidebar layout. Assertion fails — layout is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/App.tsx` with sidebar (left, 50px wide) and content area (right). Sidebar contains navigation tabs (Chat, Channels, Logs, Settings). Content area displays the active tab content. Add Tailwind CSS classes for layout.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/App.tsx` contains sidebar layout with navigation tabs. Sidebar is 50px wide on desktop. Content area fills remaining space. Layout is responsive (sidebar collapses on mobile).

## 4. Implement tab navigation

- [ ] **RED** — Check: `reeboot/webchat/src/components/Navigation.tsx` does not exist. Assertion fails — navigation component is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/components/Navigation.tsx` with tab buttons (Chat, Channels, Logs, Settings). Add click handlers to switch active tab. Add active tab styling (accent color highlight). Update `App.tsx` to use Navigation component.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/components/Navigation.tsx` exists with tab buttons. Clicking a tab sets it as active. Active tab is highlighted. Navigation component is used in `App.tsx`.

## 5. Implement Chat page with message list and input

- [ ] **RED** — Check: `reeboot/webchat/src/pages/Chat.tsx` does not exist. Assertion fails — Chat page is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/pages/Chat.tsx` with message list and input field. Add placeholder messages (user and assistant). Add input field with "Send" button. Add basic styling for message bubbles.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/pages/Chat.tsx` exists with message list and input. Placeholder messages are displayed. Input field is functional. Chat page is displayed when "Chat" tab is active.

## 6. Implement WebSocket connection for chat

- [ ] **RED** — Check: `reeboot/webchat/src/hooks/useWebSocket.ts` does not exist. Assertion fails — WebSocket hook is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/hooks/useWebSocket.ts` with WebSocket connection to `/ws/chat/:contextId`. Add connection status tracking (connecting, connected, error). Add send message function. Add message event handler. Add reconnect logic.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/hooks/useWebSocket.ts` exists. WebSocket connects to `/ws/chat/main`. Connection status is tracked. Send message function is exposed. Reconnect logic is implemented.

## 7. Implement message rendering with streaming

- [ ] **RED** — Check: `reeboot/webchat/src/components/Message.tsx` does not exist. Assertion fails — Message component is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/components/Message.tsx` with message bubble rendering. Support text content, markdown rendering (basic). Add streaming indicator (blinking cursor). Add user/assistant role styling.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/components/Message.tsx` exists. Message bubbles are rendered with role-based styling. Streaming indicator is shown for assistant messages. Markdown is rendered (basic).

## 8. Implement tool call visualization

- [ ] **RED** — Check: `reeboot/webchat/src/components/ToolCall.tsx` does not exist. Assertion fails — ToolCall component is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/components/ToolCall.tsx` with collapsible tool call indicator. Show tool name (e.g., "⚙ schedule_task"). Add expand/collapse functionality. Show tool result when expanded. Add error styling for failed tool calls.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/components/ToolCall.tsx` exists. Tool call indicator shows tool name. Tool call can be expanded/collapsed. Tool result is shown when expanded. Error styling is applied for failed tool calls.

## 9. Implement Channel status page

- [ ] **RED** — Check: `reeboot/webchat/src/pages/Channels.tsx` does not exist. Assertion fails — Channels page is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/pages/Channels.tsx` with channel list. Fetch channel data from `GET /api/channels`. Display channel status (connected, disconnected, error). Add reconnection button for each channel.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/pages/Channels.tsx` exists. Channel list is displayed with status. Reconnection button is shown for each channel. Clicking reconnection button sends POST to `/api/channels/:type/reconnect`.

## 10. Implement Logs page with SSE stream

- [ ] **RED** — Check: `reeboot/webchat/src/pages/Logs.tsx` does not exist. Assertion fails — Logs page is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/pages/Logs.tsx` with log stream container. Connect to SSE endpoint `GET /api/logs/stream`. Display log records as colored rows. Add level filter dropdown. Add pause/resume button.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/pages/Logs.tsx` exists. Log stream is connected to SSE endpoint. Log records are displayed as colored rows. Level filter is functional. Pause/resume button works.

## 11. Implement Settings page with budget form

- [ ] **RED** — Check: `reeboot/webchat/src/pages/Settings.tsx` does not exist. Assertion fails — Settings page is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/pages/Settings.tsx` with budget limits form. Fetch budget data from `GET /api/settings/budget`. Display form fields (daily cost, daily tokens, session cost, etc.). Add progress bar for daily spend. Add save button.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/pages/Settings.tsx` exists. Budget form is displayed with all fields. Progress bar shows daily spend percentage. Save button sends PUT to `/api/settings/budget`. Success message is shown after save.

## 12. Implement responsive layout

- [ ] **RED** — Check: `reeboot/webchat/src/App.tsx` does not handle mobile viewport. Assertion fails — responsive layout is absent.
- [ ] **ACTION** — Update `reeboot/webchat/src/App.tsx` with responsive layout. On mobile (<768px), transform sidebar into bottom tab bar. Add CSS classes for responsive design. Test on mobile viewport.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/App.tsx` contains responsive layout. On mobile, sidebar is replaced with bottom tab bar. Navigation tabs are accessible on mobile. Content area fills remaining space.

## 13. Add Tailwind CSS configuration

- [ ] **RED** — Check: `reeboot/webchat/tailwind.config.js` does not exist. Assertion fails — Tailwind config is absent.
- [ ] **ACTION** — Create `reeboot/webchat/tailwind.config.js` with Tailwind configuration. Add custom colors (accent: #4f9cf9, etc.). Add content paths. Update `vite.config.ts` to include Tailwind plugin.
- [ ] **GREEN** — Verify: `reeboot/webchat/tailwind.config.js` exists with custom colors. Tailwind plugin is included in `vite.config.ts`. Tailwind CSS classes are applied to components.

## 14. Write unit tests for Message component

- [ ] **RED** — Check: `reeboot/webchat/src/components/__tests__/Message.test.tsx` does not exist. Assertion fails — Message component test is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/components/__tests__/Message.test.tsx` with unit tests for Message component. Test rendering user message, assistant message, streaming indicator, markdown rendering. Use Vitest and React Testing Library.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/components/__tests__/Message.test.tsx` exists. Run `npm test` — all Message component tests pass.

## 15. Write unit tests for ToolCall component

- [ ] **RED** — Check: `reeboot/webchat/src/components/__tests__/ToolCall.test.tsx` does not exist. Assertion fails — ToolCall component test is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/components/__tests__/ToolCall.test.tsx` with unit tests for ToolCall component. Test rendering tool call indicator, expand/collapse, tool result display, error styling. Use Vitest and React Testing Library.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/components/__tests__/ToolCall.test.tsx` exists. Run `npm test` — all ToolCall component tests pass.

## 16. Write integration tests for WebSocket hook

- [ ] **RED** — Check: `reeboot/webchat/src/hooks/__tests__/useWebSocket.test.ts` does not exist. Assertion fails — WebSocket hook test is absent.
- [ ] **ACTION** — Create `reeboot/webchat/src/hooks/__tests__/useWebSocket.test.ts` with integration tests for WebSocket hook. Test connection, send message, message event handling, reconnect logic. Use Vitest and mock WebSocket.
- [ ] **GREEN** — Verify: `reeboot/webchat/src/hooks/__tests__/useWebSocket.test.ts` exists. Run `npm test` — all WebSocket hook tests pass.
