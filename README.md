# Scienfactory

A local research workspace for asking difficult questions, coordinating AI researchers, running reproducible experiments, and inspecting the evidence.

**Bun · Elysia · React · Vite · WebSockets · SQLite · Docker**

## Start

Prerequisites: Bun 1.4+, Docker with a running daemon, and an OpenAI or Anthropic API key.

```sh
bun install --frozen-lockfile
bun run lab:build
bun run lab:mathlib
bun run lab:research
bun run dev
```

Open **http://127.0.0.1:5173**. The API listens on port 4310. Enter a key in Settings, or use `.env.local` (see `.env.example`). A key entered in Settings remains in server memory until restart; a key loaded from `.env.local` is available again after restart. Keys never enter execution containers or browser storage.

The default worker is `scienfactory-lab:research`, which includes Mathlib, document readers, OCR, offline transcription, IEEEtran and BibTeX. Its first build downloads these dependencies. Set `LAB_IMAGE=scienfactory-lab:local` only when using the smaller base worker.

The key approved during setup is already saved in the ignored `.env.local`; do not commit or share that file. ChatGPT and Claude consumer subscriptions are separate from API billing.

For the built application without Vite:

```sh
bun run build
bun start
```

Open **http://127.0.0.1:4310**.

## Access from your LAN

```sh
bun run lan
# Select a specific interface if necessary:
LAN_ADDRESS=192.168.50.113 bun run lan
```

This builds the frontend and serves the app plus WebSockets on the selected private IP at port 4310. The launcher prints the address. Stop an existing server on that port before starting it. The current local installation is available at **http://192.168.50.113:4310**; its address can change with DHCP.

LAN mode shares the existing workspace and provider-backed capabilities with devices that can reach that address. It is intended for your trusted network. It does not add separate user accounts or public-hosting authentication. Host and Origin checks still require explicitly configured addresses, and session cookies remain HttpOnly and SameSite=Strict.

## Run the whole application in containers

```sh
bun run lab:build
bun run lab:mathlib
bun run lab:research
docker compose up --build -d
```

Open **http://127.0.0.1:4312**. Compose creates a separate persistent `research-data` volume. Local development uses `.data/`; those are intentionally different installations. `docker compose down` stops the app and preserves its named volume.

The trusted application container controls Docker through its socket. Generated code runs in separate disposable containers without this socket, host mounts, credentials, or network access. This is a **single-user local application**, not an authenticated public hosting configuration. See [architecture and security](docs/architecture.md).

## What you can do

- Research with streaming OpenAI Responses or Anthropic Messages agents. Choose from a dropdown populated by the models returned for your provider key.
- Delegate to up to 256 agents per run, with 1–32 concurrent model calls and a global ceiling of 32. Container execution has its own queue (two concurrent jobs by default).
- Search scholarly literature through Crossref and retrieve public HTTPS text pages. Inspect source URLs, excerpts, and retrieval dates.
- Execute Python, JavaScript, R, Lean, LaTeX, Graphviz, and Blender in isolated containers.
- Use NumPy, SciPy, SymPy, pandas, matplotlib, scikit-learn, NetworkX, Pillow, and pypdf. Use ffmpeg for media generation.
- Save reports, code, data, plots, PDFs, SVGs, standalone interactive HTML, GLB models, and videos. Preview Markdown/math, images, PDFs, sandboxed HTML, 3D models, audio, and video.
- Attach up to 20 files to a message; inspect PDFs/scans, office documents, scientific data, geometry and media in the offline worker. Unsupported formats retain an explicit decoder outcome.
- Write IEEEtran manuscripts with bibliography, figures, exact build provenance, no-em-dash checks and evidence audits. Read actual PDF pages with zoom, text access and focus mode.
- Upload files for agent analysis, edit text artifacts as new versions, and export a research with its evidence and files.
- Follow the chat timeline: lead and specialist messages, streamed tool preparation, arguments, outcomes, elapsed time, and live agent states.
- Use the live canvas for experiments, interactive HTML/SVG, plots, equations, PDFs, GLB models, and media. Agents can create or revise presentations; file versions stay in Files.
- Track a published research plan with pending, active, complete, and blocked steps. Discovery requests start with independent frontier and experimental perspectives when at least three agents are allowed.
- Inspect delegation, tool calls, execution output, token usage, findings, failures, and cancellation.
- Work with collapsible history, tabbed conversations and artifacts, resizable panels, light/dark themes, mobile panel switching, and keyboard shortcuts.

**Try it without spending API tokens:** open Lab and run its Python example. The real bootstrap simulation appears on the canvas with its source, live output, plot, dataset, and report.

