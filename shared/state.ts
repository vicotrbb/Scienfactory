import type { Snapshot, SnapshotPatch } from './protocol';

const collections = [
  'messages',
  'agents',
  'artifacts',
  'sources',
  'activity',
  'runs',
  'canvas',
  'plans',
  'tools',
] as const;

/** Collections are immutable-ID upserts. Full snapshots remain the reconnect boundary. */
export function snapshotPatch(previous: Snapshot, next: Snapshot): SnapshotPatch {
  const changes: Partial<Snapshot> = {};
  if (JSON.stringify(previous.research) !== JSON.stringify(next.research))
    changes.research = next.research;
  for (const key of collections) {
    const old = new Map(
      (previous[key] as { id: string | number }[]).map((item) => [item.id, JSON.stringify(item)]),
    );
    const changed = (next[key] as { id: string | number }[]).filter(
      (item) => old.get(item.id) !== JSON.stringify(item),
    );
    if (changed.length) Object.assign(changes, { [key]: changed });
  }
  return { researchId: next.research.id, changes };
}

export function applySnapshotPatch(previous: Snapshot, patch: SnapshotPatch): Snapshot {
  if (previous.research.id !== patch.researchId) return previous;
  const next = { ...previous, research: patch.changes.research ?? previous.research };
  for (const key of collections) {
    const changed = patch.changes[key] as { id: string | number }[] | undefined;
    if (!changed) continue;
    const merged = new Map(
      (previous[key] as { id: string | number }[]).map((item) => [item.id, item]),
    );
    for (const item of changed) merged.set(item.id, item);
    Object.assign(next, {
      [key]: key === 'activity' ? [...merged.values()].slice(-500) : [...merged.values()],
    });
  }
  return next;
}
