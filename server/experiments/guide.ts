export const RESEARCH_GUIDE = {
  workflow: [
    'Frame a tractable question and a falsifiable hypothesis. Distinguish exploratory work from confirmatory testing. Define a meaningful baseline or null model.',
    'Declare factors, ranges, primary metrics, units, meaningful checks with rationale, random seeds, repeat counts and stopping limits before executing a study. Save exclusions and analysis changes as new versions. A local protocol is not external preregistration.',
    'Use run_study for Python parameter grids, simulation replicates, sensitivity, ablations and convergence. It supplies parameters, seed and a NumPy rng; assign a finite numeric metrics dictionary. Declare requiredOutputs for raw data and diagnostic files; use the same filename in each isolated trial and distinguish them by artifact ID. It retains failed cases, exact input versions, source, worker image, outputs and summary charts.',
    'Use independent implementations or analytic cases to check the computation. Use reproduce_execution to replay an actual execution under its recorded image and inputs and compare exact file bytes and stdout. Reproduction is not independent replication; timestamps and nondeterminism can cause harmless byte differences.',
    'Assess practical magnitude, uncertainty and robustness, not only statistical significance or a small residual. Distinguish stochastic variation, discretization error, parameter uncertainty and physical/model error.',
    'Challenge the result with negative controls, counterexamples, edge cases and plausible alternative explanations. Report every prespecified condition and failed run. Do not silently select successful cases or change thresholds after seeing outcomes.',
    'Deliver the question, methods, exact numbers, visuals, code/data lineage, independent checks, and scoped conclusions. Label conjectures, limitations, untested variants and failed controls clearly. Use article_guide for manuscripts.',
  ],
  areas: {
    numerical: {
      methods: [
        'analytical reference solutions',
        'grid/time-step convergence',
        'conservation laws',
        'conditioning',
        'independent residual/energy checks',
      ],
      pitfalls: [
        'A solver success flag is not physical validation.',
        'Check scaling and units before interpreting magnitudes.',
        'Refine spatial and temporal resolution separately.',
      ],
    },
    statistics: {
      methods: [
        'effect sizes and intervals',
        'simulation calibration under the null',
        'paired or independent sampling designs',
        'permutation/bootstrap under explicit assumptions',
        'multiple-comparison correction',
        'sensitivity to missingness',
      ],
      pitfalls: [
        'A p-value is not the probability a hypothesis is true.',
        'Do not treat repeated simulations or dependent rows as independent experimental subjects.',
        'Shared seeds across study cases produce paired comparisons.',
        'Do not infer a confidence interval from a small number of deterministic repeats.',
      ],
    },
    combinatorics: {
      methods: [
        'exhaustive small instances',
        'independent recurrence and brute force',
        'symmetry reduction',
        'counterexample search',
        'exact arithmetic',
        'Lean formalization of a precise statement',
      ],
      pitfalls: [
        'Finite enumeration does not prove a general theorem.',
        'Check duplicate counting and labeled versus unlabeled conventions.',
        'Separate known identities from novelty claims.',
      ],
    },
    learning: {
      methods: [
        'held-out baselines',
        'stratified/group/time-aware splits',
        'feature and model ablations',
        'nested validation for tuning',
        'calibration and failure slices',
      ],
      pitfalls: [
        'Split before preprocessing.',
        'Keep the final test set out of model selection.',
        'Report run-to-run variation and label leakage.',
      ],
    },
    dynamical: {
      methods: [
        'equilibria and local stability',
        'conservation/positivity',
        'parameter sensitivity',
        'stiff/nonstiff solver comparison',
        'phase portraits and bifurcation hypotheses',
      ],
      pitfalls: [
        'Check transient length and initial-condition sensitivity.',
        'A fitted dynamical model does not establish causality or clinical applicability.',
      ],
    },
    optimization: {
      methods: [
        'feasible baseline',
        'constraint residuals',
        'duality bounds where applicable',
        'multiple starts',
        'scaling and tolerance sensitivity',
        'small exact instances',
      ],
      pitfalls: [
        'A local optimum need not be global.',
        'Report infeasible/failed solver outcomes.',
        'Do not compare objective values with incompatible constraints.',
      ],
    },
  },
  recipe: {
    title: 'Numerical integration convergence',
    question: 'How does a trapezoidal integral converge to the exact integral of x squared?',
    hypothesis: 'Error decreases by approximately four when the number of panels doubles.',
    limitations:
      'Smooth one-dimensional polynomial with a known integral; not evidence for arbitrary integrands.',
    factors: [{ name: 'panels', values: [8, 16, 32] }],
    metrics: [{ name: 'absolute_error', unit: 'dimensionless', min: 0, max: 0.01 }],
    repeats: 1,
    seed: 7,
    code: "x = np.linspace(0, 1, int(parameters['panels']) + 1)\nvalue = np.trapezoid(x*x, x)\nmetrics = {'absolute_error': float(abs(value - 1/3))}",
  },
};
