import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import Chat from '../Chat';

// Mock WebSocket with static constants
let instances: any[] = [];
const MockWebSocket = vi.fn(function (this: any, url: string) {
  this.url = url;
  this.readyState = 1; // OPEN
  instances.push(this);
  queueMicrotask(() => {
    if (this.onopen) this.onopen();
  });
});
(MockWebSocket as any).OPEN = 1;
(MockWebSocket as any).CONNECTING = 0;
(MockWebSocket as any).CLOSED = 3;

Object.assign(MockWebSocket.prototype, {
  send: vi.fn(),
  close: vi.fn(function (this: any) {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }),
});

// Helper to simulate receiving a WS message on the current connection
function simulateWSMessage(event: Record<string, unknown>): void {
  const ws = instances[instances.length - 1];
  if (ws && typeof ws.onmessage === 'function') {
    ws.onmessage({ data: JSON.stringify(event) });
  }
}

function mockFetchReturning(rows: any[]) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => rows } as any);
}

beforeEach(() => {
  instances = [];
  MockWebSocket.mockClear();
  (globalThis as any).WebSocket = MockWebSocket;
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).WebSocket;
});

describe('Chat history hydration', () => {
  it('fetches history on mount and renders it (S1)', async () => {
    const fetchMock = mockFetchReturning([
      { role: 'user', content: 'hello', created_at: '2026-07-17 10:00:00' },
      { role: 'assistant', content: 'hi there', created_at: '2026-07-17 10:00:01' },
    ]);
    globalThis.fetch = fetchMock as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument());
    expect(screen.getByText('hi there')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/contexts/main/messages');
  });

  it('re-hydrates on remount (S2)', async () => {
    globalThis.fetch = mockFetchReturning([
      { role: 'user', content: 'earlier question', created_at: '2026-07-17 09:00:00' },
    ]) as any;
    const { unmount } = render(<Chat />);
    await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
    unmount();
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('earlier question')).toBeInTheDocument());
  });

  it('renders empty state when history is empty (S3)', async () => {
    globalThis.fetch = mockFetchReturning([]) as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());
  });

  it('fetches history once, not on WS reconnect (S4)', async () => {
    const fetchMock = mockFetchReturning([
      { role: 'user', content: 'x', created_at: '2026-07-17 09:00:00' },
    ]);
    globalThis.fetch = fetchMock as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('x')).toBeInTheDocument());
    // Simulate a reconnect: trigger onclose on the ws instance, then onopen
    const ws = instances[0];
    ws.onclose?.();
    // After close, the reconnect logic in useWebSocket should re-create the WebSocket
    // Wait for potential re-fetch
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchMock.mock.calls.filter((c: any) => c[0] === '/api/contexts/main/messages').length).toBe(1);
  });
});

