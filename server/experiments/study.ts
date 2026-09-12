import { z } from 'zod';
import type { Artifact, CanvasItem } from '../../shared/protocol';
import type { ToolContext } from '../toolkit';
import { executeExperiment, ExecutionFailure } from './execution';
import { present } from '../canvas';

const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
const scalar = z.union([z.number().finite(), z.string().max(100), z.boolean()]);
const metricSchema = z
  .object({
    name: identifier,
    unit: z.string().max(50),
    rationale: z.string().min(1).max(600).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .refine(
    (m) => m.min === undefined || m.max === undefined || m.min <= m.max,
    'Metric bounds are reversed',
  );
export const studySchema = z
  .object({
    title: z.string().min(1).max(120),
    question: z.string().min(1).max(1500),
    hypothesis: z.string().min(1).max(1500),
    limitations: z.string().min(1).max(3000),
    code: z.string().min(1).max(90000),
    factors: z
      .array(z.object({ name: identifier, values: z.array(scalar).min(1).max(12) }))
      .min(1)
      .max(6),
    metrics: z.array(metricSchema).min(1).max(6),
    repeats: z.number().int().min(1).max(8).default(1),
    seed: z.number().int().min(0).max(4294967000).default(20260912),
    inputArtifactIds: z.array(z.string()).max(10).default([]),
    requiredOutputs: z
      .array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/))
      .max(10)
      .default([]),
  })
  .superRefine((s, ctx) => {
    for (const [label, names] of [
      ['factor', s.factors.map((f) => f.name)],
      ['metric', s.metrics.map((m) => m.name)],
    ] as const)
      if (new Set(names).size !== names.length)
        ctx.addIssue({ code: 'custom', message: `Duplicate ${label} names` });
    for (const f of s.factors)
      if (new Set(f.values.map((v) => JSON.stringify(v))).size !== f.values.length)
        ctx.addIssue({ code: 'custom', message: `Duplicate levels for ${f.name}` });
    if (s.factors.reduce((n, f) => n * f.values.length, s.repeats) > 48)
      ctx.addIssue({
        code: 'custom',
        message: 'A study allows at most 48 total trials, including repeats.',
      });
  });
export type Study = z.infer<typeof studySchema>;
export interface Trial {
  case: number;
  repeat: number;
  seed: number;
  parameters: Record<string, string | number | boolean>;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  metrics?: Record<string, number>;
  executionRecordId?: string;
  artifacts?: Artifact[];
  error?: string;
}
export function studyTrials(study: Study): Trial[] {
  let combinations: Trial['parameters'][] = [{}];
  for (const factor of study.factors)
    combinations = combinations.flatMap((p) =>
      factor.values.map((v) => ({ ...p, [factor.name]: v })),
    );
  return combinations.flatMap((parameters, index) =>
    Array.from({ length: study.repeats }, (_, repeat) => ({
      case: index + 1,
      repeat: repeat + 1,
      seed: study.seed + repeat,
      parameters,
      status: 'pending',
    })),
  );
}
const escaped = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const cell = (value: unknown) =>
  String(value).replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('<', '&lt;');
