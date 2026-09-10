import { DockerLab } from '../server/lab';
const lab = new DockerLab();
const capabilities = await lab.capabilities();
if (!capabilities.mathlib)
  throw new Error('Select the Mathlib image with LAB_IMAGE=scienfactory-lab:mathlib.');
const result = await lab.execute(
  {
    language: 'lean',
    code: `import Mathlib.Data.Real.Basic
import Mathlib.Tactic.Linarith

theorem square_nonnegative (x : ℝ) : 0 ≤ x ^ 2 := by
  nlinarith [sq_nonneg x]

#print axioms square_nonnegative
`,
  },
  new AbortController().signal,
);
console.log(
  JSON.stringify({
    mathlib: capabilities.mathlib,
    exitCode: result.exitCode,
    stdout: result.stdout,
    durationMs: result.durationMs,
  }),
);
if (result.exitCode !== 0) throw new Error('Mathlib proof failed.');
