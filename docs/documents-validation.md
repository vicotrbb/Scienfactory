# File interpretation, canvas and scientific publishing

Validated locally on 2026-09-09. These are implementation and test results, not a claim of universal format support, scientific truth, or acceptance by an IEEE venue.

## Delivered workflow

Uploads remain immutable, content-addressed research files. Up to 20 files can be attached explicitly to a chat message. The agent sees their IDs, inspects them with `inspect_file`, and receives bounded extracted content with format, coverage, warnings and provenance. The research worker normalizes image and PDF evidence for native OpenAI/Anthropic visual input. Both SDK payload shapes and tool-result ordering were tested with deterministic fixtures. This new multimodal path has **not** yet been validated against a live provider.

Inspection runs in the same isolated, offline, non-root containers as experiments. Uploaded code, macros and archive members are not automatically executed. Original bytes are retained when decoding fails. `unsupported` and `unreadable` are explicit outcomes, not guessed interpretations. OCR and speech recognition can misread scientific notation, units and technical terms. A filename or a format guess is never enough to establish the contents.

### Format coverage

| Family                                  | Implemented inspection                                                      | Coverage and boundaries                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Text, code, JSON, CSV, notebook, markup | UTF-8/UTF-16 text; inert markup extraction                                  | 24,000 characters per range; notebook code is not executed                                                                                  |
| PDF                                     | Text, scanned-page OCR, raster previews, native PDF model input             | Up to four selected pages per inspection; encrypted files need a decrypted copy                                                             |
| Raster images                           | Normalized visual input, dimensions, frames, OCR                            | Up to four frames; 1,600 px preview edge; 30 million pixel decoder guard                                                                    |
| Word                                    | DOCX paragraphs/tables, legacy DOC through antiword                         | Extracted content, not original page layout or certified tracked-change interpretation                                                      |
| Slides                                  | PPTX text, tables, notes and selected embedded images                       | Up to four slides; original slide layout is not reconstructed                                                                               |
| Spreadsheets                            | XLSX/XLSM/XLS sheet structure and stored values/formulas                    | Up to 20 sheets, 100 rows per range, 30 columns; no formula recalculation                                                                   |
| ODF and EPUB                            | Inert content text                                                          | Bounded extraction; no interactive content or full layout reconstruction                                                                    |
| Scientific data                         | Parquet/Feather, NumPy, HDF5, NetCDF, SQLite                                | Row/array samples or schema metadata; HDF5 external data not loaded; NumPy pickle disabled; non-finite samples retained as explicit strings |
| Geometry                                | GLB/GLTF, STL, OBJ, PLY, OFF, 3MF via installed trimesh readers             | Mesh metadata and a geometry preview; confirm units and embedded dependencies                                                               |
| Audio/video                             | ffprobe metadata, selected video frames, offline Whisper-base transcription | 45 seconds per range and up to four frames; CPU only; transcription is fallible                                                             |
| ZIP/TAR                                 | Inventory and explicit regular-member inspection                            | No automatic extraction tree; traversal/links rejected; member limit 8 MB; ZIP expansion guard 64 MB/3,000 members                          |
| Unknown/proprietary/corrupt/encrypted   | Preserve original, expose decoder outcome                                   | No universal decoder; a documented format or open-format export may be required                                                             |

All uploads remain limited to 8 MB per file, with a 256 MB research artifact budget and 8 MB output per container job. These limits also apply to document conversions. Parser support is broader than the tested fixture set below; format variants, layouts, codecs and languages are not exhaustively certified.

## Canvas and article tools

The canvas has contents navigation, presentation/experiment filters, compact supporting files, focused previews, and a white paper reading surface in either theme. Heavy PDF and 3D viewers are loaded separately. The PDF reader renders actual pages with pagination, zoom, fit-to-width, keyboard scrolling, and extracted-text access. Files retains original and revised artifacts.

`article_guide` supplies scientific and editorial instructions plus real IEEEtran conference/journal templates. It requires a concrete contribution, natural connected prose, precise units, reproducibility, substantive limitations, honest authorship, verified citations and a claim ledger. It prohibits em dashes in source and final rendered text. No invented authors, citations, experiments or novelty claims.

`compile_latex` uses offline latexmk and BibTeX with shell escape disabled. It preserves a build manifest linking the exact source hash, input files, actual execution record, PDF, compiler diagnostics, extracted text and rendered pages. The first 12 pages receive previews automatically; longer papers need further `inspect_file` ranges. Compilation accepts nine dependency artifacts; the manual button resolves literal bibliography, figure and nested TeX references, choosing the newest version and excluding unrelated files.

