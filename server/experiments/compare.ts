import { z } from 'zod';
import type { ToolContext } from '../toolkit';
import { studySchema, studyTrials } from './study';
import { executeExperiment } from './execution';
import { readExecutionRecord } from './records';
import { present } from '../canvas';

export const comparisonSchema = z
  .object({
    studyArtifactId: z.string(),
    metric: z.string().min(1).max(40),
    baselineCase: z.number().int().min(1).max(48),
    comparisonCase: z.number().int().min(1).max(48),
    sampling: z.enum(['deterministic', 'randomized_repeats']),
    rationale: z.string().min(1).max(1500),
    confidence: z.number().min(0.8).max(0.99).default(0.95),
    seed: z.number().int().min(0).max(4294967295).default(20260912),
  })
  .refine((r) => r.baselineCase !== r.comparisonCase, 'Select two distinct parameter cases.');
const outcomeSchema = z.object({
  version: z.literal(1),
  protocolArtifactId: z.string(),
  trials: z
    .array(
      z.object({
        case: z.number().int(),
        repeat: z.number().int(),
        seed: z.number().int(),
        status: z.enum(['passed', 'failed', 'cancelled', 'running', 'pending']),
        metrics: z.record(z.string(), z.number().finite()).optional(),
        executionRecordId: z.string().optional(),
      }),
    )
    .min(1)
    .max(48),
});

export async function compareStudy(args: unknown, ctx: ToolContext) {
  const request = comparisonSchema.parse(args);
  const saved = await ctx.store.readArtifact(ctx.researchId, request.studyArtifactId);
  if (saved.provenance !== 'Study outcomes linked to immutable protocol and real execution records')
    throw new Error('Select an actual run_study results artifact.');
  const results = outcomeSchema.parse(JSON.parse(Buffer.from(saved.data, 'base64').toString()));
  const protocol = await ctx.store.readArtifact(ctx.researchId, results.protocolArtifactId);
  if (protocol.provenance !== 'Study protocol recorded before experiment execution')
    throw new Error('Study protocol provenance is missing.');
  const study = studySchema.parse(JSON.parse(Buffer.from(protocol.data, 'base64').toString()));
  const metric = study.metrics.find((m) => m.name === request.metric);
  if (!metric) throw new Error('Metric is not declared in this study.');
  const expected = studyTrials(study);
  const seen = new Set<string>();
  for (const trial of results.trials) {
    const key = `${trial.case}.${trial.repeat}`;
    if (seen.has(key)) throw new Error('Duplicate trial identity.');
    seen.add(key);
  }
  const pairs = [];
  for (let repeat = 1; repeat <= study.repeats; repeat++) {
    const pair = [];
    for (const caseNumber of [request.baselineCase, request.comparisonCase]) {
      const declared = expected.find((t) => t.case === caseNumber && t.repeat === repeat);
      const trial = results.trials.find((t) => t.case === caseNumber && t.repeat === repeat);
      if (
        !declared ||
        !trial ||
        trial.seed !== declared.seed ||
        !['passed', 'failed'].includes(trial.status) ||
        !trial.executionRecordId ||
        !trial.metrics ||
        !Object.hasOwn(trial.metrics, request.metric)
      )
        throw new Error(
          'Complete paired repeats are required. Missing, cancelled or unreadable outcomes cannot be silently excluded.',
        );
      const { record } = await readExecutionRecord(trial.executionRecordId, ctx);
      if (record.exitCode !== 0) throw new Error('A compared trial did not execute successfully.');
      const metricsFile = record.artifacts.find((a) => a.name === 'study-metrics.json');
      if (!metricsFile) throw new Error('Trial metrics evidence is missing.');
      const raw = await ctx.store.readArtifact(ctx.researchId, metricsFile.id);
      const values = JSON.parse(Buffer.from(raw.data, 'base64').toString());
      if (
        raw.sha256 !== metricsFile.sha256 ||
        values[request.metric] !== trial.metrics[request.metric]
      )
        throw new Error('Study summary differs from recorded trial metrics.');
      pair.push({
        case: caseNumber,
        repeat,
        seed: trial.seed,
        value: trial.metrics[request.metric]!,
        status: trial.status,
        executionRecordId: trial.executionRecordId,
      });
    }
    pairs.push({ repeat, seed: pair[0]!.seed, baseline: pair[0]!, comparison: pair[1]! });
  }
  const input = await ctx.store.artifact(
    ctx.researchId,
    `comparison-${crypto.randomUUID()}-input.json`,
    'application/json',
    Buffer.from(
      JSON.stringify({
        request,
        metric,
        pairs,
        studyTitle: study.title,
        baselineParameters: expected.find((t) => t.case === request.baselineCase)!.parameters,
        comparisonParameters: expected.find((t) => t.case === request.comparisonCase)!.parameters,
      }),
    ),
    `Paired comparison input from study ${saved.id}; protocol ${protocol.id}`,
  );
  const code = await Bun.file(new URL('./comparison.py', import.meta.url)).text();
  const execution = await executeExperiment(
    {
      title: `Compare ${metric.name} · cases ${request.baselineCase} and ${request.comparisonCase}`,
      language: 'python',
      code,
      inputArtifactIds: [input.id, saved.id, protocol.id],
    },
    ctx,
  );
  if (execution.exitCode !== 0) throw new Error('Comparison failed; inspect its execution output.');
  const report = execution.artifacts.find((a) => a.name === 'comparison.md');
  const json = execution.artifacts.find((a) => a.name === 'comparison.json');
  const plot = execution.artifacts.find((a) => a.name === 'comparison.png');
  if (!report || !json || !plot)
    throw new Error('Comparison did not deliver its report, measurements and figure.');
  const summary = JSON.parse(
    Buffer.from((await ctx.store.readArtifact(ctx.researchId, json.id)).data, 'base64').toString(),
  );
  await present(
    {
      title: `Paired comparison · ${metric.name}`,
      artifactIds: [report.id, plot.id, json.id],
      caption:
        'Comparison minus baseline. Failed bounds remain included; missing pairs are refused.',
    },
    ctx,
  );
  return {
    ...summary,
    executionRecordId: execution.executionRecordId,
    reportArtifactId: report.id,
    artifactId: json.id,
    plotArtifactId: plot.id,
  };
}
