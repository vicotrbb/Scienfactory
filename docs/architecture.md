# Architecture and trust boundaries

## One workspace, four substantial modules

1. **Research engine** owns run lifecycle, delegation, context isolation, token admission, cancellation, and provider permits. It accepts a provider factory and a lab; tests cross the same interface as the application.
2. **Provider adapters** translate a normalized tool conversation into OpenAI Responses or Anthropic Messages. Official SDK streaming, errors, usage, reasoning continuation, and provider-specific tool results stay inside these adapters. Provider endpoints are fixed to their official hosts. Keys are never returned to clients.
3. **Scientific lab** owns scheduling and ephemeral container lifecycle. It accepts a language, source, selected inputs, and an abort signal. The implementation hides Docker flags, NDJSON parsing, cleanup, deadlines, and artifact collection.
4. **Research store** owns SQLite state, restart recovery, evidence ownership, immutable content hashes, artifact budgets, and persisted request replies. UI and tools do not access the database directly.

## Transport

All application commands, streamed text, source lists, activity, snapshots, settings, uploads, and artifact reads use a same-origin WebSocket. HTTP serves static assets, a local session bootstrap, and health. Provider adapters speak their providers' supported streaming HTTP protocols; those streams are forwarded over the application WebSocket. There is no HTTP polling loop for research state.

Commands are validated by a shared Zod discriminated union. Replies have request IDs. Successful mutating replies are persisted and duplicate request IDs are replayed. An in-progress duplicate is ignored until the original completes. The journal is bounded to 2,000 replies. This prevents ordinary duplicate delivery; it is **not transactional exactly-once execution across a crash between an external side effect and reply persistence**. The browser rejects interrupted requests rather than automatically repeating them and resynchronizes from SQLite.

Snapshot notifications are coalesced to 80ms per research. Docker capability checks are cached for five seconds. Model text streams incrementally; text checkpoints are written at most once per second and on completion. Large exports transfer each file separately before assembling the download in the browser, keeping individual WebSocket frames below the configured limit.

## Concurrency and resource admission

Delegation is bounded to 256 agents, 32 tasks per call, and depth three. Specialists receive their assigned task instead of inheriting the lead's workflow instructions. They share saved evidence through tool interfaces. Parent agents release model permits before waiting for children, preventing recursive delegation from exhausting the pool while all permits are held by waiting parents.

Per-run model concurrency is configurable from 1 to 32; all runs share a global ceiling of 32. Container jobs share a separate queue (default two). FIFO permits remove cancelled waiters. A 256-agent research does not imply 256 simultaneous containers or provider requests.

Provider admission reserves a conservative input bound plus the maximum output allocation before calling the model. Reported usage replaces the reservation when a successful response returns. This controls scheduling, not provider billing. Provider retry and cancellation behavior can produce billing outside the displayed successful-response totals.

## Persistence

SQLite uses WAL, `synchronous=NORMAL`, prepared statements, and a schema version. JSON entities keep the small application model together; indexes cover research and kind. The store also owns activity and request journals. WAL/NORMAL preserves database consistency and application-crash recovery; the latest commits may be lost in an operating-system/power failure. Back up a stopped installation's whole data directory or the database plus its WAL together.

Files are SHA-256-addressed blobs. Artifact metadata belongs to one research, and every read checks that ownership. Source changes produce new artifact versions. Deleting a research removes its references; unreferenced content-addressed blobs are retained on disk in this release. There is no automatic garbage collector or backup scheduler.

## Security model

