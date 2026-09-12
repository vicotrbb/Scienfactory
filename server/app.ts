import { Elysia } from 'elysia';
import { accessPolicy } from './network';
import { staticPlugin } from '@elysiajs/static';
import {
  Command,
  Settings,
  defaultLimits,
  type Bootstrap,
  type ProviderName,
  type ServerEvent,
  type Snapshot,
} from '../shared/protocol';
import { Store } from './store';
import { DockerLab, type Lab } from './lab';
import { ResearchEngine } from './engine';
import { publicError, type ProviderFactory } from './providers';
import { executeTool } from './toolkit';
import { join } from 'node:path';
import { ModelDirectory } from './models';
import { snapshotPatch } from '../shared/state';

export interface AppOptions {
  root: string;
  publicOrigin?: string;
  port?: number;
  lab?: Lab;
  provider?: ProviderFactory;
  keys?: Partial<Record<ProviderName, string>>;
  production?: boolean;
  models?: Pick<ModelDirectory, 'list' | 'clear'>;
}
export function createApp(options: AppOptions) {
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  const { origins: allowedOrigins, validHost } = accessPolicy(
    options.port ?? 4310,
    !!options.production,
    publicOrigin,
  );
  const store = new Store(options.root);
  const lab = options.lab ?? new DockerLab();
  const models = options.models ?? new ModelDirectory();
  const keys: Record<ProviderName, string> = {
    openai: options.keys?.openai ?? process.env.OPENAI_API_KEY ?? '',
    anthropic: options.keys?.anthropic ?? process.env.ANTHROPIC_API_KEY ?? '',
  };
  let settings = store.config() ?? {
    provider: 'openai' as const,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
    limits: defaultLimits,
  };
  const session = crypto.randomUUID() + crypto.randomUUID();
  const cookieName = `scienfactory_session_${publicOrigin ? new URL(publicOrigin).port : (options.port ?? 4310)}`;
  const clients = new Map<string, { send: (data: ServerEvent) => unknown; researchId?: string }>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastSnapshots = new Map<string, Snapshot>();
  const manual = new Map<string, AbortController>();
  const inFlight = new Set<string>();
  function emit(event: ServerEvent) {
    for (const client of clients.values()) {
      const id =
        event.type === 'delta'
          ? event.researchId
          : event.type === 'patch'
            ? event.data.researchId
            : event.type === 'activity'
              ? event.data.researchId
              : event.type === 'snapshot'
                ? event.data.research.id
                : undefined;
      if (!id || client.researchId === id) client.send(event);
    }
  }
  let health: ReturnType<Lab['capabilities']> | undefined;
  let healthAt = 0;
  async function bootstrap(): Promise<Bootstrap> {
    if (!health || Date.now() - healthAt > 5000) {
      health = lab.capabilities();
      healthAt = Date.now();
    }
    return {
      researches: store.researches(),
      settings,
      credentials: { openai: !!keys.openai, anthropic: !!keys.anthropic },
      capabilities: await health,
    };
  }
  const changed = (id: string) => {
    if (timers.has(id)) return;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        if (store.get('research', id)) {
          const next = store.snapshot(id);
          const previous = lastSnapshots.get(id);
          if (previous) {
            const patch = snapshotPatch(previous, next);
            if (Object.keys(patch.changes).length) emit({ type: 'patch', data: patch });
          } else emit({ type: 'snapshot', data: next });
          lastSnapshots.set(id, next);
          if (lastSnapshots.size > 8) lastSnapshots.delete(lastSnapshots.keys().next().value!);
        }
        void bootstrap().then((data) => emit({ type: 'bootstrap', data }));
      }, 80),
    );
  };
  const engine = new ResearchEngine(store, lab, emit, changed, options.provider);
  function busy(id: string) {
    return engine.busy(id) || manual.has(id);
  }
  const authenticated = (request: Request) =>
    request.headers
      .get('cookie')
      ?.split(';')
      .some((c) => c.trim() === `${cookieName}=${session}`) ?? false;
  const app = new Elysia({
    websocket: {
      maxPayloadLength: 13 * 1024 * 1024,
      idleTimeout: 60,
      backpressureLimit: 16 * 1024 * 1024,
      closeOnBackpressureLimit: true,
    },
  })
    .onRequest(({ request, set }) => {
      if (!validHost(request)) {
        set.status = 403;
        return 'Invalid host';
      }
      set.headers['X-Content-Type-Options'] = 'nosniff';
      set.headers['Referrer-Policy'] = 'no-referrer';
      set.headers['X-Frame-Options'] = 'DENY';
      const origin = request.headers.get('origin');
      if (origin && !allowedOrigins.has(origin)) {
        set.status = 403;
        return 'Origin not allowed';
      }
    })
    .get('/api/health', () => ({ status: 'ok', application: 'Scienfactory' }))
    .get('/api/session', ({ request, set }) => {
      if (request.headers.get('sec-fetch-site') === 'cross-site') {
        set.status = 403;
        return { error: 'Cross-site request rejected' };
      }
      set.headers['Set-Cookie'] =
        `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`;
      set.headers['Cache-Control'] = 'no-store';
      return { ok: true };
    })
    .ws('/api/ws', {
      beforeHandle({ request, set }) {
        if (!authenticated(request) || !allowedOrigins.has(request.headers.get('origin') ?? '')) {
          set.status = 403;
          return 'Unauthorized';
        }
      },
      open(ws) {
        clients.set(ws.id, { send: (event) => ws.send(event) });
        void bootstrap().then((data) => ws.send({ type: 'bootstrap', data }));
      },
      close(ws) {
        clients.delete(ws.id);
      },
      async message(ws, raw) {
        const parsed = Command.safeParse(raw);
        if (!parsed.success) {
          ws.send({
            type: 'reply',
            requestId:
              typeof raw === 'object' && raw && 'requestId' in raw
                ? String(raw.requestId)
                : 'invalid',
            ok: false,
            error: 'Invalid command.',
          });
          return;
        }
        const command = parsed.data;
        const mutating = ![
          'sync',
          'ping',
          'research.open',
          'artifact.read',
          'research.export',
          'models.list',
        ].includes(command.type);
        if (mutating && inFlight.has(command.requestId)) return;
        const remembered = mutating ? store.reply(command.requestId) : undefined;
        if (remembered) {
          ws.send(remembered);
          return;
        }
        inFlight.add(command.requestId);
        try {
          let data: unknown;
          switch (command.type) {
            case 'models.list':
              data = await models.list(command.provider, keys[command.provider], command.refresh);
              break;
            case 'ping':
              data = { pong: true };
              break;
            case 'sync':
              data = await bootstrap();
              break;
            case 'research.create':
              data = store.create(command.title);
              emit({ type: 'bootstrap', data: await bootstrap() });
              break;
            case 'research.open': {
              data = store.snapshot(command.researchId);
              const client = clients.get(ws.id);
              if (client) client.researchId = command.researchId;
              ws.send({ type: 'snapshot', data });
              break;
            }
            case 'research.rename':
              data = store.updateResearch(command.researchId, { title: command.title });
              changed(command.researchId);
              break;
            case 'research.delete': {
              if (busy(command.researchId))
                throw new Error('Stop this research before deleting it.');
              store.delete(command.researchId);
              lastSnapshots.delete(command.researchId);
              data = { deleted: true };
              emit({ type: 'bootstrap', data: await bootstrap() });
              break;
            }
            case 'settings.update': {
              if (command.apiKey) {
                keys[command.settings.provider] = command.apiKey;
                models.clear(command.settings.provider);
              }
              settings = Settings.parse(command.settings);
              store.saveConfig(settings);
              data = await bootstrap();
              emit({ type: 'bootstrap', data: data as Bootstrap });
              break;
            }
            case 'key.clear':
              keys[command.provider] = '';
              models.clear(command.provider);
              data = await bootstrap();
              emit({ type: 'bootstrap', data: data as Bootstrap });
              break;
            case 'chat.send': {
              if (busy(command.researchId))
                throw new Error('Research is running. Stop it before sending a new request.');
              data = engine.start(
                command.researchId,
                command.text,
                settings,
                keys[settings.provider],
                command.artifactIds,
              );
              break;
            }
            case 'run.cancel':
              engine.cancel(command.researchId);
              manual.get(command.researchId)?.abort(new Error('Stopped by user.'));
              data = { stopping: true };
              break;
            case 'artifact.read':
              data = await store.readArtifact(command.researchId, command.artifactId);
              break;
            case 'artifact.write':
              data = await store.artifact(
                command.researchId,
                command.name,
                command.mime,
                Buffer.from(command.content),
                'User-authored file',
              );
              changed(command.researchId);
              break;
            case 'artifact.upload': {
              if (!/^[A-Za-z0-9+/]*={0,2}$/.test(command.data))
                throw new Error('Invalid file encoding.');
              data = await store.artifact(
                command.researchId,
                command.name,
                command.mime,
                Buffer.from(command.data, 'base64'),
                'Uploaded by user; untrusted input',
              );
              changed(command.researchId);
              break;
            }
            case 'artifact.inspect':
            case 'artifact.compile':
            case 'lab.run': {
              store.requireResearch(command.researchId);
              if (busy(command.researchId))
                throw new Error(
                  'Wait for this research to finish or stop it before using the lab.',
                );
              const controller = new AbortController();
              manual.set(command.researchId, controller);
              store.updateResearch(command.researchId, { status: 'running' });
              changed(command.researchId);
              void executeTool(
                command.type === 'artifact.compile'
                  ? 'compile_latex'
                  : command.type === 'artifact.inspect'
                    ? 'inspect_file'
                    : 'execute',
                command.type === 'artifact.compile'
                  ? {
                      sourceArtifactId: command.sourceArtifactId,
                      inputArtifactIds: command.inputArtifactIds,
                    }
                  : command.type === 'artifact.inspect'
                    ? { artifactId: command.artifactId, view: false }
                    : { language: command.language, code: command.code, inputArtifactIds: [] },
                {
                  store,
                  lab,
                  researchId: command.researchId,
                  agentId: 'manual',
                  signal: controller.signal,
                  changed: () => changed(command.researchId),
                  log: (type, text) =>
                    emit({
                      type: 'activity',
                      data: store.activity(command.researchId, type, text),
                    }),
                  delegate: async () => {
                    throw new Error('Not available in manual execution.');
                  },
                },
              )
                .then((result) => {
                  const output = result as { exitCode?: number; status?: string };
                  const code = output.exitCode ?? (output.status === 'inspected' ? 0 : 1);
                  store.updateResearch(command.researchId, {
                    status: code === 0 ? 'completed' : 'failed',
                  });
                })
                .catch((error) => {
                  store.updateResearch(command.researchId, {
                    status: controller.signal.aborted ? 'cancelled' : 'failed',
                  });
                  emit({
                    type: 'activity',
                    data: store.activity(
                      command.researchId,
                      'error',
                      publicError(error, Object.values(keys)),
                    ),
                  });
                })
                .finally(() => {
                  manual.delete(command.researchId);
                  changed(command.researchId);
                });
              data = { started: true };
              break;
            }
            case 'research.export': {
              const snapshot = store.snapshot(command.researchId);
              // Transfer binary files individually so no export exceeds the WS frame budget.
              data = {
                format: 'scienfactory-research/v1',
                exportedAt: new Date().toISOString(),
                ...snapshot,
              };
              break;
            }
          }
          const reply = { type: 'reply' as const, requestId: command.requestId, ok: true, data };
          if (mutating) store.remember(command.requestId, reply);
          ws.send(reply);
        } catch (error) {
          ws.send({
            type: 'reply',
            requestId: command.requestId,
            ok: false,
            error: publicError(error, Object.values(keys)),
          });
        } finally {
          inFlight.delete(command.requestId);
        }
      },
    });
  if (options.production)
    app
      .use(staticPlugin({ assets: join(import.meta.dir, '../dist'), prefix: '/' }))
      .get('/', () => Bun.file(join(import.meta.dir, '../dist/index.html')));
  return {
    app,
    store,
    engine,
    close: () => {
      engine.stopAll();
      for (const controller of manual.values()) controller.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      store.close();
    },
    shutdown: async () => {
      engine.stopAll();
      for (const controller of manual.values()) controller.abort();
      await engine.drain();
      const deadline = Date.now() + 5000;
      while (manual.size && Date.now() < deadline) await Bun.sleep(25);
      for (const timer of timers.values()) clearTimeout(timer);
      await app.stop(true);
      store.close();
    },
  };
}
