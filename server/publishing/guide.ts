export const ARTICLE_GUIDE = `Write a precise scientific article from inspected evidence, not a persuasive story about unverified results.

Workflow
1. Inspect the research files. Establish the question, scope, assumptions, related work, methods, controls, uncertainties, and actual contribution. A replication or useful negative result is valid work. Never invent novelty, author names, affiliations, citations, measurements, experiments, or proof outcomes.
2. Build a claim ledger: identify each central claim, its exact manuscript location, evidence IDs, and limitations. Computed claims cite successful execution records and saved outputs. Formal claims cite a successful Lean record and state the formal assumptions. Literature claims require reading supporting source content. Metadata alone does not establish the source's findings.
3. Use the IEEEtran conference or journal template. Respect the target venue's own instructions if supplied. Use numbered citations, labeled equations, SI units, meaningful figure captions, and readable plots. Do not change margins, shrink fonts, or insert negative spacing to force a page count. Use BibTeX with IEEEtran or a carefully verified numbered bibliography. Human authors and venue details must come from the user; an anonymous review draft must say so explicitly.
4. Write the source as one or several immutable .tex files. compile_latex compiles with latexmk and BibTeX, resolves input assets in inputs/, saves PDF, compiler report/log, extracted text, and page images. It does not accept a visually approximate substitute for a real PDF.
5. Call inspect_file on the PDF with a vision-capable model to examine every page in ranges of at most four: title/abstract balance, columns, equations, tables, figure labels, citations, clipping, and whitespace. Fix compiler warnings, missing references, overfull boxes, and awkward floats. Recompile the final source.
6. Request a bounded independent scientific and writing review through delegate when the agent budget permits. Verify numerical claims against outputs; check definitions, dimensions, assumptions, counterexamples, statistical uncertainty, leakage, and causal overclaims. Mathematical prose is not a formal proof. Do not equate unimodality with log-concavity, correlation with causation, or finite enumeration with a general theorem.
7. Call review_article with the exact final source, compile manifest, references, and central claims. Address blockers and inspect warnings. This checks evidence linkage and mechanical rules, not scientific truth. Deliver the source, PDF, reproducibility files, and the audit's actual status. No automatic submission or publication.

Writing craft
Lead with the concrete problem and contribution. Make the abstract self-contained: problem, method, measured result, and scope. Use connected paragraphs, specific nouns, active verbs, and varied sentence length. Explain what each result establishes and why it matters. Separate methods from observations and interpretations. Prefer concise direct prose to promotional adjectives, boilerplate, lists of achievements, or repeated caveats. Do not use em dashes: neither U+2014, LaTeX triple hyphens, nor textemdash commands. Use a comma, colon, semicolon, or a separate sentence instead. Do not claim to be a human author or conceal AI assistance when disclosure is required. Avoid fabricated personal experience. Proofread transitions, symbols, units, significant figures, captions, and references. Retain uncertainty where the evidence requires it.

The supplied template uses IEEEtran's typography and two-column layout. Its abstract and keyword label separators use periods to honor this workspace's no-em-dash preference. That is an explicit deviation from the class's default separators; venue-specific submission compliance must be checked separately.`;

export function ieeeTemplate(mode: 'conference' | 'journal' = 'conference') {
  return String.raw`\documentclass[${mode}]{IEEEtran}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb,graphicx,booktabs,cite,url,etoolbox}
\usepackage[hidelinks]{hyperref}
% Workspace punctuation preference: retain IEEE layout, replace label separators.
\patchcmd{\abstract}{---}{.\ }{}{\errmessage{Abstract separator patch failed}}
\patchcmd{\IEEEkeywords}{---}{.\ }{}{\errmessage{Keyword separator patch failed}}
\title{A Precise Title Describing the Demonstrated Contribution}
\author{Anonymous review draft}
\begin{document}
\maketitle
\begin{abstract}
State the problem, the method, the measured result, and the scope in one self-contained paragraph. Replace this guidance with evidence-backed prose.
\end{abstract}
\begin{IEEEkeywords}
Replace with specific indexing terms
\end{IEEEkeywords}
\section{Introduction}
Explain the problem and the contribution relative to verified prior work.
\section{Methods}
State definitions, assumptions, units, data provenance, controls, and reproducible procedures.
\section{Results}
Report measured outcomes with uncertainty and evidence references. Explain figures in the text.
\section{Discussion and Limitations}
Interpret results within their assumptions. State failures and unresolved questions concretely.
\section{Conclusion}
State exactly what the investigation establishes.
\section*{Reproducibility}
Describe the saved code, data, environment, seeds, and verification procedure.
% Use references.bib supplied as an input artifact, or a verified thebibliography.
\bibliographystyle{IEEEtran}
\bibliography{references}
\end{document}
`;
}
