import { useEffect, useRef, useState } from 'react';
import type { Bootstrap, CommandInput, ServerEvent, Snapshot } from '../shared/protocol';
import { applySnapshotPatch } from '../shared/state';

export type Send = <T = unknown>(command: CommandInput) => Promise<T>;
export function useConnection() {
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [streams, setStreams] = useState<
    Record<string, { text: string; agentId: string; researchId: string; createdAt: number }>
  >({});
  const socket = useRef<WebSocket | null>(null);
  const current = useRef<string | null>(
    new URLSearchParams(location.search).get('research') ??
      localStorage.getItem('scienfactory.research'),
  );
  const pending = useRef(
    new Map<
      string,
      {
        resolve: (data: unknown) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const send: Send = <T>(command: CommandInput) =>
    new Promise<T>((resolve, reject) => {
      if (socket.current?.readyState !== WebSocket.OPEN) {
        reject(new Error('Connection is offline. Please wait for reconnection.'));
        return;
      }
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.current.delete(requestId);
        reject(
          new Error('Request timed out. Reconnect to inspect the latest state before retrying.'),
        );
      }, 30000);
      pending.current.set(requestId, { resolve: (data) => resolve(data as T), reject, timer });
      socket.current.send(JSON.stringify({ ...command, requestId }));
    });
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const connect = async () => {
      try {
        const session = await fetch('/api/session', { credentials: 'same-origin' });
        if (!session.ok) throw new Error('Session unavailable');
        if (disposed) return;
        const ws = new WebSocket(
          `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`,
        );
        socket.current = ws;
        ws.onopen = () => {
          attempts = 0;
          setStatus('connecting');
          if (current.current)
            void send({ type: 'research.open', researchId: current.current }).catch(() => {
              current.current = null;
              setSnapshot(undefined);
            });
        };
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data) as ServerEvent;
          if (message.type === 'reply') {
            const p = pending.current.get(message.requestId);
            if (p) {
              clearTimeout(p.timer);
              pending.current.delete(message.requestId);
              message.ok
                ? p.resolve(message.data)
                : p.reject(new Error(message.error ?? 'Request failed.'));
            }
          }
          if (message.type === 'bootstrap') {
            setBootstrap(message.data);
            setStatus('online');
          }
          if (message.type === 'snapshot' && message.data.research.id === current.current) {
            setSnapshot(message.data);
            setStreams((previous) => {
              const next = { ...previous };
              for (const item of message.data.messages)
                if (item.role === 'assistant' && item.agentId && !next[item.id])
                  next[item.id] = {
                    text: item.text,
                    agentId: item.agentId,
                    researchId: item.researchId,
                    createdAt: item.createdAt,
                  };
              return next;
            });
          }
          if (message.type === 'patch' && message.data.researchId === current.current) {
            setSnapshot((previous) =>
              previous ? applySnapshotPatch(previous, message.data) : previous,
            );
          }
          if (message.type === 'delta' && message.researchId === current.current)
            setStreams((previous) => ({
              ...previous,
              [message.messageId]: {
                text: (previous[message.messageId]?.text ?? '') + message.text,
                agentId: message.agentId,
                researchId: message.researchId,
                createdAt: previous[message.messageId]?.createdAt ?? Date.now(),
              },
            }));
          if (message.type === 'activity')
            setSnapshot((previous) =>
              previous?.research.id === message.data.researchId
                ? {
                    ...previous,
                    activity: [
                      ...previous.activity.filter((a) => a.id !== message.data.id),
                      message.data,
                    ].slice(-500),
                  }
                : previous,
            );
        };
        ws.onclose = () => {
          if (disposed) return;
          setStatus('offline');
          setStreams({});
          for (const p of pending.current.values()) {
            clearTimeout(p.timer);
            p.reject(
              new Error(
                'Connection interrupted. Work may still be running; the workspace will resync.',
              ),
            );
          }
          pending.current.clear();
          retry = setTimeout(connect, Math.min(500 * 2 ** attempts++, 5000));
        };
        ws.onerror = () => ws.close();
      } catch {
        if (!disposed) {
          setStatus('offline');
          retry = setTimeout(connect, 2000);
        }
      }
    };
    void connect();
    const heartbeat = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN)
        void send({ type: 'ping' }).catch(() => {});
    }, 20000);
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      socket.current?.close();
      for (const p of pending.current.values()) clearTimeout(p.timer);
    };
  }, []);
  async function open(id: string) {
    current.current = id;
    localStorage.setItem('scienfactory.research', id);
    const url = new URL(location.href);
    url.searchParams.set('research', id);
    history.replaceState(null, '', url);
    setStreams({});
    const data = await send<Snapshot>({ type: 'research.open', researchId: id });
    if (current.current === id) setSnapshot(data);
  }
  function clear() {
    current.current = null;
    localStorage.removeItem('scienfactory.research');
    const url = new URL(location.href);
    url.searchParams.delete('research');
    history.replaceState(null, '', url);
    setSnapshot(undefined);
    setStreams({});
  }
  return { bootstrap, snapshot, status, streams, send, open, clear };
}
