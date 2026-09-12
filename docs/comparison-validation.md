# Paired comparisons, evidence lineage and LAN validation

Local validation on 12 September 2026, extending the existing chat and canvas without adding settings panels.

## New research tools

`compare_study` resolves an actual stored study and its original protocol, checks every selected trial against its execution record and metrics file, pairs repeats by recorded seed, and refuses missing or duplicated observations. It keeps finite metrics from trials that failed declared bounds, avoiding success-only selection. Reports show comparison-minus-baseline differences, all observations, criteria outcomes and explicit interpretation limits.

For randomized repeats, the tool uses SciPy's BCa bootstrap for the mean paired difference with 9,999 resamples and a fixed analysis seed. It withholds intervals for fewer than six pairs or constant differences; deterministic mode is descriptive only. Intervals are exploratory, assume independent repeat inputs and valid pairing, and are not adjusted for multiple comparisons. There is no p-value or automatic claim of scientific significance. The shared 48-trial ceiling now permits 24 repeats for a two-case design. [SciPy method documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html).

`trace_artifact` follows actual execution generators, source and input versions. It validates content hashes and displays a Graphviz diagram. Authored/imported files have explicitly unknown generating computations. Traversal is bounded to 40 files and six levels; truncated graphs report partial status. This audits recorded ancestry, not the truth or meaning of a scientific claim.

Shared execution-record validation now checks source, input and output identity before replay or downstream analysis. Computation remains inside existing isolated workers. Comparison inputs include the original study and protocol artifacts alongside the selected paired observations.

## Scientific stress cases

All experiment code was authored locally and executed in real Docker containers. No provider calls or new API expenditure were involved in this turn.

| Subject                 | Design                                                                                       | Independent checks and observed result                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Signal processing       | Moving average versus Savitzky–Golay, eight paired noise seeds, known two-frequency waveform | Error measured against known signal outside edge transients; mean RMSE difference -0.0847783 amplitude units for this configuration    |
| Assignment optimization | Greedy allocation versus exact assignment, eight random 8-by-8 cost matrices                 | Separate subset dynamic programming verifies the optimum and one-to-one constraints; exact assignment has no positive optimality gap   |
| Numerical mechanics     | Explicit Euler versus velocity Verlet, eight paired initial phases, 400 fixed steps          | Analytic oscillator displacement and initial-energy references; mean energy-drift difference -0.857201 for this step size and interval |

These are 48 research trials. Three comparison executions reproduced their saved files and console output exactly. Each subject also produced a diagnostic figure and a source/input lineage diagram.

A 16-trial constant-effect control retained eight failed-bound outcomes and correctly withheld an interval. Six further control trials checked short-sample suppression, deterministic mode and explicit overflow failure. The error record preserved the instruction to rescale the metric. Synthetic results and all assumptions are retained under `output/comparisons/` and in the local research stores.

The observations support these finite benchmarks. They are not general filter/solver rankings, physical validation, formal proofs or novelty claims. Eight-repeat intervals remain small-sample exploratory summaries.

## LAN behavior

The app is served on the selected private interface using `bun run lan`. This installation uses `http://192.168.50.113:4310`. Host validation includes the exact configured port; unrelated private addresses and external origins are rejected. The default loopback mode and Compose publishing remain unchanged.

Testing exposed a browser-specific failure: plain HTTP on a LAN does not provide `crypto.randomUUID`, so research commands failed before transmission even though the WebSocket connected. A secure-random fallback using `crypto.getRandomValues` repairs request generation. Response copying also has a user-initiated fallback when the asynchronous clipboard API is unavailable. The browser regression disables both secure-context APIs and exercises research creation, a real command round trip, copying and reload. [MDN randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID), [MDN getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).

LAN mode is a shared trusted workspace, not a public multi-user service. Devices allowed to reach it can use the existing research and configured provider capabilities. No router, firewall or internet exposure changes were made. Validation through the private IP was performed on this machine; another device's route and firewall remain outside that observation.

## Reproduction

```sh
bun run check
bun run test:e2e
bun run test:comparisons
bun run lan
LAN_TEST_URL=http://192.168.50.113:4310 bun run test:lan
LAN_TEST_URL=http://192.168.50.113:4310 bun run test:comparisons-review
```

The completed comparison workspace is imported into the main application: [signals, optimization and mechanics](http://192.168.50.113:4310/?research=d339cff0-05f7-41a9-888e-321d9337ac16). After regenerating the local integration study, use `scripts/import-validation.ts` to import its new research ID before running the browser review.

The final checks cover TypeScript, formatting, production build, 46 backend tests, 11 browser acceptance tests, real Docker comparisons and controls, and actual LAN rendering of reports/figures/lineage with light/dark accessibility and mobile layout. Scientific CI includes the new comparison suite; remote CI has not been run for these local changes.