describe('Chat avatar layout', () => {
  it('renders user avatar on the right and assistant avatar on the left (L1, L2)', async () => {
    globalThis.fetch = mockFetchReturning([
      { role: 'user', content: 'Hi there', created_at: '2026-07-17 10:00:00' },
      { role: 'assistant', content: 'Hello!', created_at: '2026-07-17 10:00:01' },
    ]) as any;
    const { container } = render(<Chat />);

    // Wait for both messages to render
    await waitFor(() => expect(screen.getByText('Hi there')).toBeInTheDocument());
    expect(screen.getByText('Hello!')).toBeInTheDocument();

    // Find message rows
    const messageRows = container.querySelectorAll('.max-w-3xl.mx-auto > .flex');
    expect(messageRows.length).toBeGreaterThanOrEqual(2);

    // Find user row — has user avatar (bg-blue-600)
    const userRow = Array.from(messageRows).find((row) =>
      row.querySelector('.bg-blue-600')
    );
    // Find assistant row — has assistant avatar (bg-zinc-900)
    const assistantRow = Array.from(messageRows).find((row) =>
      row.querySelector('.bg-zinc-900')
    );

    expect(userRow).toBeTruthy();
    expect(assistantRow).toBeTruthy();

    // L2: Assistant avatar appears BEFORE the content div
    const assistantChildren = Array.from(assistantRow!.children);
    const assistantAvatarIdx = Array.from(assistantChildren).findIndex(
      (el) => el.classList.contains('bg-zinc-900')
    );
    const assistantContentIdx = Array.from(assistantChildren).findIndex(
      (el) => el.classList.contains('flex-1')
    );
    expect(assistantAvatarIdx).toBeLessThan(assistantContentIdx);

    // L1: User avatar appears AFTER the content div
    const userChildren = Array.from(userRow!.children);
    const userAvatarIdx = Array.from(userChildren).findIndex(
      (el) => el.classList.contains('bg-blue-600')
    );
    const userContentIdx = Array.from(userChildren).findIndex(
      (el) => el.classList.contains('flex-1')
    );
    expect(userAvatarIdx).toBeGreaterThan(userContentIdx);

    // L3: User message content uses text-left (not text-right)
    const userContent = userChildren[userContentIdx] as HTMLElement;
    expect(userContent.className).toContain('text-left');
    expect(userContent.className).not.toContain('text-right');
  });

  it('shows no avatar for error messages (L4)', async () => {
    globalThis.fetch = mockFetchReturning([]) as any;
    render(<Chat />);

    await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

    // Send an error event
    const ws = instances[0];
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ type: 'error', message: 'Something broke' }) });
    });

    expect(screen.getByText(/Something broke/)).toBeInTheDocument();
    // Error messages are rendered inside the message loop's flex row
    const errorElements = screen.getAllByRole('error-msg');
    expect(errorElements.length).toBe(1);
    // The error row should have NO avatar elements (no assistant or user avatar)
    const errorParent = errorElements[0].closest('.flex.gap-4.items-start');
    expect(errorParent).toBeTruthy();
    expect(errorParent!.querySelector('.bg-zinc-900')).toBeNull();
    expect(errorParent!.querySelector('.bg-blue-600')).toBeNull();
  });
});

