# Validation record

Local validation on 2026-09-09, macOS arm64, Bun 1.4.0, Docker 29.4.0. This records observed checks; it does not certify correctness for every research question or production environment.

## Passed

The later chat/canvas revision, real engineering stress test, independent mechanics verification, and combinatorics retest are recorded in [Canvas and scientific stress validation](canvas-validation.md). Counts below describe the original baseline unless superseded there.

- Strict TypeScript, including unused-local and unused-parameter checks.
- **15 backend tests / 71 assertions**: immutable artifacts, ownership checks, restart interruption, finding evidence validation, command validation, private-network rejection, key redaction, provider stream contracts, WebSocket authentication/Origin checks, reply replay, scheduling, cancellation, and token-budget failure.
- **256-agent orchestration test**: a complete 256-agent delegation tree joined successfully with an eight-call concurrency ceiling. Deterministic provider; this is scheduler correctness/load evidence, not 256 simultaneous paid model calls. The measured run in the final backend pass took approximately 95 ms.
- **Five Chromium browser tests**: research/chat/report flow, math preview, source editing as a new version, reload, export, BYOK settings, uploads, manual execution, keyboard tabs and resizing, mobile layout, reduced motion, and malicious HTML isolation.
- **Accessibility**: no axe WCAG 2 A/AA or 2.1 AA violations in the tested light, dark, and mobile workspace states. This is automated coverage, not complete WCAG certification.
- **Seven real container runtimes**: Python, JavaScript, R, Lean, LaTeX, Graphviz, and Blender. Generated a bootstrap report/plot/CSV, numerical JSON, R plot/data, Lean output, PDF, SVG diagram, and GLB model.
- **Container isolation**: runtime checks verified no provider key, no Docker socket, no host `/Users` directory, a read-only root, and blocked outbound network access. Cancellation terminated a running job. A Lean proof containing `sorry` was rejected. The final extended runtime also passed Unicode streaming and real MP4 rendering checks.
- **Live retrieval**: Crossref returned real DOI records, and the public-source retriever read a Wikipedia statistics article using DNS-pinned HTTPS.
- **Live OpenAI**: `gpt-5-mini` streamed a tool call and consumed its result in a second model turn; the response correctly returned 42. Reported usage: 297 input and 116 output tokens.
- **Live research after context isolation fix**: research `5a606ff0-869e-4dc7-94e2-2c1bbc30d362` completed with one lead and two specialist agents, eight source records, a real Python plot, a Lean execution record, and `validation-report.md`. Successful provider response usage: 19,813 input and 4,550 output tokens. The files and execution records are in `.data/live-validation/`.
- **Real browser + Docker**: the UI ran the bootstrap experiment, loaded its actual plot, ran Blender, and displayed the generated GLB through the interactive Three.js viewer. No browser page errors were observed.
- **Frontend production build**: initial application JS approximately 325 KB / 102 KB gzip. Markdown/math (approximately 128 KB gzip) and Three.js/GLB support (approximately 158 KB gzip) load as separate chunks when needed.

## Issues found and corrected during validation

1. The OpenAI SDK added `parsed_arguments` fields that were rejected on continuation. The adapter now explicitly serializes supported input fields, with a regression test.
2. Blender's bundled Python lacked NumPy and returned a successful process exit after Python errors. The image now includes its required system NumPy, and Blender runs with `--python-exit-code 1`.
3. Development WebSockets were rejected when the existence of `dist/` incorrectly enabled production Origin rules. Production is now an explicit environment mode.
4. A broad SVG selector enlarged a button icon. The selector now targets only the figure's direct SVG.
5. A tablist included unrelated action buttons; tab semantics and keyboard behavior were corrected.
6. Theme transitions briefly produced insufficient text contrast. Text colors now switch atomically with theme tokens.
7. Delegated agents inherited the lead's full instructions and duplicated work. Specialists now receive their bounded task separately; a second real research run verified the corrected behavior.
8. SQLite's per-write synchronization caused a 256-agent test to exceed its timeout under I/O load. WAL/NORMAL mode removed per-event synchronous fsync while retaining application-crash recovery; the same assertions then passed.
9. Exporting every binary in one server frame could exceed WebSocket backpressure limits. Files now transfer individually before browser-side export assembly.

## Boundaries

- Anthropic's real API has not been called; its streaming and tool-result adapter passed SDK-level deterministic transport fixtures.
- Public/multi-user hosting, GPU workers, arbitrary network-enabled code, large datasets, and automatic restart/resume were not implemented or claimed.
- CI workflow files are provided but have not been pushed or run remotely.
- The application image built successfully. Starting the detached Docker Compose service was blocked by automatic approval review because it would persistently load the API key and expose the Docker socket to the controller. Approval was requested; Compose runtime validation remains pending. The Bun development application and its real Docker execution flow were verified separately before that rejection.

## Mathlib extension

The extended `scienfactory-lab:mathlib` image built successfully with Mathlib v4.24.0 and its compiled cache. In the isolated, offline execution environment, this theorem compiled with exit code 0:

```lean
import Mathlib.Data.Real.Basic
import Mathlib.Tactic.Linarith

theorem square_nonnegative (x : ℝ) : 0 ≤ x ^ 2 := by
  nlinarith [sq_nonneg x]

#print axioms square_nonnegative
```

Lean reported `[propext, Classical.choice, Quot.sound]` as dependencies. The first check took approximately 16.4 seconds. The local `.env.local` selects this extended image; provider prompts discover the installed Mathlib capability from the image label.

The final labeled image was tested again: Mathlib proof exit code 0 in approximately 13.9 seconds, followed by successful execution of all seven runtimes, Unicode preservation, MP4 rendering, proof-hole rejection, isolation assertions, and cancellation.