- Single trusted workspace. The server binds to loopback by default; Compose publishes only to loopback. The explicit `bun run lan` launcher binds a selected private interface and permits its configured origin. LAN clients share the workspace and provider capabilities; there are no separate user accounts. Host and Origin validation reject cross-site and DNS-rebinding access. WebSocket upgrades require an HttpOnly, SameSite=Strict session cookie. Cookies are namespaced per installation port.
- API credentials are sent only to fixed official provider endpoints. UI-supplied credentials live in server memory. Environment credentials are intentionally persistent outside application storage. Error messages redact keys. The UI never receives secret values.
- The trusted application controller has Docker access. Generated programs never receive the Docker socket, host filesystem mounts, API keys, or a network interface with egress. Containers use a non-root user, dropped capabilities, no-new-privileges, resource limits, a read-only root, and bounded tmpfs mounts.
- Containers share the Docker host kernel. This is not a hostile multi-tenant isolation claim. Public hosting would require authentication, tenant separation, a dedicated execution controller, stronger isolation, per-tenant quotas, TLS, audit policy, and an operational security review.
- Public retrieval only allows HTTPS on port 443. All resolved addresses must be public. The TCP connection is pinned to the checked DNS address, and redirects repeat validation. Credentials in URLs and private/reserved IPv4/IPv6 ranges are rejected. Response bytes and time are bounded.
- Markdown does not execute raw HTML. External Markdown images do not load automatically. HTML artifacts run in an opaque-origin iframe with network-denying CSP. SVG previews use image rendering. GLB loading rejects external resources. Model-generated code and source material remain untrusted.
- Lean compilation rejects visible proof-hole and unchecked-declaration keywords and treats compiler warnings as errors. `#print axioms` records dependencies when requested. This is a practical check, **not a complete adversarial verifier of arbitrary metaprograms or a proof that natural-language claims match their formal statements**.

## Sources consulted for implementation

- [Elysia WebSocket documentation](https://elysiajs.com/patterns/websocket)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Anthropic streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)
- [Lean community project setup](https://leanprover-community.github.io/install/project.html)

## Live research canvas and progression

Canvas items, research plans, and tool invocations are durable SQLite entities scoped to a research. `present` validates artifact ownership and creates or revises a presentation; revisions retain immutable file versions. `execute` publishes source immediately, updates output during execution, and attaches generated files on completion. Interrupted jobs and tools recover as interrupted rather than appearing successful.

Provider adapters expose public streamed text and tool arguments. Tool drafts are checkpointed at most every 100 ms; workspace updates are coalesced at 80 ms. After initial synchronization, the server transmits changed entities only; full snapshots remain the reconnect boundary. A bounded eight-research cache avoids retaining every historical workspace in server memory. The browser shows preparation, execution, results, per-agent states, and elapsed time. It does not expose private model reasoning. The canvas mounts heavy previews near the viewport and displays 20 items initially, with earlier items available on demand. Follow mode can be disabled for inspection. Standalone HTML retains its opaque-origin sandbox and no-network CSP.

Plans contain stable step IDs and explicit task states; progress is derived from those steps, never an invented completion percentage. Discovery requests matching breakthrough/discovery/novel-result language receive two opening perspectives when the configured agent budget allows three researchers. These specialists cannot recursively delegate. The lead can subsequently delegate bounded work normally. When a model ends with unfinished plan steps, the controller can request up to two continuations within the existing step/token limits.

`instruments` exposes nine method families with executable recipes. `execute_batch` sends up to eight independent jobs through the existing bounded container queue; a failed job does not discard successful peers. `import_data` reuses the DNS-pinned public HTTPS text retriever and records the dataset source.

Model dropdowns use authenticated server-side model discovery with a five-minute cache keyed by a credential fingerprint. The filter excludes known non-text modalities; an API model listing is not a guarantee that every listed model supports every endpoint or project permission. Provider-list failures remain visible and preserve the saved selection. See the [OpenAI model-list API](https://developers.openai.com/api/reference/typescript/resources/models/methods/list) and [Anthropic model-list API](https://platform.claude.com/docs/en/api/models/list).

## File evidence and manuscript builds

`server/files` routes bounded inspection through the existing Docker execution lifecycle. The worker creates an inspection report and normalized previews; `inspect_file` attaches selected PDF pages or images to the provider conversation after tool results. Original artifacts remain immutable. Coverage and decoder failures are explicit. Native binary inputs are budgeted separately from textual JSON and actual provider usage remains the accounting result.

`server/publishing` owns the writing guide, source/build manifest and mechanical claim audit. The manifest binds immutable source and input IDs to a genuine compilation execution. Audits reject cross-research evidence, mismatched source/builds, unresolved references, em dashes and text overflow. An actual execution is required for computed/formal claims. The audit deliberately retains an independent-scientific-review requirement. The controller checks a current build/audit for recognized manuscript-writing requests before accepting completion.

Manual `artifact.inspect` and `artifact.compile` commands use the same authenticated WebSocket path and cancellable container lifecycle. PDF.js is lazy-loaded and renders one page at a time; its worker is bundled locally. It does not execute PDF JavaScript. HTML keeps its existing opaque-origin CSP sandbox. See [validation and boundaries](documents-validation.md).
