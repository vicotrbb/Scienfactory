# Capability boundaries

| Capability         | Implemented behavior                                                                 | Important boundary                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| BYOK agents        | OpenAI and Anthropic SDK adapters; streaming text and iterative function calls       | OpenAI verified live; Anthropic protocol tested with deterministic streamed fixtures, no live Anthropic key supplied |
| Large teams        | Up to 256 agents per run, nested delegation, separate conversations, shared files    | Concurrency is bounded; no distributed cluster scheduler                                                             |
| Research retrieval | Crossref search, arbitrary public HTTPS text retrieval, source provenance            | No general-purpose search-engine subscription, paywall bypass, or authenticated browser automation                   |
| Computation        | Scientific Python, Node.js, R in containers                                          | Offline jobs; dependencies must be included in the image; CPU only                                                   |
| Formal methods     | Lean 4.24, core/Std, optional Mathlib image                                          | Formal statements and assumptions still require scrutiny; arbitrary propositions need not be provable                |
| Documentation      | Markdown/LaTeX math, actual IEEEtran PDF, bibliography and evidence audit            | IEEEtran/BibTeX build and mechanical audit; no scientific certification or collaborative editor                      |
| Visual output      | Plots, SVG, sandboxed interactive HTML, GLB, image/audio/video previews              | GLB must embed dependencies; no arbitrary external runtime scripts or remote model resources                         |
| Animation          | ffmpeg and Blender can generate media; native browser media previews                 | GPU rendering and long animation jobs are outside the default job limits                                             |
| Data ingestion     | Explicit chat attachments, offline file inspection, native PDF/image provider inputs | 8 MB per file; bounded format-specific decoding; native visual payloads fixture-tested, live acceptance pending      |
| Evidence           | Source URLs, execution records, content hashes, agent-assessed findings              | Referenced evidence existing does not prove a claim is scientifically valid                                          |
| Persistence        | Research history, messages, agents, outputs, settings, restart markers               | No automatic in-flight provider resume, vector memory, multi-user sync, or automatic backups                         |
| Portability        | JSON research export with embedded files                                             | Import/restore UI and garbage collection are not implemented                                                         |
| Deployment         | Local Bun/Vite development, built Bun server, Docker Compose                         | Local single-user scope; not exposed or deployed to a public service                                                 |

The next substantial extensions should be evidence-led: a real distributed durable queue for multi-host workers; controlled network-enabled worker profiles; specialist tool images for GPU and domain workloads; import/restore and garbage collection; broader file/codec coverage and live multimodal evaluation; search-engine connectors and authenticated sources; richer citation management; and adversarial evaluation of scientific claim-to-evidence grounding. Each needs its own validation and operational model.

See [file interpretation and publishing validation](documents-validation.md) for exact formats, coverage limits, IEEE template choices and test evidence.
