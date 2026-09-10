import { chromium, expect } from '@playwright/test';
import { createApp } from '../server/app';
import { DockerLab } from '../server/lab';
import { resolve } from 'node:path';
import { defaultLimits } from '../shared/protocol';

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');
const runtime = createApp({
  root: resolve('.data/engineering-validation'),
  port: 4315,
  production: true,
});
runtime.app.listen({ hostname: '127.0.0.1', port: 4315 });
const research = process.env.RESEARCH_ID
  ? runtime.store.requireResearch(process.env.RESEARCH_ID)
  : runtime.store.create('Engineering stress test · spatial truss design');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1512, height: 1000 },
  colorScheme: 'light',
});
await page.addInitScript((id) => {
  if (window === window.top) localStorage.setItem('scienfactory.research', id);
}, research.id);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
let frames = 0,
  preparing = false,
  runningCanvas = false;
page.on('websocket', (socket) =>
  socket.on('framereceived', (frame) => {
    try {
      const event = JSON.parse(String(frame.payload));
      if (event.type === 'snapshot' || event.type === 'patch') {
        frames++;
        const s = runtime.store.snapshot(research.id);
        preparing ||= s.tools.some((t) => t.preparing);
        runningCanvas ||= s.canvas.some((c) => c.status === 'running');
      }
    } catch {}
  }),
);
const prompt = process.env.FOLLOW_UP_FILE
  ? await Bun.file(process.env.FOLLOW_UP_FILE).text()
  : `Conduct a substantial computational engineering investigation: how does the depth of a triangulated spatial cantilever truss trade material volume against vertical deflection? This is a mathematical linear-elastic model, not a construction design.
Use multiple independent perspectives: delegate a bounded mechanics/verification review and a bounded mathematical scaling/experimental-design review while you lead the numerical experiments. Keep the work practical and finish all deliverables below. Publish and update a plan and use the canvas throughout.
Choose a stable small 3D pin-jointed truss with roughly 16–24 nodes, fixed nodes at x=0, positive constant E and A, and downward nodal loads at the other end. State SI units. Triangulate all necessary faces/cells to avoid mechanisms. Compare at least three depths under the same total load, using assembled axial-bar stiffness. Verify support reaction balance, free-DOF residual, positive strain energy and work-energy consistency, linear load scaling, and the analytical single-bar displacement FL/(EA). Use a small first case and print/checkpoint progress; each job has 110 seconds.
Save the final chosen structure as artifacts/structure.json with EXACT fields: nodes (array of [x,y,z]), edges (array of [nodeIndex,nodeIndex]), E (number in Pa), A (number in m²), fixedDofs (array of global indices 3*node+axis), forces (flat 3*N array), displacements (flat 3*N array). This schema will be independently checked by the test harness.
Save artifacts/engineering-results.json with the comparison data and verification outcomes. Render clear PNG charts of depth versus tip deflection and material volume. Create a real Blender GLB model of the actual chosen truss (cylinders for members and spheres for joints; distinguish tension/compression if computed), loading structure.json as an input artifact. Present the GLB and graphs on the canvas, and create a standalone HTML explanation with a working slider showing how load scaling changes a computed curve or deformed shape. No external CDN libraries.
Exercise failure recovery once: run a deliberately failing assertion labeled 'Intentional negative control', observe the nonzero exit, then run the corrected check. Label that expected failure explicitly in the report; never hide it.
Finish with engineering-report.md documenting methods, actual numbers, independent reviews, assumptions, limits of the truss idealization, and reproducible artifact IDs. Avoid unnecessary additional literature searches; one authoritative mechanics reference or a clearly derived formulation is sufficient. Use tools to produce these deliverables, not just descriptions.`;
try {
  await page.goto('http://127.0.0.1:4315');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  if (!process.env.RESEARCH_ID || process.env.FOLLOW_UP_FILE)
    runtime.engine.start(
      research.id,
      prompt,
      {
        provider: 'openai',
        model: 'gpt-5-mini',
        limits: {
          ...defaultLimits,
          maxAgents: 6,
          concurrency: 3,
          maxSteps: 28,
          maxOutputTokens: 10000,
          tokenBudget: 700000,
        },
      },
      process.env.OPENAI_API_KEY,
    );
  const start = Date.now();
  let lastLog = 0;
  let saved = false;
  while (runtime.engine.busy(research.id)) {
    await page.waitForTimeout(1000);
    const s = runtime.store.snapshot(research.id);
    if (Date.now() - start > 720000) {
      runtime.engine.cancel(research.id);
      throw new Error('Engineering validation exceeded 12-minute deadline.');
    }
    if (!saved && s.canvas.some((c) => c.status === 'running')) {
      await page.screenshot({ path: '/private/tmp/scienfactory-engineering-working.png' });
      saved = true;
    }
    if (Date.now() - lastLog > 15000) {
      lastLog = Date.now();
      console.log(
        JSON.stringify({
          elapsed: Math.floor((Date.now() - start) / 1000),
          agents: s.agents.map((a) => ({ name: a.name, status: a.status, phase: a.phase })),
          canvas: s.canvas.length,
          artifacts: s.artifacts.map((a) => a.name),
          tools: s.tools.length,
        }),
      );
    }
  }
  const result = runtime.store.snapshot(research.id);
  console.log(
    JSON.stringify({
      researchId: research.id,
      status: result.research.status,
      frames,
      preparing,
      runningCanvas,
      tools: result.tools.map((t) => ({ name: t.name, status: t.status })),
      files: result.artifacts.map((a) => ({ name: a.name, id: a.id, sha256: a.sha256 })),
      usage: result.runs.map((r) => ({
        input: r.inputTokens,
        output: r.outputTokens,
        error: r.error,
      })),
    }),
  );
  if (result.research.status !== 'completed')
    throw new Error('Engineering research did not complete.');
  const structure = [...result.artifacts].reverse().find((a) => a.name === 'structure.json');
  if (!structure) throw new Error('Missing structure.json');
  const data = await runtime.store.readArtifact(research.id, structure.id);
  const verification = await new DockerLab().execute(
    {
      language: 'python',
      inputs: [{ name: 'structure.json', data: data.data }],
      code: `import json, numpy as np
s=json.load(open('inputs/structure.json'))
x=np.asarray(s['nodes'],float); u=np.asarray(s['displacements'],float).reshape((-1,3)); f=np.asarray(s['forces'],float).reshape((-1,3))
assert x.shape==u.shape==f.shape and x.shape[1]==3
E,A=float(s['E']),float(s['A']); assert E>0 and A>0
internal=np.zeros_like(x); energy=0.
for i,j in s['edges']:
 d=x[j]-x[i]; L=np.linalg.norm(d); assert L>0
 n=d/L; extension=np.dot(u[j]-u[i],n); N=E*A/L*extension
 internal[i]-=N*n; internal[j]+=N*n
 energy+=.5*E*A/L*extension**2
fixed=np.array(s['fixedDofs'],int); free=np.setdiff1d(np.arange(x.size),fixed)
assert len(fixed)>0 and len(free)>0
assert np.max(np.abs(u.ravel()[fixed]))<1e-10
residual=(internal-f).ravel()
relative=np.linalg.norm(residual[free])/max(1,np.linalg.norm(f))
work=float(np.sum(f*u)); reactions=np.zeros(x.size); reactions[fixed]=residual[fixed]
force_balance=np.linalg.norm(reactions.reshape((-1,3)).sum(axis=0)+f.sum(axis=0))/max(1,np.linalg.norm(f))
assert relative<1e-7, relative
assert force_balance<1e-7, force_balance
assert energy>0 and abs(2*energy-work)/max(1e-20,abs(work))<1e-7
print(json.dumps({'nodes':len(x),'members':len(s['edges']),'relativeResidual':relative,'forceBalance':force_balance,'strainEnergy':energy,'externalWork':work,'independentVerification':'passed'}))`,
    },
    new AbortController().signal,
  );
  console.log(JSON.stringify({ independentMechanics: verification }));
  if (verification.exitCode !== 0) throw new Error('Independent mechanics verification failed.');
  for (const name of ['engineering-results.json', 'engineering-report.md'])
    if (!result.artifacts.some((a) => a.name === name)) throw new Error(`Missing ${name}`);
  const glb = [...result.artifacts].reverse().find((a) => a.name.endsWith('.glb'));
  const png = [...result.artifacts].reverse().find((a) => a.mime === 'image/png');
  const html = [...result.artifacts].reverse().find((a) => a.mime === 'text/html');
  if (!glb || !png || !html) throw new Error('Missing 3D, graph, or interactive output.');
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('button', { name: new RegExp(glb.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .first()
    .click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: '/private/tmp/scienfactory-engineering-3d.png' });
  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByRole('button', { name: new RegExp(png.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
    .first()
    .click();
  await expect(page.getByRole('img', { name: png.name, exact: true })).toBeVisible();
  await page.screenshot({ path: '/private/tmp/scienfactory-engineering-graph.png' });
  await page.getByRole('tab', { name: 'Canvas', exact: true }).click();
  await page.screenshot({ path: '/private/tmp/scienfactory-engineering-canvas.png' });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ browser3D: true, browserGraph: true, errors }));
} finally {
  await browser.close();
  await runtime.shutdown();
}