**Inspect the engineering stress test:** the local history includes [a spatial truss investigation](http://127.0.0.1:5173/?research=2ac46316-c725-436b-b6f2-d7da9fbbda5e) with a real GLB, graphs, interactive load controls, corrected experiments, and independent equilibrium/energy checks. See the [validation evidence and reproduction commands](docs/canvas-validation.md).

## Scientific lab

Every execution starts in a fresh container. Write outputs to `artifacts/`; agent-selected input artifacts appear under `inputs/`. Files are not implicitly shared between jobs. The agent uses saved artifact IDs to pass inputs to the next execution.

| Runtime     | Instruments                                                     | Typical output                                |
| ----------- | --------------------------------------------------------------- | --------------------------------------------- |
| Python 3.13 | Scientific Python, symbolic algebra, statistics, PDF extraction | Plots, datasets, experimental results         |
| JavaScript  | Node.js standard library                                        | Data transforms, JSON, standalone HTML        |
| R           | Base R and its standard packages                                | Statistical analysis, plots                   |
| Lean 4.24   | Core and Std; optional Mathlib image                            | Compiler output and explicit axiom inspection |
| LaTeX       | Common LaTeX/science packages, shell escape disabled            | PDF                                           |
| Graphviz    | `dot`                                                           | SVG                                           |
| Blender 3.4 | CPU procedural modeling, render/export pipeline                 | GLB, images, animations                       |

Each job has 2 CPUs, 1.5 GB memory, 128 processes, a read-only root, bounded temporary storage, and a 110-second execution deadline. Output is capped at 100 KB text and 8 MB artifact bytes per job. Uploaded artifacts are limited to 8 MB each; each research has a 256 MB artifact budget. Larger datasets and long GPU jobs require a future worker profile, not silently increased privileges.

An extended image is defined in `containers/mathlib.Dockerfile`:

```sh
docker build -t scienfactory-lab:mathlib -f containers/mathlib.Dockerfile .
LAB_IMAGE=scienfactory-lab:mathlib bun run dev
```

This image downloads the Mathlib v4.24.0 project and its compiled cache at build time. Check the [validation record](docs/validation.md) for whether it was built and tested on this installation.

## Parameter studies and reproducibility

The agent can run parameter grids, repeated simulations, convergence checks and ablations with `run_study`. It saves the protocol before execution, records paired seeds, runs up to 48 isolated trials, retains failed cases, and automatically updates the existing canvas with criteria, outcomes, CSV data and charts. Declare `requiredOutputs` for essential raw data so missing or empty files fail visibly. Each metric can include a scientific rationale and numerical bounds.

`compare_study` compares two cases using every paired repeat, with descriptive summaries or exploratory bootstrap intervals under explicit sampling assumptions. Missing pairs are refused, failed bounds stay included, and deterministic, tiny or constant-difference samples do not receive misleading intervals. The 48-trial total budget now permits up to 24 repeats for a two-case comparison. `trace_artifact` draws recorded source/input lineage with integrity checks and explicit unknown leaves or depth limits.

`reproduce_execution` reruns the original source and exact input versions under the recorded Docker image, then compares full console output and artifact hashes. It refuses legacy records without sufficient provenance and unavailable images. Exact replay checks repeatability; independent implementations and scientific review establish different evidence. `research_guide` supplies methods and pitfalls for numerical analysis, statistics, combinatorics, learning, dynamics and optimization.

See the [multi-subject stress-test evidence](docs/science-validation.md), including real OpenAI oscillator research, heat diffusion, graph enumeration, statistical robustness, and an interactive 3D surface.

```sh
bun run test:science         # Real containers; no provider calls
bun run test:study-precision # NumPy scalar and exact-integer controls
bun run test:science-live    # Explicit paid OpenAI investigation in a fresh workspace
```

## Research limits and control

Defaults: 16 total agents, four concurrent model calls, 24 steps per agent, 4,096 output tokens per step, and a 200,000-token run budget. Provider calls are admitted against a conservative byte-based input bound plus the output limit; a run can stop before its nominal budget is exhausted. Usage totals reflect successful provider responses, not an authoritative billing ledger. Provider retries, interrupted calls, and failures may incur charges not reported in those totals.

Stop aborts provider requests, queued work, and active containers. Completed artifacts remain available. Server restarts mark previously running work `interrupted`; continuing starts a new run with saved conversation context and artifacts. This release does not automatically resume in-flight provider calls.

## Validation

```sh
bun run typecheck
bun test tests/*.test.ts
bun run build
bun x playwright install chromium
bun run test:e2e
bun run test:lab
```

Explicit live checks use provider credits:

```sh
bun run test:live       # Small OpenAI streaming/function round-trip
bun run test:research   # Search + two specialists + Python/Lean + report
bun run test:browser-live # Real Docker/preview workflow against the running app
```

Backend tests include a full 256-agent tree with a deterministic provider, permit limits, abort behavior, restart recovery, evidence ownership, and WebSocket authorization. Browser tests cover research creation, streaming, file editing, reload, exports, settings, uploads, manual execution, mobile layout, accessibility, keyboard tabs, and HTML isolation. The deterministic provider exists only under `tests/`.

See [file and article validation](docs/documents-validation.md), [validation evidence](docs/validation.md), [architecture](docs/architecture.md), and [capability boundaries](docs/capabilities.md).

## Project map

```text
server/       Provider adapters, orchestration, tools, persistence, WebSocket server
shared/       Validated command protocol, domain types, executable examples
web/          Research workspace and artifact viewers
containers/   Scientific runtime, execution harness, application image
tests/        Deterministic, browser, container, and explicit live checks
docs/         Architecture, capability matrix, validation evidence
```

Formatting: `bun run format`; check it with `bun run format:check`. The dependency versions and Bun lockfile are pinned. `PRODUCT.md` and `DESIGN.md` describe the product and visual system.

## Scientific scope

Scienfactory supplies research instruments. It cannot guarantee that arbitrary scientific questions are answerable, that any theorem is provable, or that an LLM's conclusions are correct. A completed run means its workflow finished. A compiled proof applies to the stated formal proposition and its assumptions. An agent-assessed finding is not scientific certification. Physical experiments, expert judgment, restricted data, and ethical review remain external where the research requires them.
