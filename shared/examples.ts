import type { Language } from './protocol';
export const examples: Record<Language, string> = {
  python: `import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# Reproducible bootstrap experiment, not empirical field data.
rng = np.random.default_rng(42)
sample = rng.normal(loc=5, scale=2, size=120)
means = rng.choice(sample, size=(3000, len(sample)), replace=True).mean(axis=1)
low, high = np.quantile(means, [0.025, 0.975])
fig, ax = plt.subplots(figsize=(9, 5), layout='constrained')
ax.hist(means, bins=45, color='#356747', alpha=.8, edgecolor='white')
ax.axvline(low, color='#222222', linestyle='--', label='95% percentile interval')
ax.axvline(high, color='#222222', linestyle='--')
ax.set(title='How certain is the mean?', xlabel='Bootstrap sample mean', ylabel='Resamples')
ax.spines[['top', 'right']].set_visible(False)
ax.legend(frameon=False)
fig.savefig('artifacts/bootstrap.png', dpi=160)
np.savetxt('artifacts/sample.csv', sample, header='value', comments='')
report = f'''# How certain is the mean?

## Question
What does a bootstrap confidence interval look like for a synthetic sample?

## Method
NumPy RNG seed 42, 120 draws from Normal(5, 2), 3,000 bootstrap resamples.

## Results
- Sample mean: {sample.mean():.4f}
- 95% percentile interval: [{low:.4f}, {high:.4f}]

## Limitations
Synthetic, independent observations. This is a reproducible teaching experiment, not evidence about a real population. A nominal 95% interval does not guarantee coverage for this specific sample.

## Reproduce
Run the saved Python source in the Scienfactory lab. The sample CSV and figure accompany this report.
'''
Path('artifacts/bootstrap-report.md').write_text(report)
print(f'Mean = {sample.mean():.4f}; 95% interval = [{low:.4f}, {high:.4f}]')`,
  lean: `import Std

-- A kernel-checked fact about natural numbers.
theorem addition_commutes (a b : Nat) : a + b = b + a := by
  exact Nat.add_comm a b

#print axioms addition_commutes
#eval (List.range 10).foldl (· + ·) 0`,
  latex: `\\documentclass{article}
\\usepackage{amsmath,amssymb,geometry}
\\geometry{margin=1in}
\\title{A short note on uncertainty}
\\author{Scienfactory}
\\date{}
\\begin{document}
\\maketitle
\\begin{abstract}
A minimal, reproducible scientific document compiled in an isolated container.
\\end{abstract}
\\section{The sample mean}
For independent observations with common mean $\\mu$ and finite variance $\\sigma^2$,
\\[\\bar X_n=\\frac{1}{n}\\sum_{i=1}^n X_i,\\qquad
\\operatorname{Var}(\\bar X_n)=\\frac{\\sigma^2}{n}.\\]
\\section{Scope}
This identity depends on independence. Compilation validates the document syntax, not the scientific claims.
\\end{document}`,
  javascript: `const fs = require('fs');
const values = Array.from({length: 101}, (_, i) => ({x: i/10, y: Math.sin(i/10)}));
fs.writeFileSync('artifacts/sine.json', JSON.stringify(values, null, 2));
console.log('Computed', values.length, 'samples of sin(x).');`,
  r: `set.seed(42)
x <- rnorm(100)
png('artifacts/distribution.png', width=1000, height=600)
hist(x, breaks=20, col='#356747', border='white', main='A reproducible normal sample', xlab='Value')
dev.off()
write.csv(data.frame(value=x), 'artifacts/sample-r.csv', row.names=FALSE)
print(summary(x))`,
  graphviz: `digraph Research {
  graph [bgcolor="transparent", rankdir=LR, pad=0.4];
  node [shape=box, style="rounded,filled", fillcolor="#eef4ef", color="#356747", fontname="Helvetica", margin=0.2];
  edge [color="#68716b"];
  Question -> Hypothesis -> Experiment -> Evidence -> Review;
  Review -> Hypothesis [label="refine", style=dashed];
}`,
  blender: `import bpy
import math
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for i in range(24):
    t = i * math.pi / 6
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.14, location=(math.cos(t), math.sin(t), i*0.13-1.5))
    obj = bpy.context.object
    mat = bpy.data.materials.new(name=f'Helix-{i}')
    mat.diffuse_color=(0.14,0.38,0.24,1)
    obj.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath='/workspace/artifacts/helix.glb', export_format='GLB')
print('Exported procedural helix. Illustrative geometry, not a molecular model.')`,
};
