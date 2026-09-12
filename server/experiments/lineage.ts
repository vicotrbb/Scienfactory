import { z } from 'zod';
import type { ToolContext } from '../toolkit';
import { readExecutionRecord } from './records';
import { executeExperiment } from './execution';
import { present } from '../canvas';
export const lineageSchema = z.object({
  artifactId: z.string(),
  maxDepth: z.number().int().min(1).max(6).default(4),
});
export async function traceArtifact(args: unknown, ctx: ToolContext) {
  const request = lineageSchema.parse(args);
  const all = ctx.store.snapshot(ctx.researchId).artifacts;
  const nodes: {
    id: string;
    name: string;
    sha256: string;
    kind: string;
    executionRecordId?: string;
    imageId?: string;
    exitCode?: number;
  }[] = [];
  const edges: { from: string; to: string; relation: 'source' | 'input' }[] = [];
  const warnings: string[] = [];
  const visited = new Set<string>();
  async function visit(id: string, depth: number): Promise<void> {
    ctx.signal.throwIfAborted();
    if (visited.has(id)) return;
    if (nodes.length >= 40) {
      warnings.push('Node limit reached; some upstream evidence is omitted.');
      return;
    }
    visited.add(id);
    const artifact = await ctx.store.readArtifact(ctx.researchId, id);
    const node: (typeof nodes)[number] = {
      id,
      name: artifact.name,
      sha256: artifact.sha256,
      kind: 'authored or imported; no recorded generator',
    };
    nodes.push(node);
    const producer = /^Execution ([a-f0-9-]{36}); exit (-?\d+);/.exec(artifact.provenance);
    if (!producer) return;
    const candidates = all.filter((a) => a.provenance === `Execution record for ${producer[1]}`);
    if (candidates.length !== 1) {
      warnings.push(`No unique execution record for ${artifact.name}.`);
      return;
    }
    const { record, saved } = await readExecutionRecord(candidates[0]!.id, ctx);
    const output = record.artifacts.find((a) => a.id === id);
    if (!output || output.sha256 !== artifact.sha256 || output.name !== artifact.name)
      throw new Error('Artifact and generating execution record disagree.');
    node.kind = 'execution output';
    node.executionRecordId = saved.id;
    node.imageId = record.environment.imageId;
    node.exitCode = record.exitCode;
    if (depth >= request.maxDepth) {
      warnings.push(`Depth limit reached at ${artifact.name}.`);
      return;
    }
    for (const dependency of [
      { id: record.source, relation: 'source' as const },
      ...record.inputs.map((a) => ({ id: a.id, relation: 'input' as const })),
    ]) {
      await visit(dependency.id, depth + 1);
      if (visited.has(dependency.id))
        edges.push({ from: dependency.id, to: id, relation: dependency.relation });
    }
  }
  await visit(request.artifactId, 0);
  const report = {
    artifactId: request.artifactId,
    status: warnings.length ? 'partial' : 'traced',
    nodes,
    edges,
    warnings,
    scope:
      'Content integrity and recorded execution ancestry only. Authored/imported leaves have no verified generating computation. This does not establish scientific validity or verify a citation’s meaning.',
  };
  const artifact = await ctx.store.artifact(
    ctx.researchId,
    `lineage-${crypto.randomUUID()}.json`,
    'application/json',
    Buffer.from(JSON.stringify(report, null, 2)),
    'Recorded artifact lineage audit',
  );
  // DOT identifiers are generated locally; all artifact labels are quoted, never executable markup.
  const names = new Map(nodes.map((n, i) => [n.id, `n${i}`]));
  const quoted = (s: string) => JSON.stringify(s);
  const dot = `digraph Evidence { graph [rankdir=LR,bgcolor="white",pad="0.4",nodesep="0.35"]; node [shape=box,style="rounded,filled",fillcolor="#f4f7f4",color="#a8b8aa",fontname="Helvetica",fontsize=11,margin="0.2"]; edge [color="#55705b",fontname="Helvetica",fontsize=9];\n${nodes.map((n) => `${names.get(n.id)} [label=${quoted(n.name.slice(0, 70) + '\n' + n.kind + '\n' + n.sha256.slice(0, 12))}];`).join('\n')}\n${edges.map((e) => `${names.get(e.from)} -> ${names.get(e.to)} [label=${quoted(e.relation)}];`).join('\n')}\n}`;
  const drawing = await executeExperiment(
    {
      title: 'Evidence lineage diagram',
      language: 'graphviz',
      code: dot,
      inputArtifactIds: [artifact.id],
    },
    ctx,
  );
  if (drawing.exitCode !== 0)
    throw new Error('Lineage was recorded, but the diagram failed to render.');
  const plot = drawing.artifacts.find((a) => a.mime === 'image/svg+xml');
  if (!plot) throw new Error('Lineage diagram was not returned.');
  await present(
    {
      title: 'Evidence lineage',
      content: `## Evidence lineage\n\n${nodes.length} content-checked files and ${edges.length} recorded dependencies. ${warnings.join(' ')}\n\n${report.scope}`,
      artifactIds: [plot.id, artifact.id],
    },
    ctx,
  );
  return {
    ...report,
    artifactId: artifact.id,
    rootArtifactId: request.artifactId,
    diagramArtifactId: plot.id,
  };
}
