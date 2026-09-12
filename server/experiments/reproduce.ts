import { z } from 'zod';
import type { ToolContext } from '../toolkit';
import { executeExperiment, type ExecutionRecord } from './execution';
import { present } from '../canvas';
export const reproduceSchema = z.object({
  executionRecordId: z.string(),
  title: z.string().max(160).default('Reproducibility check'),
});

export async function reproduceExecution(args: unknown, ctx: ToolContext) {
  const request = reproduceSchema.parse(args);
  const saved = await ctx.store.readArtifact(ctx.researchId, request.executionRecordId);
  if (!saved.provenance.startsWith('Execution record for '))
    throw new Error('Select an actual execution record.');
  const original = JSON.parse(Buffer.from(saved.data, 'base64').toString()) as ExecutionRecord;
  if (original.version !== 2 || !original.environment || !Array.isArray(original.inputs))
    throw new Error(
      'This historical execution lacks complete input or container provenance. Run a new baseline first.',
    );
  if (original.exitCode !== 0)
    throw new Error('A reproducibility comparison needs a successfully completed baseline.');
  const source = await ctx.store.readArtifact(ctx.researchId, original.source);
  if (source.sha256 !== original.sourceHash)
    throw new Error('Recorded source hash differs from the saved input.');
  for (const input of original.inputs) {
    const a = await ctx.store.readArtifact(ctx.researchId, input.id);
    if (a.sha256 !== input.sha256 || a.name !== input.name)
      throw new Error('Recorded input identity differs from saved evidence.');
  }
  const rerun = await executeExperiment(
    {
      title: request.title,
      language: original.language,
      code: Buffer.from(source.data, 'base64').toString(),
      inputArtifactIds: original.inputs.map((i) => i.id),
    },
    ctx,
    original.environment.imageId,
  );
  const completeRerun = JSON.parse(
    Buffer.from(
      (await ctx.store.readArtifact(ctx.researchId, rerun.executionRecordId)).data,
      'base64',
    ).toString(),
  ) as ExecutionRecord;
  const outputs = new Map(rerun.artifacts.map((a) => [a.name, a.sha256]));
  const files = original.artifacts.map((a) => ({
    name: a.name,
    before: a.sha256,
    after: outputs.get(a.name) ?? null,
    match: outputs.get(a.name) === a.sha256,
  }));
  const additional = rerun.artifacts
    .filter((a) => !original.artifacts.some((b) => b.name === a.name))
    .map((a) => a.name);
  const environmentMatches =
    rerun.environment?.imageId === original.environment.imageId &&
    rerun.environment?.platform === original.environment.platform;
  const matches =
    rerun.exitCode === 0 &&
    environmentMatches &&
    files.every((f) => f.match) &&
    !additional.length &&
    original.stdout === completeRerun.stdout;
  const report = {
    status: matches ? 'matched' : 'different',
    baselineId: saved.id,
    rerunId: rerun.executionRecordId,
    environmentMatches,
    stdoutMatches: original.stdout === completeRerun.stdout,
    files,
    additional,
    scope:
      'Exact output bytes and stdout under the recorded image and inputs. Differences may reflect timestamps, randomness or nondeterminism; matching outputs do not establish scientific validity or independent replication.',
  };
  const artifact = await ctx.store.artifact(
    ctx.researchId,
    `reproduction-${crypto.randomUUID()}.json`,
    'application/json',
    Buffer.from(JSON.stringify(report, null, 2)),
    'Reproduction audit of actual execution records',
  );
  await present(
    {
      title: request.title,
      content: `## Reproducibility: ${matches ? 'exact outputs matched' : 'outputs differ'}\n\n${files.filter((f) => f.match).length}/${files.length} original output files matched byte for byte. ${additional.length} additional files. Console output ${report.stdoutMatches ? 'matched' : 'differed'}.\n\n${report.scope}`,
      artifactIds: [artifact.id],
    },
    ctx,
  );
  return { ...report, artifactId: artifact.id };
}
