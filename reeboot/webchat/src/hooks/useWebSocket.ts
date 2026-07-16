import { useState, useRef, useCallback, useEffect } from 'react';

export type WSStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

export interface WSEvent {
  type: string;
  [key: string]: unknown;
}

export interface UseWebSocketOptions {
  contextId?: string;
  onMessage?: (event: WSEvent) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

export interface UseWebSocketReturn {
  status: WSStatus;
  send: (data: Record<string, unknown>) => void;
  cancel: () => void;
  reconnect: () => void;
}

function getWsUrl(contextId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/chat/${contextId}`;
}

export function useWebSocket({
  contextId = 'main',
  onMessage,
  autoReconnect = true,
  reconnectDelay = 1000,
}: UseWebSocketOptions = {}): UseWebSocketReturn {
  const [status, setStatus] = useState<WSStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectingRef = useRef(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const wsUrl = getWsUrl(contextId);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus('connected');
      reconnectingRef.current = false;
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data: WSEvent = JSON.parse(event.data as string);
        onMessage?.(data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      if (autoReconnect && !reconnectingRef.current) {
        reconnectingRef.current = true;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    };

    wsRef.current = ws;
  }, [contextId, onMessage, autoReconnect, reconnectDelay]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const cancel = useCallback(() => {
    send({ type: 'cancel' });
  }, [send]);

  const reconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    reconnectingRef.current = false;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, send, cancel, reconnect };
}
