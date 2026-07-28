import { useState, useRef, useEffect, useCallback } from 'react';
import Message from '../components/Message';
import ToolCall from '../components/ToolCall';
import { useWebSocket, type WSEvent } from '../hooks/useWebSocket';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
  streaming?: boolean;
  toolCalls?: ToolCallData[];
}

interface ToolCallData {
  toolCallId: string;
  name: string;
  args?: unknown;
  result?: string;
  isError?: boolean;
  view?: { type: string; [key: string]: unknown };
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentAssistantIdRef = useRef<string | null>(null);

  // Track which messages are streaming
  const streamingMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Hydrate transcript from persisted history on mount only
  useEffect(() => {
    let cancelled = false;
    fetch('/api/contexts/main/messages')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ role: string; content: string; created_at: string }>) => {
        if (cancelled) return;
        setMessages(rows.map((row, i) => ({
          id: `hist-${i}`,
          role: (row.role === 'user' || row.role === 'assistant' || row.role === 'error')
            ? row.role : 'assistant',
          content: row.content,
          timestamp: Date.parse(row.created_at) || Date.now(),
        })));
      })
      .catch(() => { /* leave transcript empty on error */ });
    return () => { cancelled = true; };
  }, []); // mount only — do NOT depend on WS status (avoids refetch on reconnect)

  const handleWSMessage = useCallback((event: WSEvent) => {
    switch (event.type) {
      case 'text_delta': {
        const content = (event.delta as string) ?? '';
        let targetMsgId = currentAssistantIdRef.current;

        if (!targetMsgId) {
          // No current assistant message, create a new one
          const id = `assistant-${Date.now()}`;
          currentAssistantIdRef.current = id;
          streamingMessageIdRef.current = id;
          setMessages((prev) => [
            ...prev,
            { id, role: 'assistant', content, timestamp: Date.now(), streaming: true, toolCalls: [] },
          ]);
        } else {
          // Update the current assistant message
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === targetMsgId
                ? { ...msg, content: msg.content + content, streaming: true }
                : msg
            )
          );
        }
        break;
      }
      case 'tool_call_start': {
        const toolCallId = (event.toolCallId as string) ?? `tool-${Date.now()}`;
        const name = (event.toolName as string) ?? 'unknown';
        const args = event.args ?? undefined;
        setMessages((prev) => {
          // Find target: current assistant message, or fall back to last assistant message
          let targetId = currentAssistantIdRef.current;
          if (!targetId) {
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === 'assistant') { targetId = prev[i].id; break; }
            }
          }
          if (!targetId) return prev;
          return prev.map((msg) =>
            msg.id === targetId
              ? { ...msg, toolCalls: [...(msg.toolCalls ?? []), { toolCallId, name, args }] }
              : msg
          );
        });
        break;
      }
      case 'tool_call_end': {
        const toolCallId = (event.toolCallId as string) ?? '';
        let result: string | undefined;
        if (typeof event.result === 'string') {
          result = event.result;
        } else if (event.result && typeof event.result === 'object') {
          // Pi sends result as { content: [{ type: 'text', text: '...' }] }
          const content = (event.result as any).content;
          if (Array.isArray(content)) {
            const textParts = content.filter((c: any) => c.type === 'text').map((c: any) => c.text ?? '');
            result = textParts.join('\n') || undefined;
          } else {
            result = String(event.result);
          }
        }
        const isError = (event.isError as boolean) ?? false;
        const toolName = (event.toolName as string) ?? 'unknown';
        const toolView = event.view as { type: string; [key: string]: unknown } | undefined;
        setMessages((prev) => {
          // Find target: current assistant message, or fall back to last assistant message
          let targetId = currentAssistantIdRef.current;
          if (!targetId) {
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === 'assistant') { targetId = prev[i].id; break; }
            }
          }
          if (!targetId) return prev;
          return prev.map((msg) => {
            if (msg.id !== targetId) return msg;
            const existing = (msg.toolCalls ?? []).find((tc) => tc.toolCallId === toolCallId);
            if (existing) {
              // Update existing tool call from tool_call_start
              return { ...msg, toolCalls: (msg.toolCalls ?? []).map((tc) => tc.toolCallId === toolCallId ? { ...tc, result, isError, view: toolView ?? tc.view } : tc) };
            }
            // No matching tool_call_start — create entry from tool_call_end alone
            return { ...msg, toolCalls: [...(msg.toolCalls ?? []), { toolCallId, name: toolName, result, isError, view: toolView }] };
          });
        });
        break;
      }
      case 'message_end': {
        // Don't clear currentAssistantIdRef here — tool_call events may arrive after message_end
        // Clear streaming state for ALL messages when message_end arrives
        setMessages((prev) =>
          prev.map((msg) => ({ ...msg, streaming: false }))
        );
        streamingMessageIdRef.current = null;
        setIsProcessing(false);
        break;
      }
      case 'error': {
        const errorMsg = (event.message as string) ?? 'Unknown error';
        setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: 'error', content: `⚠ ${errorMsg}`, timestamp: Date.now() }]);
        setIsProcessing(false);
        currentAssistantIdRef.current = null;
        break;
      }
      case 'cancelled': {
        setMessages((prev) => [...prev, { id: `cancel-${Date.now()}`, role: 'error', content: '⚠ Turn cancelled.', timestamp: Date.now() }]);
        setIsProcessing(false);
        currentAssistantIdRef.current = null;
        break;
      }
    }
  }, []);

  const { status, send, cancel } = useWebSocket({ contextId: 'main', onMessage: handleWSMessage });

  const handleSend = useCallback(() => {
    if (!input.trim() || isProcessing || status !== 'connected') return;
    // Clear streaming state on all messages before sending new message
    setMessages((prev) => prev.map((msg) => msg.streaming ? { ...msg, streaming: false } : msg));
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: input.trim(), timestamp: Date.now() }]);
    setInput('');
    setIsProcessing(true);
    // Clear the current assistant ref so the next turn creates a fresh message,
    // rather than appending streaming events to the previous turn's message.
    currentAssistantIdRef.current = null;
    send({ type: 'message', content: input.trim() });
  }, [input, isProcessing, status, send]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const canSend = input.trim() && status === 'connected' && !isProcessing;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Connection status bar */}
      <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs border-b ${
        status === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : status === 'connecting' ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
        : 'border-red-200 bg-red-50 text-red-700'
      }`}>
        <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
        {status === 'connected' ? 'Connected'
         : status === 'connecting' ? 'Connecting…'
         : '⚠ Connection lost. Retrying…'}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 mb-2">How can I help you?</h2>
              <p className="text-zinc-500 text-sm max-w-sm">
                I can help with scheduling, research, file management, and more.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex gap-4 items-start">
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fafafa" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 text-left">
                  <Message
                    role={msg.role}
                    content={msg.content}
                    streaming={msg.streaming}
                  />
                  {msg.toolCalls?.map((tc) => (
                    <div key={tc.toolCallId} className="mt-2">
                      <ToolCall
                        name={tc.name}
                        args={tc.args}
                        result={tc.result}
                        isError={tc.isError}
                        defaultExpanded={!!tc.result}
                        view={tc.view}
                      />
                    </div>
                  ))}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="relative flex items-end gap-2 bg-zinc-50 border border-zinc-200 rounded-xl focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-300 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              disabled={status !== 'connected'}
              rows={1}
              className="flex-1 resize-none bg-transparent text-zinc-900 placeholder-zinc-400 px-4 py-3 text-[15px] focus:outline-none disabled:opacity-50 max-h-[160px]"
            />
            <div className="flex items-center gap-1 pr-2 pb-2">
              {isProcessing ? (
                <button onClick={() => cancel()} className="p-2 rounded-lg bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-colors" title="Cancel">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              ) : (
                <button onClick={handleSend} disabled={!canSend} className="p-2 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Send">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-zinc-400 mt-2">
            Reeboot can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