function number(value: number) {
  return Number.isInteger(value) && Math.abs(value) < 1e6 ? String(value) : value.toPrecision(5);
}
function overview(study: Study, trials: Trial[], status: string) {
  const finished = trials.filter((t) => ['passed', 'failed', 'cancelled'].includes(t.status));
  const rows = trials
    .map(
      (t) =>
        `| ${t.case}.${t.repeat} | ${cell(
          Object.entries(t.parameters)
            .map(([k, v]) => `${k}=${v}`)
            .join(', '),
        )} | ${cell(t.status + (t.error ? ': ' + t.error : ''))} | ${study.metrics.map((m) => (t.metrics?.[m.name] === undefined ? '' : number(t.metrics[m.name]!))).join(' | ')} |`,
    )
    .join('\n');
  const criteria = study.metrics
    .map(
      (m) =>
        `- **${cell(m.name)}** (${cell(m.unit)}): ${m.min === undefined ? 'no lower bound' : `minimum ${number(m.min)}`}; ${m.max === undefined ? 'no upper bound' : `maximum ${number(m.max)}`}. ${cell(m.rationale ?? 'No criterion rationale supplied.')}`,
    )
    .join('\n');
  return `## ${cell(study.title)}\n\n${cell(study.question)}\n\n**${status === 'needs_review' ? 'Needs review' : status[0]!.toUpperCase() + status.slice(1)} · ${finished.length}/${trials.length} trials finished · ${trials.filter((t) => t.status === 'passed').length} passed declared checks**\n\nHypothesis: ${cell(study.hypothesis)}\n\n### Declared checks\n\n${criteria}\n\nRequired output files per trial: ${study.requiredOutputs.length ? study.requiredOutputs.map(cell).join(', ') : 'none declared'}.\n\n### Observations\n\n| Case.repeat | Parameters | Status | ${study.metrics.map((m) => cell(`${m.name} (${m.unit})`)).join(' | ')} |\n| --- | --- | --- | ${study.metrics.map(() => '---:').join(' | ')} |\n${rows}\n\n${cell(study.limitations)}\n\nSeeds are paired across parameter cases for each repeat. All valid observed metrics are retained, including failed checks. Repeats measure computational variability, not independent experimental replication. Protocol and checks were saved before execution; this local record is not external preregistration.`;
}
function chart(trials: Trial[], metric: Study['metrics'][number]) {
  const valid = trials.filter((t) => t.metrics?.[metric.name] !== undefined);
  if (!valid.length) return undefined;
  const values = valid.map((t) => t.metrics![metric.name]!);
  const low = Math.min(...values),
    high = Math.max(...values);
  const magnitude = Math.max(Math.abs(low), Math.abs(high), 1e-300);
  let lo = low / magnitude,
    hi = high / magnitude;
  if (lo === hi) {
    lo -= 0.05;
    hi += 0.05;
  }
  const count = Math.max(...trials.map((t) => t.case));
  const x = (c: number) => 85 + (count === 1 ? 0.5 : (c - 1) / (count - 1)) * 590;
  const y = (v: number) => 230 - ((v / magnitude - lo) / (hi - lo)) * 155;
  const points = valid
    .map(
      (t) =>
        `<circle cx="${x(t.case)}" cy="${y(t.metrics![metric.name]!)}" r="4" fill="${t.status === 'passed' ? '#315c45' : '#a5362e'}" fill-opacity=".8"><title>Case ${t.case}, repeat ${t.repeat}: ${escaped(number(t.metrics![metric.name]!))}; ${t.status}</title></circle>`,
    )
    .join('');
  const ticks = Array.from({ length: Math.min(count, 12) }, (_, i) =>
    Math.round(1 + (i * (count - 1)) / Math.max(1, Math.min(count, 12) - 1)),
  )
    .map((c) => `<text x="${x(c)}" y="252" text-anchor="middle">${c}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="320" viewBox="0 0 740 320" role="img" aria-label="${escaped(metric.name)} by parameter case"><rect width="740" height="320" fill="white"/><g font-family="system-ui,sans-serif" font-size="12" fill="#3c4540"><text x="34" y="30" font-size="18">${escaped(metric.name)}</text><text x="34" y="47" font-size="11">Units: ${escaped(metric.unit)}</text><text x="34" y="64" font-size="11">Every valid trial; green: passed checks, red: failed checks</text><path d="M85 75V230H690" fill="none" stroke="#9aa69d"/><path d="M85 75H690M85 152H690" fill="none" stroke="#e0e5e1"/><text x="77" y="80" text-anchor="end" font-size="10">${escaped(number(high))}</text><text x="77" y="234" text-anchor="end" font-size="10">${escaped(number(low))}</text>${ticks}${points}<text x="375" y="280" text-anchor="middle">Parameter case (definitions in the table)</text><text x="34" y="305" font-size="11">${valid.length}/${trials.length} valid measurements. Missing or failed runs remain in the study record.</text></g></svg>`;
}
export async function runStudy(args: unknown, ctx: ToolContext) {
  const study = studySchema.parse(args);
  // Ownership and filename checks happen before the protocol is recorded or any trial is scheduled.
  const inputs = await Promise.all(
    study.inputArtifactIds.map((id) => ctx.store.readArtifact(ctx.researchId, id)),
  );
  if (new Set(inputs.map((a) => a.name)).size !== inputs.length)
    throw new Error('Select only one version of each study input filename.');
  if (inputs.reduce((n, a) => n + a.size, 0) > 8 * 1024 * 1024)
    throw new Error('Study inputs exceed 8 MB.');
  const id = crypto.randomUUID(),
    trials = studyTrials(study);
  const protocol = await ctx.store.artifact(
    ctx.researchId,
    `study-${id}-protocol.json`,
    'application/json',
    Buffer.from(
      JSON.stringify(
        {
          version: 1,
          ...study,
          inputFiles: inputs.map((a) => ({ id: a.id, name: a.name, sha256: a.sha256 })),
          trials,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    ),
    'Study protocol recorded before experiment execution',
  );
  let itemId: string | undefined;
  let updates = Promise.resolve();
  const publish = (status: string, artifacts: string[] = []) => {
    const content = overview(study, trials, status);
    updates = updates.then(async () => {
      const p = await present(
        { itemId, title: study.title, content, artifactIds: [protocol.id, ...artifacts] },
        ctx,
      );
      itemId = p.itemId;
      const item = ctx.store.get<CanvasItem>('canvas', itemId)!;
      ctx.store.put('canvas', {
        ...item,
        status:
          status === 'running'
            ? 'running'
            : status === 'cancelled'
              ? 'cancelled'
              : status === 'completed'
                ? 'completed'
                : 'failed',
      });
      ctx.changed();
    });
    return updates;
  };
  await publish('running');
  let cursor = 0;
  const worker = async () => {
    while (!ctx.signal.aborted && cursor < trials.length) {
      const trial = trials[cursor++]!;
      trial.status = 'running';
      try {
        const prefix = `import json, random\nimport numpy as np\nparameters = json.loads(${JSON.stringify(JSON.stringify(trial.parameters))})\nseed = ${trial.seed}\nrandom.seed(seed)\nnp.random.seed(seed)\nrng = np.random.default_rng(seed)\nprint(${JSON.stringify(`Study case ${trial.case}, repeat ${trial.repeat}, seed ${trial.seed}`)}, flush=True)\n`;
        const suffix = `\n\nfrom pathlib import Path as _StudyPath\nmetrics = {k: v.item() if isinstance(v, np.generic) else v for k,v in metrics.items()}\nif any(isinstance(v, int) and abs(v) > 2**53 - 1 for v in metrics.values()):\n    raise ValueError('Exact integer metrics exceed binary64 precision. Save exact values separately as strings and use an explicitly approximate float for plotted summaries.')\n_StudyPath('artifacts/study-metrics.json').write_text(json.dumps(metrics, allow_nan=False))\nprint('Study metrics:', json.dumps(metrics, allow_nan=False), flush=True)\n`;
        const result = await executeExperiment(
          {
            title: `${study.title} · ${trial.case}.${trial.repeat}`,
            language: 'python',
            code: prefix + study.code + suffix,
            inputArtifactIds: study.inputArtifactIds,
          },
          ctx,
        );
        trial.executionRecordId = result.executionRecordId;
        trial.artifacts = result.artifacts;
        if (result.exitCode !== 0)
          throw new Error(`Experiment exited ${result.exitCode}; inspect its recorded output.`);
        const file = result.artifacts.find((a) => a.name === 'study-metrics.json');
        if (!file) throw new Error('Experiment did not produce study-metrics.json.');
        const raw = JSON.parse(
          Buffer.from(
            (await ctx.store.readArtifact(ctx.researchId, file.id)).data,
            'base64',
          ).toString(),
        );
        const metrics = z.record(z.string(), z.number().finite()).parse(raw);
        if (study.metrics.some((m) => !Object.hasOwn(metrics, m.name)))
          throw new Error('Declared metrics are missing.');
        trial.metrics = Object.fromEntries(study.metrics.map((m) => [m.name, metrics[m.name]!]));
        const missing = study.requiredOutputs.filter(
          (name) => !result.artifacts.some((a) => a.name === name && a.size > 0),
        );
        if (missing.length)
          throw new Error(
            `Required outputs missing or empty: ${missing.join(', ')}. Save files under artifacts/.`,
          );
        const failed = study.metrics.filter(
          (m) =>
            (m.min !== undefined && metrics[m.name]! < m.min) ||
            (m.max !== undefined && metrics[m.name]! > m.max),
        );
        trial.status = failed.length ? 'failed' : 'passed';
        if (failed.length)
          trial.error = `Outside declared bounds: ${failed.map((m) => m.name).join(', ')}`;
      } catch (error) {
        if (error instanceof ExecutionFailure) trial.executionRecordId = error.executionRecordId;
        trial.status = ctx.signal.aborted ? 'cancelled' : 'failed';
        trial.error =
          error instanceof z.ZodError
            ? 'Metrics must be finite numerical values.'
            : error instanceof Error
              ? error.message
              : 'Experiment failed.';
      }
      await publish('running');
    }
  };
  const workers = await Promise.allSettled([worker(), worker()]);
  const failedUpdate = workers.find((w) => w.status === 'rejected');
  if (failedUpdate?.status === 'rejected') {
    if (itemId) {
      const item = ctx.store.get<CanvasItem>('canvas', itemId)!;
      ctx.store.put('canvas', {
        ...item,
        status: 'failed',
        caption: 'Study persistence failed. Completed experiment records remain available.',
      });
      ctx.changed();
    }
    throw failedUpdate.reason;
  }
  for (const trial of trials)
    if (trial.status === 'pending' || trial.status === 'running') trial.status = 'cancelled';
  const status = ctx.signal.aborted
    ? 'cancelled'
    : trials.every((t) => t.status === 'passed')
      ? 'completed'
      : 'needs_review';
  const report = {
    version: 1,
    status,
    protocolArtifactId: protocol.id,
    warnings: study.metrics
      .filter((m) => !m.rationale)
      .map(
        (m) =>
          `No scientific rationale supplied for ${m.name} criteria. Passing these bounds is not a scientific validation.`,
      ),
    trials,
    scope:
      'Declared computational checks only. Inspect controls, design, implementation and scientific interpretation independently.',
  };
  const artifact = await ctx.store.artifact(
    ctx.researchId,
    `study-${id}-results.json`,
    'application/json',
    Buffer.from(JSON.stringify(report, null, 2)),
    'Study outcomes linked to immutable protocol and real execution records',
  );
  const quote = (value: unknown) => {
    const text =
      typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? "'" + value : String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [
    [
      'case',
      'repeat',
      'seed',
      'status',
      ...study.factors.map((f) => f.name),
      ...study.metrics.map((m) => m.name),
      'executionRecordId',
      'error',
    ],
    ...trials.map((t) => [
      t.case,
      t.repeat,
      t.seed,
      t.status,
      ...study.factors.map((f) => t.parameters[f.name]),
      ...study.metrics.map((m) => t.metrics?.[m.name]),
      t.executionRecordId,
      t.error,
    ]),
  ]
    .map((row) => row.map(quote).join(','))
    .join('\n');
  const table = await ctx.store.artifact(
    ctx.researchId,
    `study-${id}-results.csv`,
    'text/csv',
    Buffer.from(csv),
    'Study results; missing values remain empty and failed trials are retained',
  );
  const figures: Artifact[] = [];
  for (const metric of study.metrics) {
    const svg = chart(trials, metric);
    if (svg)
      figures.push(
        await ctx.store.artifact(
          ctx.researchId,
          `${study.title.slice(0, 80)} - ${metric.name}.svg`,
          'image/svg+xml',
          Buffer.from(svg),
          'Study observations from recorded metrics; no inferential statistics implied',
        ),
      );
  }
  await publish(status, [artifact.id, table.id, ...figures.map((a) => a.id)]);
  ctx.signal.throwIfAborted();
  return {
    ...report,
    artifactId: artifact.id,
    csvArtifactId: table.id,
    figureIds: figures.map((a) => a.id),
    canvasItemId: itemId,
  };
}
