import { z } from 'zod';
import { Language, type Artifact, type CanvasItem } from '../../shared/protocol';
import type { ToolContext } from '../toolkit';
import type { LabResult } from '../lab';
export const executionSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  language: Language,
  code: z.string().min(1).max(100000),
  inputArtifactIds: z.array(z.string()).max(10).default([]),
});

export async function executeExperiment(args: unknown, ctx: ToolContext, imageId?: string) {
  const { store, researchId, signal } = ctx;
  signal.throwIfAborted();
  const request = executionSchema.parse(args);
  const inputs = await Promise.all(
    request.inputArtifactIds.map((id) => store.readArtifact(researchId, id)),
  );
  if (new Set(inputs.map((a) => a.name)).size !== inputs.length)
    throw new Error('Duplicate input filenames: select exactly one version of each input.');
  if (inputs.reduce((sum, a) => sum + a.size, 0) > 8 * 1024 * 1024)
    throw new Error('Combined inputs exceed 8 MB.');
  const ext = {
    python: 'py',
    javascript: 'js',
    lean: 'lean',
    latex: 'tex',
    r: 'R',
    blender: 'py',
    graphviz: 'dot',
  }[request.language];
  const codeArtifact = await store.artifact(
    researchId,
    `${request.language}-${crypto.randomUUID()}.${ext}`,
    'text/plain',
    Buffer.from(request.code),
    `Agent ${ctx.agentId}: execution input`,
  );
  const item: CanvasItem = {
    id: crypto.randomUUID(),
    researchId,
    agentId: ctx.agentId,
    kind: 'experiment',
    title: request.title ?? `${request.language} experiment`,
    caption: '',
    status: 'running',
    artifactIds: [],
    sourceId: codeArtifact.id,
    language: request.language,
    code: request.code,
    output: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const publish = () => {
    item.updatedAt = Date.now();
    store.put('canvas', item);
    ctx.changed();
  };
  publish();
  try {
    const result = await ctx.lab.execute(
      { ...request, imageId, inputs: inputs.map((a) => ({ name: a.name, data: a.data })) },
      signal,
      (text) => {
        item.output = ((item.output ?? '') + text).slice(-100000);
        publish();
        ctx.log('output', text);
      },
    );
    if (new Set(result.artifacts.map((a) => a.name)).size !== result.artifacts.length)
      throw new Error('Output filenames collide. Use distinct filenames for generated artifacts.');
    const artifacts: Artifact[] = [];
    for (const artifact of result.artifacts)
      artifacts.push(
        await store.artifact(
          researchId,
          artifact.name,
          artifact.mime,
          Buffer.from(artifact.data, 'base64'),
          `Execution ${codeArtifact.id}; exit ${result.exitCode}; ${request.language}`,
        ),
      );
    const record = {
      version: 2 as const,
      sourceHash: codeArtifact.sha256,
      inputs: inputs.map((a) => ({ id: a.id, name: a.name, sha256: a.sha256 })),
      environment: result.environment,
      language: request.language,
      source: codeArtifact.id,
      exitCode: result.exitCode,
      stdout: result.stdout,
      error: result.error,
      durationMs: result.durationMs,
      artifacts,
    };
    const executionRecord = await store.artifact(
      researchId,
      `execution-${crypto.randomUUID()}.json`,
      'application/json',
      Buffer.from(JSON.stringify(record, null, 2)),
      `Execution record for ${codeArtifact.id}`,
    );
    ctx.changed();
    item.status = result.exitCode === 0 ? 'completed' : 'failed';
    item.exitCode = result.exitCode;
    item.durationMs = result.durationMs;
    item.output = result.stdout + (result.error ? `\n${result.error}` : '');
    item.artifactIds = artifacts.map((a) => a.id);
    publish();
    return {
      ...record,
      executionRecordId: executionRecord.id,
      stdout:
        record.stdout.length > 16000
          ? record.stdout.slice(-16000) +
            '\n[Earlier output is preserved in the execution record and canvas.]'
          : record.stdout,
    };
  } catch (error) {
    item.status = signal.aborted ? 'cancelled' : 'failed';
    item.output =
      (item.output ?? '') +
      '\n' +
      (signal.aborted
        ? 'Execution stopped.'
        : 'Execution could not complete. Inspect the activity log.');
    const failure = await store.artifact(
      researchId,
      `execution-${crypto.randomUUID()}.json`,
      'application/json',
      Buffer.from(
        JSON.stringify({
          version: 2,
          source: codeArtifact.id,
          sourceHash: codeArtifact.sha256,
          language: request.language,
          inputs: inputs.map((a) => ({ id: a.id, name: a.name, sha256: a.sha256 })),
          exitCode: -1,
          stdout: item.output,
          error: signal.aborted ? 'Cancelled' : 'Execution did not finish',
          artifacts: [],
        }),
      ),
      `Execution record for ${codeArtifact.id}`,
    );
    item.artifactIds = [failure.id];
    publish();
    throw new ExecutionFailure(
      error instanceof Error ? error.message : 'Execution failed',
      failure.id,
    );
  }
}

export interface ExecutionRecord {
  version: 2;
  language: z.infer<typeof Language>;
  source: string;
  sourceHash: string;
  inputs: { id: string; name: string; sha256: string }[];
  environment?: LabResult['environment'];
  exitCode: number;
  stdout: string;
  durationMs: number;
  artifacts: Artifact[];
  executionRecordId: string;
}

export class ExecutionFailure extends Error {
  constructor(
    message: string,
    readonly executionRecordId: string,
  ) {
    super(message);
    this.name = 'ExecutionFailure';
  }
}
