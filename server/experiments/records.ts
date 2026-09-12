import { z } from 'zod';
import { Language } from '../../shared/protocol';
import type { ToolContext } from '../toolkit';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const file = z.object({ id: z.string(), name: z.string(), sha256: hash });
const recordSchema = z.object({
  version: z.literal(2),
  source: z.string(),
  sourceHash: hash,
  language: Language,
  inputs: z.array(file).max(10),
  environment: z.object({
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    platform: z.string(),
  }),
  exitCode: z.number().int(),
  stdout: z.string(),
  artifacts: z.array(file),
});

/** Resolve actual, content-verified execution evidence at the persistence boundary. */
export async function readExecutionRecord(id: string, ctx: ToolContext) {
  const saved = await ctx.store.readArtifact(ctx.researchId, id);
  if (!saved.provenance.startsWith('Execution record for '))
    throw new Error('Select an actual execution record.');
  const parsed = recordSchema.safeParse(JSON.parse(Buffer.from(saved.data, 'base64').toString()));
  if (!parsed.success)
    throw new Error(
      'This historical execution lacks complete input or container provenance. Run a new baseline first.',
    );
  const record = parsed.data;
  if (saved.provenance !== `Execution record for ${record.source}`)
    throw new Error('Execution source and record provenance disagree.');
  const source = await ctx.store.readArtifact(ctx.researchId, record.source);
  if (source.sha256 !== record.sourceHash)
    throw new Error('Recorded source hash differs from the saved input.');
  for (const input of record.inputs) {
    const actual = await ctx.store.readArtifact(ctx.researchId, input.id);
    if (actual.sha256 !== input.sha256 || actual.name !== input.name)
      throw new Error('Recorded input identity differs from saved evidence.');
  }
  for (const output of record.artifacts) {
    const actual = await ctx.store.readArtifact(ctx.researchId, output.id);
    if (
      actual.sha256 !== output.sha256 ||
      actual.name !== output.name ||
      !actual.provenance.startsWith(`Execution ${record.source}; exit ${record.exitCode};`)
    )
      throw new Error('Recorded output identity differs from saved evidence.');
  }
  return { saved, record, source };
}
