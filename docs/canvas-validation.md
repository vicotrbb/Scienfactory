# Canvas and scientific stress validation

Validated locally on 2026-09-09. This is evidence for the implemented workflows and the specified mathematical model; it is not a claim that arbitrary research is correct or novel.

## Review the actual engineering run

The completed research is available in the local application's history as **Engineering stress test · spatial truss design**:

[Open the engineering workspace](http://127.0.0.1:5173/?research=2ac46316-c725-436b-b6f2-d7da9fbbda5e)

The imported workspace contains 47 artifacts and 17 canvas items, including earlier failed attempts, corrected results, source code, tool records, specialist reviews, and an independent verification record. The import verified content hashes and preserved unrelated research and settings.

The task asked real OpenAI agents to compare three depths of a 20-node, 60-member spatial cantilever truss, assemble and solve its stiffness equations, test scaling laws and a negative control, and produce graphs, an interactive load visualization, a Blender-generated GLB, machine-readable results, and a report. A lead and two specialists worked on the first run; a follow-up lead corrected issues identified during independent review. Both runs used gpt-5-mini and real isolated Docker jobs.

### Corrections driven by evidence

- The intentional failing assertion appeared as a failed experiment and the research continued.
- Generated Python, boundary-condition, and Blender errors remained visible; later attempts corrected them.
- The initial shallow/high-load case deflected roughly 44% of its span. Independent review rejected a small-displacement physical interpretation of that case. The follow-up recomputed at 100 N total load and documented the model's limits.
- The interactive chart's zero-load logarithm produced nonfinite coordinates. The corrected chart passed slider checks at 0, 0.5, 1, and 3 times the base load.
- The report's numerical tolerance statement was corrected to match measured diagnostics.

### Independent mechanics check

The test harness reconstructed axial member forces from the saved geometry and displacements, independently of the agent's stiffness-assembly code. It checked fixed degrees of freedom, equilibrium at free degrees of freedom, total reaction balance, and strain energy against the applied load work.

| Corrected saved case                   |        Measured result |
| -------------------------------------- | ---------------------: |
| Nodes / members                        |                20 / 60 |
| Relative free-force residual           | 1.3437658359954868e-12 |
| Relative total force-balance residual  | 1.3429242968675138e-12 |
| Strain energy                          | 0.049187681247248094 J |
| Applied force dotted with displacement |  0.09837536249446895 J |
| Independent checker                    |                 Exit 0 |

The last two measurements satisfy the linear-elastic identity 2U = F·u within the test tolerance. This verifies the saved axial-bar calculation; bending, buckling, plasticity, geometric nonlinearity, and design safety are outside this model.

Chromium displayed and rotated the actual GLB, rendered the generated graph, rendered the GLB inline in the canvas, and exercised the HTML controls without page errors. Screenshots are in [screenshots](screenshots/engineering-3d.png).

## Chat, canvas, and progression

The final regression pass passed **25 backend tests / 125 assertions**, strict TypeScript, the production build, and **seven Chromium tests** in 15.7 seconds. Browser coverage includes interactive canvas updates and reload, 256-agent state, HTML isolation, keyboard/reduced-motion behavior, files/export, theme accessibility, settings, uploads, manual execution, and narrow viewports.

- The suggestion cards were removed. Chat contains lead and specialist messages, durable tool calls, inspectable inputs/results, real preparation states, and elapsed time.
- Canvas is the default right panel. Executions publish source before completion, stream stdout, and attach generated results. Presentations can be revised in place; immutable versions remain in Files.
- Plans show actual pending, active, complete, and blocked steps. Motion reflects real work; there is no fabricated progress percentage. Reduced-motion preferences are respected.
- Files remains separate; Sources, Agents, and Activity remain available. Lab exposes scientific recipes and tools.
- Models are listed through the provider's authenticated model endpoint and cached for five minutes per credential fingerprint. The live OpenAI project returned 56 candidate text models. Listing is not a guarantee that every listed model supports the same tools or endpoint; provider errors remain visible.
- Incremental WebSocket patches replace repeated full snapshots after initial state/reconnect. The final deterministic 256-agent browser run received 1,165,057 bytes over the measured session including reload, with nine patch frames. This measures the tested workload, not a general bandwidth guarantee or 256 paid API calls.

## Combinatorics retest

The exact prompt **“Do me a breakthru of something related to combinatories”** was rerun after improving initiative, bounded specialist perspectives, small-first experiments, and plan continuation. Research `215898bc-e1ce-451a-b648-bc9bc36405ba` completed in approximately 220 seconds with a frontier scout, an experimental strategist, five canvas items, visible preparation/execution, and no browser page errors. It produced small-case enumerations and a report relating descents in 132-avoiding permutations to Narayana numbers. This is a known combinatorial relationship, not a verified new breakthrough; the report is not a Lean-certified proof. A presentation validation error was corrected in a later tool call.

Review also caught a final message promising future work after completion and an unsupported implication from unimodality to log-concavity. The lifecycle prompt now explicitly prohibits promises of background continuation; that final prompt addition has not been retested with another paid model run. Scientific prose still requires evidence review: the tool does not automatically certify mathematical arguments or turn a model's assertion into a proof.

## Reproduce

```sh
bun run check
bun run test:e2e
bun run test:lab
```

Live tests use the configured OpenAI key and incur provider usage:

```sh
bun run test:canvas-live
bun run test:engineering
```

Review the saved engineering results without starting another paid agent run:

```sh
RESEARCH_ID=2ac46316-c725-436b-b6f2-d7da9fbbda5e bun run test:engineering
# With the native dev app running and the recorded research imported:
bun run test:engineering-review
```

`FOLLOW_UP_FILE=tests/engineering-follow-up.md` together with `RESEARCH_ID` starts a paid correction run. Tests use separate data directories. Run production builds before browser tests, because rebuilding removes old asset chunks.

Anthropic is covered by deterministic SDK transport tests, not a live Anthropic run. The broader deployment and scientific capability boundaries remain in [capabilities](capabilities.md) and [validation](validation.md).
