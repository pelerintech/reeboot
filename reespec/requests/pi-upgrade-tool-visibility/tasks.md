# Tasks: pi Upgrade + Tool Visibility

All commands run from `reeboot/` unless stated otherwise.

---

### 1. Bump pi to 0.62.0

- [ ] **RED** — Write `tests/pi-version.test.ts`: read `package.json` and assert
      `dependencies["@mariozechner/pi-coding-agent"]` equals `"0.62.0"`. Run
      `npx vitest run tests/pi-version.test.ts` → test fails (value is `"latest"`).
- [ ] **ACTION** — In `reeboot/package.json`, change
      `"@mariozechner/pi-coding-agent": "latest"` to `"@mariozechner/pi-coding-agent": "0.62.0"`.
      Run `npm install` to update `node_modules` and `package-lock.json`.
- [ ] **GREEN** — Run `npx vitest run tests/pi-version.test.ts` → test passes.
      Also verify: `node -e "import('./node_modules/@mariozechner/pi-coding-agent/dist/index.js').then(m => console.log('ok'))"` exits 0.

---

### 2. Add promptSnippet to web-search tools

- [ ] **RED** — Write `tests/web-search-snippets.test.ts`: import
      `src/extensions/web-search.ts`, collect all tool definitions registered via a
      mock `pi.registerTool` spy, and assert that both `web_search` and `fetch_url`
      have a non-empty `promptSnippet` that does not contain the word `"searxng"`.
      Run `npx vitest run tests/web-search-snippets.test.ts` → test fails (no `promptSnippet` present).
- [ ] **ACTION** — Add `promptSnippet` to the `web_search` and `fetch_url`
      `registerTool` calls in `src/extensions/web-search.ts`:
      - `web_search`: `"Search the web and return results with title, URL, and snippet"`
      - `fetch_url`: `"Fetch a URL and return its readable text content"`
- [ ] **GREEN** — Run `npx vitest run tests/web-search-snippets.test.ts` → test passes.

---

### 3. Add promptSnippet to all scheduler tools

- [ ] **RED** — Write `tests/scheduler-snippets.test.ts`: import
      `src/extensions/scheduler-tool.ts`, collect all tool definitions via a mock
      `pi.registerTool` spy, and assert that each of `timer`, `heartbeat`,
      `schedule_task`, `list_tasks`, `cancel_task`, `pause_task`, `resume_task`,
      `update_task` has a non-empty `promptSnippet`.
      Run `npx vitest run tests/scheduler-snippets.test.ts` → test fails (no `promptSnippet` present).
- [ ] **ACTION** — Add `promptSnippet` to each of the 8 scheduler `registerTool`
      calls in `src/extensions/scheduler-tool.ts`:
      - `timer`: `"Set a one-shot non-blocking delay that fires a new agent turn"`
      - `heartbeat`: `"Manage a recurring periodic turn trigger"`
      - `schedule_task`: `"Schedule a task by cron, interval, or datetime"`
      - `list_tasks`: `"List all scheduled tasks with status and next run time"`
      - `cancel_task`: `"Cancel and delete a scheduled task by ID"`
      - `pause_task`: `"Pause a scheduled task without deleting it"`
      - `resume_task`: `"Resume a paused task, recomputing its next run"`
      - `update_task`: `"Update a task's prompt, schedule, or context mode"`
- [ ] **GREEN** — Run `npx vitest run tests/scheduler-snippets.test.ts` → test passes.

---

### 4. Verify full test suite passes

- [ ] **RED** — Check: `npx vitest run` currently passes with 0.60.0 and no
      `promptSnippet` changes. Record the baseline pass count.
- [ ] **ACTION** — No code change. This task verifies the previous three tasks
      introduced no regressions.
- [ ] **GREEN** — Run `npx vitest run` → all tests pass, count ≥ baseline.
      Run `npm run build` (if a build step exists) → exits 0.
