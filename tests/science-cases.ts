import type { Study } from '../server/experiments/study';
export const scienceCases: Study[] = [
  {
    title: 'Heat equation · numerical convergence',
    question:
      'Does an explicit finite-difference heat solver approach its known smooth solution as the grid is refined?',
    hypothesis:
      'Maximum error decreases approximately quadratically with spatial spacing when the time step scales with spacing squared.',
    limitations:
      'Dimensionless one-dimensional heat equation, smooth sine initial data, zero boundary values, diffusivity 0.1 and final time 0.2. This does not validate physical heat-transfer parameters or arbitrary initial conditions.',
    factors: [
      { name: 'cells', values: [16, 32, 64] },
      { name: 'cfl', values: [0.2, 0.4] },
    ],
    metrics: [
      { name: 'max_error', unit: 'temperature', min: 0, max: 0.004 },
      { name: 'minimum', unit: 'temperature', min: 0, max: 1 },
      { name: 'effective_cfl', unit: '1', min: 0, max: 0.5 },
    ],
    repeats: 1,
    seed: 17,
    inputArtifactIds: [],
    requiredOutputs: [],
    code: `cells = int(parameters['cells'])
alpha, final = .1, .2
x = np.linspace(0, 1, cells+1); dx = 1/cells
steps = int(np.ceil(final/(parameters['cfl']*dx*dx/alpha)))
dt = final/steps; r = alpha*dt/(dx*dx)
u = np.sin(np.pi*x); u[[0,-1]] = 0
for step in range(steps):
    v = u.copy(); v[1:-1] = u[1:-1] + r*(u[2:] - 2*u[1:-1] + u[:-2]); u = v
exact = np.exp(-alpha*np.pi**2*final)*np.sin(np.pi*x)
assert np.isfinite(u).all() and u.max() <= 1+1e-12
metrics = {'max_error':float(np.max(np.abs(u-exact))), 'minimum':float(u.min()), 'effective_cfl':float(r)}
`,
  },
  {
    title: 'Graph theory · independent tree counts',
    question:
      'Do exact Laplacian cofactors and independent edge-subset enumeration agree on the number of spanning trees?',
    hypothesis: 'The two methods agree for every selected cycle and complete graph.',
    limitations:
      'Finite labeled simple graphs on 3 to 6 vertices. This tests implementations of established identities; it is not a new proof of the matrix-tree theorem or Cayley formula.',
    factors: [
      { name: 'vertices', values: [3, 4, 5, 6] },
      { name: 'family', values: ['cycle', 'complete'] },
    ],
    metrics: [
      { name: 'trees', unit: 'count', min: 1 },
      { name: 'disagreement', unit: 'count', min: 0, max: 0 },
    ],
    repeats: 1,
    seed: 23,
    inputArtifactIds: [],
    requiredOutputs: [],
    code: `from itertools import combinations
from sympy import Matrix
n = int(parameters['vertices'])
edges = list(combinations(range(n),2)) if parameters['family']=='complete' else [(i,(i+1)%n) for i in range(n)]
lap = [[0]*n for _ in range(n)]
for i,j in edges:
    lap[i][i]+=1; lap[j][j]+=1; lap[i][j]-=1; lap[j][i]-=1
cofactor = int(Matrix([r[:-1] for r in lap[:-1]]).det())
count = 0
for candidate in combinations(edges,n-1):
    parent = list(range(n))
    def root(i):
        while parent[i]!=i: i=parent[i]
        return i
    acyclic=True
    for i,j in candidate:
        a,b=root(i),root(j)
        if a==b: acyclic=False; break
        parent[a]=b
    if acyclic: count+=1
expected = n**(n-2) if parameters['family']=='complete' else n
assert count == expected
metrics = {'trees':count, 'disagreement':abs(count-cofactor)}
`,
  },
  {
    title: 'Statistics · robustness and interval calibration',
    question:
      'How do rare positive outliers change estimator error and empirical Student-interval coverage?',
    hypothesis:
      'The median is less sensitive to outliers around the uncontaminated center; nominal mean intervals may lose finite-sample coverage for skewed mixtures.',
    limitations:
      'Synthetic independent Gaussian observations with a Bernoulli positive shift of 10. RMSE targets the uncontaminated center zero; interval coverage targets the true mixture mean 10 times the contamination probability. 600 simulated samples per trial; repeated seeds are computational replicates, not subjects.',
    factors: [
      { name: 'sample_size', values: [20, 80, 320] },
      { name: 'contamination', values: [0, 0.02] },
    ],
    metrics: [
      { name: 'mean_rmse', unit: 'signal', min: 0 },
      { name: 'median_rmse', unit: 'signal', min: 0 },
      { name: 'coverage', unit: 'fraction', min: 0, max: 1 },
    ],
    repeats: 3,
    seed: 101,
    inputArtifactIds: [],
    requiredOutputs: [],
    code: `from scipy.stats import t
n = int(parameters['sample_size']); contamination = parameters['contamination']
x = rng.normal(size=(600,n)) + 10*(rng.random((600,n)) < contamination)
means = x.mean(axis=1); medians = np.median(x,axis=1)
half = t.ppf(.975,n-1)*x.std(axis=1,ddof=1)/np.sqrt(n)
true_mean = 10*contamination
coverage = np.mean(np.abs(means-true_mean) <= half)
metrics = {'mean_rmse':float(np.sqrt(np.mean(means**2))), 'median_rmse':float(np.sqrt(np.mean(medians**2))), 'coverage':float(coverage)}
`,
  },
];
