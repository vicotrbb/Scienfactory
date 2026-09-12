# Scientific studies and reproducibility validation

Validated locally on 12 September 2026. This extends the existing research workspace through agent tools and the live canvas. No new settings or panels are required.

## Implemented capabilities

- `run_study`: parameter grids, repeated simulations, convergence and ablation workflows. Up to 48 total trials, six factors and six numerical metrics. Each trial receives a paired repeat seed and a NumPy generator. Two trials are scheduled concurrently through the existing global worker pool.
- Immutable protocols saved before execution, with input versions, hypotheses, criteria and rationale. Live canvas reports display progress, every outcome and failure reason, criteria, comparison figures, CSV and JSON. A local protocol is not external preregistration.
- Required nonempty output filenames per trial. Missing files fail the declared checks while preserving valid metrics and execution evidence. Outputs belong under `artifacts/`.
- `reproduce_execution`: original source and input versions, recorded Docker image identity, full console-output comparison and output hashes. Legacy records without sufficient provenance and unavailable images are refused. Matching inspections does not reproduce the computation that generated the inspected file.
- Artifact SHA-256 and byte-count verification on reads. Duplicate input/output filenames are rejected. New execution filenames use UUIDs to avoid collisions during parallel runs.
- NumPy scalar normalization and rejection of exact integer metrics outside JavaScript's safe-integer range. Exact large integers should be preserved separately as strings. Formula-like CSV text cells are escaped for spreadsheet use; JSON retains the original values.
- `research_guide`: methods, controls, pitfalls and recipes for numerical analysis, statistics, combinatorics, learning, dynamics and optimization.

Execution lifecycle, studies, replay and method guidance are separate modules under `server/experiments/`. They use the same persistence, cancellation, Docker scheduling and canvas services as ordinary executions. The existing container restrictions remain in force.

## Stress studies

| Investigation                      | Trials | Evidence                                                                                                                                                                                   |
| ---------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One-dimensional heat diffusion     |      6 | Finite differences at three mesh sizes and two stable time-step ratios; error reduction between 3x and 5x on mesh refinement against the sine-mode solution                                |
| Graph spanning-tree counts         |      8 | Exact Laplacian cofactors independently checked by edge-subset enumeration and connectivity; cycles and complete graphs of 3–6 vertices                                                    |
| Statistical robustness             |     18 | Three sample sizes, clean and contaminated synthetic populations, three seeds; 600 Monte Carlo samples per trial; mean/median error and interval coverage checked for their stated targets |
| Live OpenAI oscillator exploration |     12 | RK45, DOP853 and Radau across underdamped, critical and overdamped cases, phase portrait and recorded trajectories                                                                         |
| Live OpenAI oscillator holdout     |      8 | New damping values, tighter declared criteria and recorded results                                                                                                                         |

All 52 research trials completed. The local study suite also included three control cases: one valid, one outside the declared bounds, and one missing metrics. The latter two correctly failed. A separate precision check accepted a NumPy integer scalar and rejected an unsafe exact integer.

A Blender-generated GLB displays the analytical heat solution as an interactive surface. Its caption explicitly distinguishes this reference surface from numerical-solver output. Three local generating computations and one live oscillator computation matched exact replay. The live followup also matched two inspection replays, which are narrower evidence.

### What the live agent test exposed

The first oscillator study chose overly broad acceptance bounds. The application ran it correctly, but passing those bounds did not establish useful accuracy. Criteria and rationales now appear explicitly in the canvas. A second study used displacement error at most `1e-5` and sampled positive energy increment at most `1e-6` for the unit-amplitude toy system.

The holdout agent saved trajectories outside `artifacts/`, then incorrectly claimed those files were available. This prompted the required-output contract and a stronger final-deliverable instruction. A local eight-case audit changed only the CSV destination, recovered the trajectories, and reproduced all eight original metric dictionaries exactly. Those audit reruns are not additional independent research observations. Original protocols, results and agent responses were preserved.

Separate closed-form formulas checked all 12 original trajectories and all eight recovered holdout trajectories. Reference differences were below `1e-12`, displacement errors below `1e-5`, and sampled energy increments below `1e-6`. The check also validated time grids and saved energy columns. See [the corrected evidence audit](../output/science/oscillator-audit.md). It explicitly corrects the agent's missing-file and replay-scope claims.

The two actual OpenAI `gpt-5-mini` runs reported 364,288 total tokens. They used an initially empty synthetic research workspace and the previously approved application key. The older article-generation test involving existing truss files was not run as part of this validation.

## Application checks

- 42 backend tests, including the 48-trial scheduling ceiling, cancellation, missing deliverables, full-output replay, corrupt blobs, ownership boundaries and the existing 256-agent deterministic orchestration test.
- 10 Chromium acceptance tests, including streaming studies, negative controls, replay, CSV, reload, accessibility, publication rendering, isolated HTML and a simulated 256-agent WebSocket workload.
- TypeScript checking and production Vite build passed.
- Actual imported research workspaces inspected in Chromium: study figures and tables, light/dark accessibility, mobile layout, interactive GLB, rendered mathematics, corrected report and phase portrait. No page errors.
- Real Docker runtime suite passed for Python, JavaScript, R, Lean, LaTeX, Blender and Graphviz, including proof-hole rejection, isolation, cancellation, Unicode and MP4 handling.

The scientific worker used image `sha256:50e0121ba0e882e7c019a37b4fd94503697cbf6d1f160f230eb996056b3e75c8` on `linux/arm64`. Scientific CI now runs the multi-subject and precision suites as well as the existing runtime, file and article checks. CI itself has not been run remotely for these uncommitted changes.

## Inspect and repeat

The completed workspaces are imported into the running local application:

- [Heat, graphs and statistics](http://127.0.0.1:5173/?research=7e15a47d-56f8-4f1b-b1e5-4e6ce45569de)
- [Live oscillator investigation and independent audit](http://127.0.0.1:5173/?research=6a628b91-737b-43ab-ae7d-080992109b5f)

These links depend on this installation's local data. Portable result summaries and verification records are under `output/science/`; full sources, input versions and artifacts remain in the corresponding local research stores.

```sh
bun run check
bun run test:e2e
bun run test:lab
bun run test:science
bun run test:study-precision

# Explicit provider-credit usage, using a fresh workspace:
bun run test:science-live
bun tests/verify-oscillator.ts
bun run test:science-followup

# Audit the followup if it reproduces the observed output-path issue:
bun tests/holdout-recovery.ts
bun tests/verify-oscillator.ts --holdout
bun tests/finalize-science.ts
```

Live LLM output is nondeterministic. The recovery script asserts the specific source pattern before changing the output destination; it will refuse a different generated implementation. Import a newly completed research with `scripts/import-validation.ts` before using `test:science-review`. Existing target research is never overwritten by that importer.

## Interpretation boundaries

Passing declared bounds does not establish that the bounds are scientifically meaningful. Required files establish delivery, not semantic correctness. Exact replay is distinct from independent implementation, replication, formal proof and physical validation. These studies support the stated computations for the tested inputs; they make no novelty claim or universal assertion about solver quality.

API and runtime references: [SciPy solve_ivp](https://docs.scipy.org/doc/scipy-1.15.3/reference/generated/scipy.integrate.solve_ivp.html), [NumPy Generator](https://numpy.org/doc/2.2/reference/random/generator.html), and [Docker image inspection](https://docs.docker.com/reference/cli/docker/image/inspect/).