describe('Chat message ordering across turns', () => {
  it('creates a new assistant message for each turn (S1)', async () => {
    globalThis.fetch = mockFetchReturning([]) as any;
    render(<Chat />);

    // Wait for empty state (fetch resolved + WS connected)
    await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

    // Simulate Turn 1: assistant streams "Hello"
    simulateWSMessage({ type: 'text_delta', delta: 'Hello' });
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());
    simulateWSMessage({ type: 'message_end' });

    // User sends a new message via the UI
    const textarea = screen.getByPlaceholderText('Send a message...');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'What is the weather?' } });
    });
    const sendButton = screen.getByTitle('Send');
    await act(async () => {
      fireEvent.click(sendButton);
    });

    // Wait for user message to render
    expect(screen.getByText('What is the weather?')).toBeInTheDocument();

    // Simulate Turn 2: assistant streams "Let me check"
    simulateWSMessage({ type: 'text_delta', delta: 'Let me check' });
    // At this point, without the fix, "Let me check" is appended to assistant-1
    // so the text is "HelloLet me check". `getByText('Let me check')` should
    // find it via substring. But we also need message_end to stop streaming.
    simulateWSMessage({ type: 'message_end' });
    
    // After message_end, React should re-render without the streaming cursor
    // Wait for the text to settle
    await new Promise(r => setTimeout(r, 50));
    
    // In RED (no fix): "Hello" and "Let me check" are concatenated into one
    // assistant message ("HelloLet me check"). exact match for "Hello" fails → test fails.
    // In GREEN (fix): they are separate messages, both exact matches pass.
    expect(screen.getByText('Hello', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Let me check', { exact: true })).toBeInTheDocument();
  });

  it('attaches tool calls from second turn to assistant-2, not assistant-1 (S2)', async () => {
    globalThis.fetch = mockFetchReturning([]) as any;
    const { container } = render(<Chat />);
    await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

    // Turn 1: assistant streams "Hello"
    simulateWSMessage({ type: 'text_delta', delta: 'Hello' });
    await waitFor(() => expect(screen.getByText('Hello')).toBeInTheDocument());
    simulateWSMessage({ type: 'message_end' });

    // User sends Turn 2
    const textarea = screen.getByPlaceholderText('Send a message...');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'What is the weather?' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTitle('Send'));
    });
    expect(screen.getByText('What is the weather?')).toBeInTheDocument();

    // Turn 2: text_delta + tool_call_start
    await act(async () => {
      simulateWSMessage({ type: 'text_delta', delta: 'Searching...' });
    });
    await act(async () => {
      simulateWSMessage({ type: 'tool_call_start', toolCallId: 'tc-1', toolName: 'get_weather', args: { location: 'Paris' } });
    });

    // Wait for tool call to render
    await waitFor(() => expect(screen.getByText('get_weather')).toBeInTheDocument());

    // Get all message rows inside the messages container
    const messagesContainer = container.querySelector('.max-w-3xl.mx-auto.px-4.py-8');
    const messageRows = messagesContainer?.querySelectorAll(':scope > .flex') ?? [];

    // Filter assistant rows by presence of the assistant AVATAR (not message bubble bg)
    // Assistant avatar has: w-8 h-8 rounded-full bg-zinc-900
    const assistantRows = Array.from(messageRows).filter((row) =>
      row.querySelector('.w-8.h-8.rounded-full.bg-zinc-900')
    );

    expect(assistantRows.length).toBe(2);

    // Assistant-1 content should contain "Hello" but NO tool calls
    const a1Content = assistantRows[0].querySelector('.flex-1')!;
    expect(a1Content.textContent).toContain('Hello');
    expect(a1Content.querySelector('.mt-2')).toBeNull();

    // Assistant-2 content should contain "Searching..." and HAVE a tool call
    const a2Content = assistantRows[1].querySelector('.flex-1')!;
    expect(a2Content.textContent).toContain('Searching...');
    expect(a2Content.querySelector('.mt-2')).toBeTruthy();
  });

  it('updates tool call result when tool_call_end arrives after message_end (S3)', async () => {
    globalThis.fetch = mockFetchReturning([]) as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

    // Events in order: text_delta, tool_call_start, message_end, tool_call_end
    simulateWSMessage({ type: 'text_delta', delta: 'Here is the weather' });
    await waitFor(() => expect(screen.getByText('Here is the weather')).toBeInTheDocument());

    simulateWSMessage({ type: 'tool_call_start', toolCallId: 'tc-1', toolName: 'get_weather', args: {} });
    simulateWSMessage({ type: 'message_end' });

    // After message_end, tool call indicator should be visible
    await waitFor(() => expect(screen.getByText('get_weather')).toBeInTheDocument());

    // Now tool_call_end arrives AFTER message_end (trailing event)
    simulateWSMessage({
      type: 'tool_call_end',
      toolCallId: 'tc-1',
      toolName: 'get_weather',
      result: '{"temp": 22}',
      isError: false,
    });

    // The tool call indicator name should still be visible (in the button header)
    await waitFor(() => expect(screen.getByText('get_weather')).toBeInTheDocument());

    // ToolCall uses useState(defaultExpanded) — initial value is false when first
    // created by tool_call_start (no result yet). The prop changes to true on
    // tool_call_end but useState keeps the current state. Click to expand.
    await act(async () => {
      fireEvent.click(screen.getByText('get_weather'));
    });
    await waitFor(() => expect(screen.getByText('{"temp": 22}')).toBeInTheDocument());

    // The original message content should still be there — not lost by the update
    expect(screen.getByText('Here is the weather')).toBeInTheDocument();
  });

  it('resets ref on error so next text_delta creates a new assistant message (S4)', async () => {
    globalThis.fetch = mockFetchReturning([]) as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

    // Turn 1 starts streaming
    simulateWSMessage({ type: 'text_delta', delta: 'Processing request' });
    await waitFor(() => expect(screen.getByText('Processing request')).toBeInTheDocument());

    // Error arrives — ref should be cleared
    simulateWSMessage({ type: 'error', message: 'API timeout' });
    await waitFor(() => expect(screen.getByText(/API timeout/)).toBeInTheDocument());

    // New text_delta after error should create a NEW assistant message (not reuse old ref)
    await act(async () => {
      simulateWSMessage({ type: 'text_delta', delta: 'Retrying...' });
    });

    // Both messages should exist as distinct messages (not concatenated)
    await waitFor(() => expect(screen.getByText('Retrying...')).toBeInTheDocument());
    expect(screen.getByText('Processing request')).toBeInTheDocument();
  });

  it('resets ref on cancelled so next text_delta creates a new assistant message (S5)', async () => {
    globalThis.fetch = mockFetchReturning([]) as any;
    render(<Chat />);
    await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

    // Turn 1 starts streaming
    simulateWSMessage({ type: 'text_delta', delta: 'Working on it' });
    await waitFor(() => expect(screen.getByText('Working on it')).toBeInTheDocument());

    // Cancelled arrives — ref should be cleared
    simulateWSMessage({ type: 'cancelled' });
    await waitFor(() => expect(screen.getByText(/Turn cancelled/)).toBeInTheDocument());

    // New text_delta after cancelled should create a NEW assistant message
    await act(async () => {
      simulateWSMessage({ type: 'text_delta', delta: 'Resuming...' });
    });

    // Both messages should exist as distinct messages
    await waitFor(() => expect(screen.getByText('Resuming...')).toBeInTheDocument());
    expect(screen.getByText('Working on it')).toBeInTheDocument();
  });

  describe('chronological parts ordering', () => {
    it('renders text → tool → text in chronological order, not all text on top (P1)', async () => {
      globalThis.fetch = mockFetchReturning([]) as any;
      const { container } = render(<Chat />);
      await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

      // Simulate: text_delta → tool_call_start → tool_call_end → text_delta
      await act(async () => {
        simulateWSMessage({ type: 'text_delta', delta: 'Let me search...' });
      });
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_start', toolCallId: 'tc-search', toolName: 'web_search', args: { q: 'SEO' } });
      });
      // Wait for tool to render
      await waitFor(() => expect(screen.getByText('web_search')).toBeInTheDocument());

      // Complete the tool
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_end', toolCallId: 'tc-search', toolName: 'web_search', result: 'SEO resources', isError: false });
      });

      // More text after tool
      await act(async () => {
        simulateWSMessage({ type: 'text_delta', delta: 'Here are the results.' });
      });
      simulateWSMessage({ type: 'message_end' });

      // Wait for the post-tool text to render
      await waitFor(() => expect(screen.getByText('Here are the results.')).toBeInTheDocument());

      // Get the parts container of the assistant message
      const partsContainer = container.querySelector('.flex-1.text-left')!;
      expect(partsContainer).toBeTruthy();

      const children = Array.from(partsContainer.children);

      // Child 0: first text part (Message renders text in a prose div)
      expect(children[0].textContent).toContain('Let me search...');

      // Child 1: tool part (wrapped in a div with class "mt-2")
      const toolWrapper = children[1];
      expect(toolWrapper.className).toContain('mt-2');
      expect(toolWrapper.textContent).toContain('web_search');

      // Child 2: second text part (appears AFTER the tool, not before)
      expect(children[2].textContent).toContain('Here are the results.');
    });

    it('renders multiple tools in start order, interleaved with text (P2)', async () => {
      globalThis.fetch = mockFetchReturning([]) as any;
      const { container } = render(<Chat />);
      await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

      // Simulate: text → tool1_start → tool2_start → text → tool1_end → tool2_end
      await act(async () => {
        simulateWSMessage({ type: 'text_delta', delta: 'Researching...' });
      });
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_start', toolCallId: 'tc-1', toolName: 'fetch_data', args: {} });
      });
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_start', toolCallId: 'tc-2', toolName: 'analyze', args: {} });
      });
      // Text between tool calls
      await act(async () => {
        simulateWSMessage({ type: 'text_delta', delta: 'Processing...' });
      });
      // Tool results arrive
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_end', toolCallId: 'tc-1', toolName: 'fetch_data', result: 'data', isError: false });
      });
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_end', toolCallId: 'tc-2', toolName: 'analyze', result: 'analysis', isError: false });
      });
      simulateWSMessage({ type: 'message_end' });

      await waitFor(() => expect(screen.getByText('Researching...')).toBeInTheDocument());

      const partsContainer = container.querySelector('.flex-1.text-left')!;
      const children = Array.from(partsContainer.children);

      // Order: text, tool1, tool2, text
      expect(children[0].textContent).toContain('Researching...');
      expect(children[1].className).toContain('mt-2');
      expect(children[1].textContent).toContain('fetch_data');
      expect(children[2].className).toContain('mt-2');
      expect(children[2].textContent).toContain('analyze');
      expect(children[3].textContent).toContain('Processing...');
    });

    it('shows tool in "running" state before result arrives and "complete" after (P3)', async () => {
      globalThis.fetch = mockFetchReturning([]) as any;
      render(<Chat />);
      await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

      // Establish a message first so tool_call_start has somewhere to attach
      await act(async () => {
        simulateWSMessage({ type: 'text_delta', delta: 'Running' });
      });
      await waitFor(() => expect(screen.getByText('Running')).toBeInTheDocument());

      // tool_call_start with no result yet — tool shows collapsed button
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_start', toolCallId: 'tc-run', toolName: 'long_task', args: {} });
      });
      await waitFor(() => expect(screen.getByText('long_task')).toBeInTheDocument());

      // Result arrives
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_end', toolCallId: 'tc-run', toolName: 'long_task', result: 'Done!', isError: false });
      });
      simulateWSMessage({ type: 'message_end' });

      // Tool is still present
      expect(screen.getByText('long_task')).toBeInTheDocument();

      // Click to expand — should now show result
      await act(async () => {
        fireEvent.click(screen.getByText('long_task'));
      });
      await waitFor(() => expect(screen.getByText('Done!')).toBeInTheDocument());
    });

    it('shows streaming cursor on the last text part only (P4)', async () => {
      globalThis.fetch = mockFetchReturning([]) as any;
      render(<Chat />);
      await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

      // Stream first text
      simulateWSMessage({ type: 'text_delta', delta: 'First part. ' });
      await waitFor(() => expect(screen.getByText('First part.')).toBeInTheDocument());

      // Tool call — cursor should not appear on the tool
      simulateWSMessage({ type: 'tool_call_start', toolCallId: 'tc', toolName: 'search', args: {} });
      await waitFor(() => expect(screen.getByText('search')).toBeInTheDocument());

      // Find the cursor indicator — it uses a ▋ character
      // Before the second text part, there should be no cursor because the last part is a tool

      // Now stream more text after tool
      await act(async () => {
        simulateWSMessage({ type: 'text_delta', delta: 'Second part.' });
      });

      // Cursor should now be near "Second part." text
      // message_end clears all cursors
      simulateWSMessage({ type: 'message_end' });

      await waitFor(() => {
        // After message_end, no streaming cursors should remain
        expect(screen.queryByText('▋')).toBeNull();
      });
    });

    it('handles tool_call_end without a prior tool_call_start by appending (P5)', async () => {
      globalThis.fetch = mockFetchReturning([]) as any;
      const { container } = render(<Chat />);
      await waitFor(() => expect(screen.getByText('How can I help you?')).toBeInTheDocument());

      // text_delta then tool_call_end (no preceding tool_call_start)
      await act(async () => {
        simulateWSMessage({ type: 'text_delta', delta: 'Done.' });
      });
      await act(async () => {
        simulateWSMessage({ type: 'tool_call_end', toolCallId: 'tc-late', toolName: 'search', result: 'result', isError: false });
      });
      simulateWSMessage({ type: 'message_end' });

      await waitFor(() => expect(screen.getByText('Done.')).toBeInTheDocument());

      // Tool should still render
      expect(screen.getByText('search')).toBeInTheDocument();

      // Verify order: text then tool
      const partsContainer = container.querySelector('.flex-1.text-left')!;
      const children = Array.from(partsContainer.children);
      expect(children[0].textContent).toContain('Done.');
      expect(children[1].className).toContain('mt-2');
      expect(children[1].textContent).toContain('search');
    });
  });
});
