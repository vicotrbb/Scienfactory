/** Available recipes use installed instruments; the executable tool remains general-purpose. */
export const instruments = [
  {
    id: 'combinatorics',
    name: 'Combinatorics & discrete structures',
    tools: 'Python itertools, collections, math, NetworkX, SymPy; Lean / Mathlib',
    methods:
      'Exhaustive enumeration, recurrence discovery, generating functions, graph invariants, counterexample search, bijections and formal proofs.',
    recipe:
      'import itertools, math\nfrom collections import Counter\n# Replace this property with the conjecture under investigation.\nfor n in range(1, 8):\n    counts = Counter(sum(p[i] > p[i+1] for i in range(n-1)) for p in itertools.permutations(range(n)))\n    print(n, dict(sorted(counts.items())), flush=True)',
  },
  {
    id: 'symbolic',
    name: 'Symbolic mathematics',
    tools: 'SymPy, Lean / Mathlib',
    methods:
      'Exact algebra, integration, differentiation, series, number theory, recurrence solving and machine-checked theorems.',
    recipe:
      "import sympy as s\nx = s.symbols('x')\nf = s.sin(x) / x\nprint(s.series(f, x, 0, 12))\nprint(s.integrate(s.exp(-x*x), (x, -s.oo, s.oo)))",
  },
  {
    id: 'statistics',
    name: 'Statistics & experimental design',
    tools: 'NumPy, SciPy, pandas, R, matplotlib',
    methods:
      'Seeded Monte Carlo, resampling, uncertainty estimation, power analysis, sensitivity sweeps, held-out validation and controls.',
    recipe:
      "import numpy as np\nfrom scipy.stats import bootstrap\nrng = np.random.default_rng(2026)\nx = rng.exponential(size=100)\nresult = bootstrap((x,), np.mean, rng=rng, n_resamples=2000)\nprint('Mean:', x.mean(), '95% interval:', result.confidence_interval)",
  },
  {
    id: 'optimization',
    name: 'Optimization & search',
    tools: 'SciPy optimize, NumPy, SymPy',
    methods:
      'Linear and mixed-integer programs, nonlinear optimization, root finding, exhaustive baselines and algorithm comparisons.',
    recipe:
      "from scipy.optimize import linprog\nresult = linprog([-3, -2], A_ub=[[1, 1], [2, 1]], b_ub=[4, 6], bounds=(0, None))\nprint(result.message)\nprint('Solution:', result.x, 'Objective:', -result.fun)",
  },
  {
    id: 'simulation',
    name: 'Physical & dynamical systems',
    tools: 'SciPy integrate/signal/fft, NumPy, matplotlib, Blender',
    methods:
      'ODE models, numerical PDE discretizations, stochastic processes, signal analysis, dimensional analysis and convergence studies.',
    recipe:
      "import numpy as np\nfrom scipy.integrate import solve_ivp\nimport matplotlib.pyplot as plt\ns = solve_ivp(lambda t,y: [y[1], -y[0]], (0, 30), [1,0], t_eval=np.linspace(0,30,1000), rtol=1e-9, atol=1e-11)\nplt.plot(s.t, s.y[0]); plt.xlabel('Time'); plt.ylabel('Displacement')\nplt.savefig('artifacts/oscillator.png', dpi=160)\nprint('Maximum energy drift:', np.max(np.abs((s.y**2).sum(axis=0)-1)))",
  },
  {
    id: 'learning',
    name: 'Data science & machine learning',
    tools: 'pandas, scikit-learn, SciPy, NumPy',
    methods:
      'Data validation, classification, regression, clustering, cross-validation, leakage checks, feature ablations and benchmarks.',
    recipe:
      "from sklearn.datasets import load_iris\nfrom sklearn.model_selection import cross_val_score, StratifiedKFold\nfrom sklearn.ensemble import RandomForestClassifier\nx,y = load_iris(return_X_y=True)\nscores = cross_val_score(RandomForestClassifier(random_state=7), x,y, cv=StratifiedKFold(5, shuffle=True, random_state=7))\nprint('Held-out accuracies:', scores, 'Mean:', scores.mean())",
  },
  {
    id: 'networks',
    name: 'Networks & complex systems',
    tools: 'NetworkX, Graphviz, SciPy sparse',
    methods:
      'Graph construction, paths, isomorphism, spectral structure, randomized networks and network visualizations.',
    recipe:
      "import networkx as nx\nimport matplotlib.pyplot as plt\ng = nx.petersen_graph()\nprint('Vertices:', len(g), 'Edges:', g.number_of_edges(), 'Diameter:', nx.diameter(g))\nnx.draw(g, nx.spring_layout(g, seed=7), with_labels=True)\nplt.savefig('artifacts/network.png', dpi=160)",
  },
  {
    id: 'media',
    name: 'Visual explanations & interactive experiments',
    tools: 'Standalone HTML/CSS/JavaScript, SVG, matplotlib, Blender, ffmpeg, Graphviz',
    methods:
      'Interactive sliders, canvas animations, geometric constructions, diagrams, CPU rendering, GLB models, audio and video. Use present for inline HTML/SVG; no external CDN dependencies.',
    recipe:
      '<!doctype html><html><body><label>Turns <input id="turns" type="range" min="2" max="20" value="8"></label><canvas id="view" width="640" height="440"></canvas><script>const c=view.getContext("2d");function draw(){c.clearRect(0,0,640,440);c.beginPath();for(let t=0;t<Number(turns.value)*Math.PI*2;t+=.02){let r=t*3;c.lineTo(320+r*Math.cos(t),220+r*Math.sin(t));}c.strokeStyle="#34824b";c.lineWidth=2;c.stroke();}turns.oninput=draw;draw();</script></body></html>',
  },
  {
    id: 'documents',
    name: 'Literature & scientific writing',
    tools: 'Crossref, public HTTPS retrieval, pypdf, LaTeX, Markdown / KaTeX',
    methods:
      'Prior-art search, source comparison, uploaded PDF extraction, evidence tables, executable reports and PDF papers.',
    recipe:
      "from pypdf import PdfReader\nfrom pathlib import Path\nfor path in Path('inputs').glob('*.pdf'):\n    reader = PdfReader(path)\n    print(path.name, 'pages:', len(reader.pages))\n    for page in reader.pages[:5]: print((page.extract_text() or '')[:6000])",
  },
] as const;