`review_article` checks manuscript structure, placeholders, em dashes, citation mapping, successful compilation, unresolved references and text overflow. Computed/formal claim records must reference an actual successful execution, not an agent-authored JSON assertion. A changed source or mismatched build cannot reuse an old audit. Paper-writing requests recognized by the controller cannot complete without a current build and matching passed mechanical audit. Two corrective continuations are allowed within existing budgets; unfinished work stays visibly failed/preserved.

**Audit scope:** evidence linkage does not establish entailment, claim completeness, novelty, statistical correctness or physical validity. Scientific and editorial reviewers must inspect the actual work. `checks_passed` explicitly retains `scientificValidity: requires_independent_review`. This is not peer review, IEEE PDF eXpress, or an automated submission system.

**IEEE formatting choice:** IEEEtran normally inserts em-dash separators after Abstract and Index Terms. The supplied template changes those two separators to periods to honor the user's explicit no-em-dash preference. This is a disclosed deviation from the unmodified template; the chosen venue's instructions take precedence at submission.

## Validation evidence

- Backend: **32 tests, 159 assertions passed**. Includes native PDF/image payloads for both providers, source/evidence ownership, genuine execution linkage, no-paper completion rejection, nested LaTeX dependency resolution, cancellation and real WebSocket authorization.
- Browser: **9 tests passed**. Includes a complete 256-agent fixture tree, streamed tools, canvas filters/focus, PDF page/zoom/text controls, unreadable PDF handling, mobile layouts, light/dark accessibility, keyboard navigation and HTML network/parent isolation.
- Actual worker: seven runtime smoke tests passed, plus Lean proof-hole rejection, network/filesystem/credential isolation, cancellation, Unicode streaming and MP4 generation.
- File inspection: **23 cases passed**. Container fixtures cover DOCX, PPTX, XLSX, PNG/PDF OCR, CSV, NumPy (including missing values), Parquet, HDF5, NetCDF, SQLite, STL, ZIP, spoken audio, video, unknown binary, encrypted/corrupt PDFs, pickle rejection, archive expansion and traversal rejection.
- Real LaTeX integration: IEEEtran + BibTeX compilation and page rendering passed. An intentionally unresolved citation is detected.
- Real browser + Docker: manual Compile PDF produced a two-page PDF from source, bibliography and figure; Inspect decoded it successfully. Provider keys were disabled in this harness.
- Main app: both final paper pages and the GLB were inspected in the live canvas; focus mode, 3D interaction and light/dark accessibility passed with no browser page errors. Screenshots are in `docs/screenshots/article-*.png`.
- Live provider article generation: **pending explicit payload approval**. Automatic approval review blocked transmission of the local engineering artifacts to OpenAI. See [the exact payload and bounded test](article-live-approval.md). No replacement egress path was used.

## Reproducible engineering paper

The local history contains [IEEE article · verified spatial truss study](http://127.0.0.1:5173/?research=0ed09bd3-9f00-41c7-a31d-23a5f78735fd). The two-page manuscript is under `output/pdf/paper.pdf`, with source, bibliography, figure, original geometry/data, verification code, records and audit. Every final PDF page was inspected visually. No missing citations, overfull text boxes or em dashes were found.

This sample was authored locally with AI assistance and compiled through the application tools. It is not evidence that a live provider autonomously authored or reviewed the new article workflow. All three corrected 100 N truss cases were independently reconstructed from their saved geometry. The largest normalized force-balance residual was about 4.48e-11. The finite linear axial-bar model excludes buckling, nonlinear response and connection design. The article claims a reproducible case study, not a novel structural theory or construction-ready design.

Reproduction commands (first build/select the research worker):

```sh
bun run typecheck
bun run test
bun run build
bun run test:e2e
bun run test:lab
bun run test:files
bun run test:latex
bun run test:publishing-browser
# Uses the saved local engineering investigation:
bun run test:publishing
bun run test:publishing-review
```

The self-contained `output/truss-research-bundle.zip` includes the data, numerical script, TeX source, bibliography and generated files. `output/pdf/README.md` describes standalone regeneration. The `.data` store additionally preserves artifact ID provenance.

## Primary implementation references

- [OpenAI PDF file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [Anthropic PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support) and [vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- [IEEE authoring tools and templates](https://journals.ieeeauthorcenter.ieee.org/create-your-ieee-journal-article/authoring-tools-and-templates/tools-for-ieee-authors/)
- [IEEEtran package](https://ctan.org/pkg/ieeetran)
- [Faster Whisper](https://github.com/SYSTRAN/faster-whisper)
