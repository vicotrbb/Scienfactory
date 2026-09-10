import { Database } from 'bun:sqlite';
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';

// Local validation handoff. Copies a completed research without touching unrelated research/config.
const [sourceArg, targetArg, researchId] = process.argv.slice(2);
if (!sourceArg || !targetArg || !researchId)
  throw new Error(
    'Usage: bun scripts/import-validation.ts SOURCE_DATA_DIR TARGET_DATA_DIR RESEARCH_ID',
  );
const sourceRoot = resolve(sourceArg),
  targetRoot = resolve(targetArg);
if (sourceRoot === targetRoot) throw new Error('Source and target must differ.');
const source = new Database(join(sourceRoot, 'research.sqlite'), { readonly: true });
const target = new Database(join(targetRoot, 'research.sqlite'), { readwrite: true });
target.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
try {
  const rows = source
    .query('SELECT kind,id,research_id,data FROM entities WHERE research_id=?')
    .all(researchId) as { kind: string; id: string; research_id: string; data: string }[];
  if (!rows.some((r) => r.kind === 'research' && JSON.parse(r.data).status === 'completed'))
    throw new Error('Source research must be completed.');
  if (rows.some((r) => JSON.parse(r.data).status === 'running'))
    throw new Error('Source still has running work.');
  if (target.query('SELECT 1 FROM entities WHERE research_id=? LIMIT 1').get(researchId))
    throw new Error('Research already exists in the target; nothing changed.');
  mkdirSync(join(targetRoot, 'blobs'), { recursive: true });
  for (const row of rows.filter((r) => r.kind === 'artifact')) {
    const artifact = JSON.parse(row.data);
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid content address.');
    const bytes = await Bun.file(join(sourceRoot, 'blobs', artifact.sha256)).bytes();
    if (new Bun.CryptoHasher('sha256').update(bytes).digest('hex') !== artifact.sha256)
      throw new Error('Source artifact hash mismatch.');
    const destination = Bun.file(join(targetRoot, 'blobs', artifact.sha256));
    if (await destination.exists()) {
      if (
        new Bun.CryptoHasher('sha256').update(await destination.bytes()).digest('hex') !==
        artifact.sha256
      )
        throw new Error('Target artifact hash mismatch.');
    } else await Bun.write(destination, bytes);
  }
  const activity = source
    .query('SELECT data FROM activity WHERE research_id=? ORDER BY id')
    .all(researchId) as { data: string }[];
  target.transaction(() => {
    const insert = target.query('INSERT INTO entities(kind,id,research_id,data) VALUES (?,?,?,?)');
    for (const row of rows) insert.run(row.kind, row.id, row.research_id, row.data);
    const log = target.query('INSERT INTO activity(research_id,data) VALUES (?,?)');
    for (const row of activity) log.run(researchId, row.data);
  })();
  console.log(
    JSON.stringify({
      researchId,
      entities: rows.length,
      artifacts: rows.filter((r) => r.kind === 'artifact').length,
      activity: activity.length,
      imported: true,
    }),
  );
} finally {
  source.close();
  target.close();
}
