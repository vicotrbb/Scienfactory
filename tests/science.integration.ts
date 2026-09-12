import { expect } from 'bun:test';
import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
import type { Trial } from '../server/experiments/study';
import { scienceCases } from './science-cases';
import { mkdirSync } from 'node:fs';
const store = new Store('.data/science-validation');
const research = store.create('Scientific methods · heat, graphs and statistical robustness');
const ctx: ToolContext = {
  store,
  lab: new DockerLab(),
  researchId: research.id,
  agentId: 'validation',
  signal: new AbortController().signal,
  changed: () => {},
  log: () => {},
  delegate: async () => [],
};
const summaries = [];
try {
  store.message(
    research.id,
    'user',
    'Validate parameter studies across heat-equation convergence, exact graph enumeration, and statistical robustness. This local acceptance run uses authored experiment code and actual isolated containers; no provider calls.',
  );
  for (const spec of scienceCases) {
    console.log(`Starting ${spec.title}`);
    const result = (await executeTool('run_study', spec, ctx)) as {
      status: string;
      trials: Trial[];
      artifactId: string;
      figureIds: string[];
    };
    expect(result.status).toBe('completed');
    expect(result.trials.every((t) => t.executionRecordId)).toBe(true);
    if (spec.title.startsWith('Heat')) {
      for (const cfl of [0.2, 0.4]) {
        const rows = result.trials
          .filter((t) => t.parameters.cfl === cfl)
          .sort((a, b) => Number(a.parameters.cells) - Number(b.parameters.cells));
        for (let i = 1; i < rows.length; i++) {
          const ratio = rows[i - 1]!.metrics!.max_error! / rows[i]!.metrics!.max_error!;
          expect(ratio).toBeGreaterThan(3);
          expect(ratio).toBeLessThan(5);
        }
      }
    }
    if (spec.title.startsWith('Statistics')) {
      const nulls = result.trials.filter((t) => t.parameters.contamination === 0);
      const coverage = nulls.reduce((s, t) => s + t.metrics!.coverage!, 0) / nulls.length;
      expect(coverage).toBeGreaterThan(0.92);
      expect(coverage).toBeLessThan(0.98);
      const dirty = result.trials.filter((t) => t.parameters.contamination === 0.02);
      expect(dirty.every((t) => t.metrics!.median_rmse! < t.metrics!.mean_rmse!)).toBe(true);
    }
    const replay = (await executeTool(
      'reproduce_execution',
      { executionRecordId: result.trials[0]!.executionRecordId, title: `Reproduce ${spec.title}` },
      ctx,
    )) as { status: string };
    expect(replay.status).toBe('matched');
    summaries.push({
      title: spec.title,
      trials: result.trials.length,
      status: result.status,
      reproduction: replay.status,
      results: result.trials.map((t) => ({
        parameters: t.parameters,
        repeat: t.repeat,
        metrics: t.metrics,
      })),
    });
    console.log(JSON.stringify(summaries.at(-1)));
  }
  const negative = (await executeTool(
    'run_study',
    {
      ...scienceCases[0],
      title: 'Negative controls · preserve failed and missing metrics',
      factors: [{ name: 'control', values: ['valid', 'outside_bounds', 'missing'] }],
      repeats: 1,
      metrics: [{ name: 'error', unit: '1', min: 0, max: 0.1 }],
      code: "metrics = {'error': .01 if parameters['control']=='valid' else 2} if parameters['control']!='missing' else {}",
    },
    ctx,
  )) as { status: string; trials: Trial[] };
  expect(negative.status).toBe('needs_review');
  expect(negative.trials.map((t) => t.status)).toEqual(['passed', 'failed', 'failed']);
  const mesh = (await executeTool(
    'execute',
    {
      title: 'Heat solution · interactive 3D surface',
      language: 'blender',
      code: `import bpy, math
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
vertices=[]; faces=[]; width=48; depth=24
for j in range(depth+1):
    t=j/depth
    for i in range(width+1):
        x=i/width; vertices.append((2*x,2*t,math.exp(-.1*math.pi**2*t)*math.sin(math.pi*x)))
for j in range(depth):
    for i in range(width):
        a=j*(width+1)+i; faces.append((a,a+1,a+width+2,a+width+1))
mesh=bpy.data.meshes.new('Analytical heat solution'); mesh.from_pydata(vertices,[],faces); mesh.update()
obj=bpy.data.objects.new('u(x,t), alpha=0.1',mesh); bpy.context.collection.objects.link(obj)
material=bpy.data.materials.new('Heat surface'); material.diffuse_color=(.12,.42,.32,1); obj.data.materials.append(material)
bpy.ops.export_scene.gltf(filepath='/workspace/artifacts/heat-surface.glb',export_format='GLB')
print('Analytical sine-mode heat solution surface; x,t plotted with 2x display scale.')`,
    },
    ctx,
  )) as { exitCode: number; artifacts: { id: string }[] };
  expect(mesh.exitCode).toBe(0);
  await executeTool(
    'present',
    {
      title: 'Heat diffusion in space and time',
      caption:
        'Analytical sine-mode reference: x and t are displayed at 2x scale; vertical height is dimensionless temperature. This surface is the comparison target, not a second numerical solver.',
      artifactIds: mesh.artifacts.map((a) => a.id),
    },
    ctx,
  );
  store.message(
    research.id,
    'assistant',
    'Three local studies completed with 32 passing computational trials, exact reruns in their recorded containers, and three explicit negative controls retained for inspection. The 3D surface shows the analytic heat reference. These are instrument acceptance tests with authored code, not live-provider research or scientific novelty claims.',
  );
  store.updateResearch(research.id, { status: 'completed' });
  mkdirSync('output/science', { recursive: true });
  await Bun.write(
    'output/science/validation.json',
    JSON.stringify(
      {
        researchId: research.id,
        summaries,
        negativeControls: negative.trials.map((t) => ({ status: t.status, error: t.error })),
        threeD: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      researchId: research.id,
      passedTrials: summaries.reduce((n, s) => n + s.trials, 0),
      negativeControls: 3,
      exactReruns: 3,
      threeD: true,
    }),
  );
} finally {
  store.close();
}
