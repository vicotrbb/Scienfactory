import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { artifactMime } from './files/format';
import type {
  Activity,
  Agent,
  Artifact,
  Message,
  Research,
  Run,
  Settings,
  Snapshot,
  Source,
  CanvasItem,
  ResearchPlan,
  ToolInvocation,
} from '../shared/protocol';

/** SQLite owns durable state. Binary artifacts are immutable, addressed by SHA-256. */
export class Store {
  private db: Database;
  private pendingBytes = new Map<string, number>();
  readonly root: string;
  constructor(root: string) {
    this.root = root;
    mkdirSync(join(root, 'blobs'), { recursive: true, mode: 0o700 });
    this.db = new Database(join(root, 'research.sqlite'), { create: true });
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, research_id TEXT, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS entities_research ON entities(research_id,kind);
      CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, research_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS activity_research ON activity(research_id,id);
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, reply TEXT NOT NULL);
      PRAGMA user_version=1;`);
    // In-flight work cannot be silently promoted to completion after restart.
    for (const kind of ['research', 'agent', 'run', 'canvas', 'tool']) {
      for (const entity of this.list<Research | Agent | Run>(kind)) {
        if (entity.status === 'running') this.put(kind, { ...entity, status: 'interrupted' });
      }
    }
  }
  close() {
    this.db.close();
  }
  put<T extends { id: string; researchId?: string }>(kind: string, value: T): T {
    this.db
      .query(
        'INSERT INTO entities VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,research_id=excluded.research_id',
      )
      .run(
        kind,
        value.id,
        value.researchId ?? (kind === 'research' ? value.id : null),
        JSON.stringify(value),
      );
    return value;
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db.query('SELECT data FROM entities WHERE kind=? AND id=?').get(kind, id) as {
      data: string;
    } | null;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  list<T>(kind: string, researchId?: string): T[] {
    const rows = researchId
      ? this.db
          .query('SELECT data FROM entities WHERE kind=? AND research_id=? ORDER BY rowid')
          .all(kind, researchId)
      : this.db.query('SELECT data FROM entities WHERE kind=? ORDER BY rowid').all(kind);
    return (rows as { data: string }[]).map((row) => JSON.parse(row.data) as T);
  }
  researches(): Research[] {
    return this.list<Research>('research').sort((a, b) => b.updatedAt - a.updatedAt);
  }
  create(title: string): Research {
    return this.put('research', {
      id: crypto.randomUUID(),
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'idle',
    } as Research);
  }
  requireResearch(id: string): Research {
    const research = this.get<Research>('research', id);
    if (!research) throw new Error('Research not found.');
    return research;
  }
  updateResearch(id: string, patch: Partial<Pick<Research, 'title' | 'status'>>): Research {
    return this.put('research', { ...this.requireResearch(id), ...patch, updatedAt: Date.now() });
  }
  delete(id: string) {
    this.requireResearch(id);
    this.db.transaction(() => {
      this.db.query('DELETE FROM entities WHERE research_id=?').run(id);
      this.db.query('DELETE FROM activity WHERE research_id=?').run(id);
    })();
  }
  message(
    researchId: string,
    role: Message['role'],
    text: string,
    agentId: string | null = null,
    id = crypto.randomUUID(),
  ): Message {
    const createdAt = this.get<Message>('message', id)?.createdAt ?? Date.now();
    return this.put('message', { id, researchId, role, text, agentId, createdAt });
  }
  activity(
    researchId: string,
    type: string,
    text: string,
    agentId: string | null = null,
  ): Activity {
    const data = { researchId, type, text: text.slice(0, 12000), agentId, createdAt: Date.now() };
    const result = this.db
      .query('INSERT INTO activity (research_id,data) VALUES (?,?)')
      .run(researchId, JSON.stringify(data));
    return { ...data, id: Number(result.lastInsertRowid) };
  }
  activities(researchId: string): Activity[] {
    return (
      this.db
        .query('SELECT id,data FROM activity WHERE research_id=? ORDER BY id DESC LIMIT 500')
        .all(researchId) as { id: number; data: string }[]
    )
      .reverse()
      .map((row) => ({ ...JSON.parse(row.data), id: row.id }));
  }
  snapshot(id: string): Snapshot {
    return {
      research: this.requireResearch(id),
      messages: this.list<Message>('message', id),
      agents: this.list<Agent>('agent', id),
      artifacts: this.list<Artifact>('artifact', id),
      sources: this.list<Source>('source', id),
      activity: this.activities(id),
      runs: this.list<Run>('run', id),
      canvas: this.list<CanvasItem>('canvas', id),
      plans: this.list<ResearchPlan>('plan', id),
      tools: this.list<ToolInvocation>('tool', id),
    };
  }
  async artifact(
    researchId: string,
    name: string,
    mime: string,
    bytes: Uint8Array,
    provenance: string,
  ): Promise<Artifact> {
    this.requireResearch(researchId);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Artifacts are limited to 8 MB each.');
    const current = this.list<Artifact>('artifact', researchId).reduce((sum, a) => sum + a.size, 0);
    const reserved = this.pendingBytes.get(researchId) ?? 0;
    if (current + reserved + bytes.length > 256 * 1024 * 1024)
      throw new Error(
        'This research has reached its 256 MB artifact budget. Export it and start a new research.',
      );
    this.pendingBytes.set(researchId, reserved + bytes.length);
    const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
    try {
      await Bun.write(join(this.root, 'blobs', sha256), bytes);
      this.requireResearch(researchId);
      return this.put('artifact', {
        id: crypto.randomUUID(),
        researchId,
        name: name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 160),
        mime: artifactMime(name, mime, bytes),
        size: bytes.length,
        sha256,
        createdAt: Date.now(),
        provenance,
      });
    } finally {
      this.pendingBytes.set(
        researchId,
        (this.pendingBytes.get(researchId) ?? bytes.length) - bytes.length,
      );
    }
  }
  async readArtifact(researchId: string, id: string) {
    const artifact = this.get<Artifact>('artifact', id);
    if (!artifact || artifact.researchId !== researchId)
      throw new Error('Artifact not found in this research.');
    return {
      ...artifact,
      data: Buffer.from(
        await Bun.file(join(this.root, 'blobs', artifact.sha256)).arrayBuffer(),
      ).toString('base64'),
    };
  }
  config(): Settings | undefined {
    const row = this.db.query("SELECT data FROM config WHERE key='settings'").get() as {
      data: string;
    } | null;
    return row ? JSON.parse(row.data) : undefined;
  }
  saveConfig(settings: Settings) {
    this.db
      .query(
        "INSERT INTO config VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(settings));
  }
  reply(id: string): unknown | undefined {
    const row = this.db.query('SELECT reply FROM requests WHERE id=?').get(id) as {
      reply: string;
    } | null;
    return row ? JSON.parse(row.reply) : undefined;
  }
  remember(id: string, reply: unknown) {
    this.db.query('INSERT OR REPLACE INTO requests VALUES (?,?)').run(id, JSON.stringify(reply));
    this.db
      .query('DELETE FROM requests WHERE rowid < (SELECT MAX(rowid)-2000 FROM requests)')
      .run();
  }
}
