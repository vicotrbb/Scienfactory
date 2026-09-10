import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';
import type { ServerEvent } from '../shared/protocol';

test('WebSocket authentication, origin validation, replay deduplication, and artifact ownership', async () => {
  const Socket = WebSocket as unknown as {
    new (url: string, options: Bun.WebSocketOptions): WebSocket;
  };
  const root = mkdtempSync(join(tmpdir(), 'scienfactory-transport-'));
  const port = 4329;
  const runtime = createApp({
    root,
    port,
    keys: { openai: 'test-key', anthropic: '' },
    lab: {
      capabilities: async () => ({ docker: false, image: false, detail: 'test' }),
      execute: async () => {
        throw new Error('not used');
      },
    },
  });
  runtime.app.listen({ port, hostname: '127.0.0.1' });
  const base = `http://127.0.0.1:${port}`;
  let ws: WebSocket | undefined;
  try {
    expect(
      (await fetch(base + '/api/session', { headers: { Origin: 'https://evil.example' } })).status,
    ).toBe(403);
    expect(
      (await fetch(base + '/api/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status,
    ).toBe(403);
    expect((await fetch(base + '/api/health', { headers: { Host: 'evil.example' } })).status).toBe(
      403,
    );
    const unauthenticated = await new Promise<boolean>((resolve) => {
      const socket = new Socket(`ws://127.0.0.1:${port}/api/ws`, { headers: { Origin: base } });
      socket.onopen = () => {
        socket.close();
        resolve(false);
      };
      socket.onerror = () => resolve(true);
    });
    expect(unauthenticated).toBe(true);
    const response = await fetch(base + '/api/session');
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    const inbox = new Map<string, (event: Extract<ServerEvent, { type: 'reply' }>) => void>();
    ws = new Socket(`ws://127.0.0.1:${port}/api/ws`, { headers: { Origin: base, Cookie: cookie } });
    await new Promise<void>((resolve, reject) => {
      ws!.onopen = () => resolve();
      ws!.onerror = () => reject(new Error('socket failed'));
    });
    ws.onmessage = (e) => {
      const event = JSON.parse(String(e.data)) as ServerEvent;
      if (event.type === 'reply') inbox.get(event.requestId)?.(event);
    };
    const call = (command: object, requestId: string = crypto.randomUUID()) =>
      new Promise<Extract<ServerEvent, { type: 'reply' }>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No reply')), 3000);
        inbox.set(requestId, (event) => {
          clearTimeout(timer);
          inbox.delete(requestId);
          resolve(event);
        });
        ws!.send(JSON.stringify({ ...command, requestId }));
      });
    const first = await call({ type: 'research.create', title: 'Exactly once' }, 'repeat');
    const second = await call({ type: 'research.create', title: 'Exactly once' }, 'repeat');
    expect(first).toEqual(second);
    expect(runtime.store.researches()).toHaveLength(1);
    const id = (first.data as { id: string }).id;
    const other = runtime.store.create('Other');
    const artifact = await runtime.store.artifact(
      id,
      'test.txt',
      'text/plain',
      Buffer.from('secret evidence'),
      'test',
    );
    expect(
      (await call({ type: 'artifact.read', researchId: other.id, artifactId: artifact.id })).ok,
    ).toBe(false);
    expect((await call({ type: 'chat.send', researchId: id, text: '' })).ok).toBe(false);
    const sync = await call({ type: 'sync' });
    expect(JSON.stringify(sync)).not.toContain('test-key');
  } finally {
    ws?.close();
    await runtime.app.stop(true);
    runtime.close();
    rmSync(root, { recursive: true, force: true });
  }
});
