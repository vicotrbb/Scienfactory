import { Store } from '../server/store';
import { present } from '../server/canvas';
import { DockerLab } from '../server/lab';
import type { ToolContext } from '../server/toolkit';
const { root, researchId } = await Bun.file('output/science/live-validation.json').json();
const store = new Store(root);
try {
  const original = await Bun.file('output/science/holdout-validation.json').json();
  const recovered = await Bun.file('output/science/holdout-recovery.json').json();
  const independent = await Bun.file('output/science/independent-holdout.json').json();
  const initialCheck = await Bun.file('output/science/independent-oscillator.json').json();
  const rows = recovered.trials
    .map(
      (t: any) =>
        `| ${t.parameters.zeta} | ${t.parameters.solver} | ${t.metrics.max_abs_disp_error.toExponential(5)} | ${t.metrics.nfev} | ${t.metrics.max_pos_energy_increase} |`,
    )
    .join('\n');
  const content = `# Damped oscillator: evidence audit\n\nFor the dimensionless equation $x''+2\\zeta x'+x=0$, with $x(0)=1$ and $x'(0)=0$, all eight holdout configurations met displacement error $\\leq10^{-5}$ and sampled positive energy increment $\\leq10^{-6}$. These are practical checks for this unit-amplitude model, not rigorous solver bounds.\n\n## Holdout observations\n\nThe time interval was $[0,15]$, with 151 output times, relative tolerance $10^{-7}$ and absolute tolerance $10^{-9}$. The reference was a numerically evaluated matrix exponential.\n\n| Damping | Solver | Maximum displacement error | Function evaluations | Positive energy increment |\n| ---: | --- | ---: | ---: | ---: |\n${rows}\n\nDOP853 used fewer right-hand-side evaluations than Radau in every sampled case. Radau had lower displacement error in these eight cases. Function evaluations alone do not measure total cost: Jacobian evaluations, factorizations and wall time also matter. These observations do not establish a general solver ranking. Energy checks concern sampled outputs, not a continuous-time proof.\n\n## What the audit corrected\n\nThe original 12-case exploratory study used error bounds of 10 and 1. Passing those bounds did not establish useful accuracy. A later local audit checked the saved trajectories against separate underdamped, critical and overdamped closed-form formulas. The original protocol remains unchanged.\n\nThe agent's eight-case holdout saved CSVs outside the exported artifacts directory. Its chat response incorrectly claimed those files were available. A local audit reran the same calculations with only the CSV destination corrected, preserving the original study. All eight metric dictionaries matched exactly. The recovered trajectories are audit reruns, not eight additional independent observations.\n\nThe two replay checks cited in the agent's followup reproduced inspection scripts, not the original verification computations. They establish repeatability of those inspections only. The initial solver replay did reproduce its actual generating computation.\n\n## Independent verification\n\nA separate closed-form implementation checked all 12 original trajectories and all eight recovered holdout trajectories. It required reference discrepancies below $10^{-12}$, displacement error below $10^{-5}$, consistent energy columns, the expected time grids, and positive energy increments below $10^{-6}$. All passed. This is numerical agreement for the sampled linear system, not formal proof or a novelty claim.\n\n## Reproducibility\n\n- Original holdout protocol: ${original.studies[0].protocolArtifactId}\n- Recovered-data protocol: ${recovered.protocolArtifactId}\n- Recovered-data results: ${recovered.artifactId}\n- Original trajectory checks: ${initialCheck.records.map((r: any) => r.executionRecordId).join(', ')}\n- Recovered trajectory checks: ${independent.records.map((r: any) => r.executionRecordId).join(', ')}\n\nExecution records preserve source hashes, exact input versions, Docker image identity, outputs and logs. The phase portrait below belongs to the original exploratory study. This audit was assembled locally from recorded results and is separate from the agent's original response.\n`;
  const ctx: ToolContext = {
    store,
    researchId,
    lab: new DockerLab(),
    agentId: 'independent-validation',
    signal: new AbortController().signal,
    changed: () => {},
    log: () => {},
    delegate: async () => [],
  };
  const phase = store.snapshot(researchId).artifacts.find((a) => a.name === 'phase_plot.png')!;
  const result = await present(
    {
      title: 'Damped oscillator · independently checked evidence',
      content,
      artifactIds: [phase.id, recovered.artifactId],
    },
    ctx,
  );
  await Bun.write('output/science/oscillator-audit.md', content);
  await Bun.write(
    'output/science/final-audit.json',
    JSON.stringify({ researchId, ...result }, null, 2),
  );
  console.log(JSON.stringify({ researchId, audit: result.artifactIds[0] }));
} finally {
  store.close();
}
