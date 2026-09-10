import { expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
const store = new Store(mkdtempSync(join(tmpdir(), 'scienfactory-latex-')));
const research = store.create('LaTeX verification');
const ctx: ToolContext = {
  store,
  researchId: research.id,
  agentId: 'test',
  lab: new DockerLab(),
  signal: new AbortController().signal,
  changed: () => {},
  log: () => {},
  delegate: async () => [],
};
const source = String.raw`\documentclass[conference]{IEEEtran}
\usepackage[T1]{fontenc}\usepackage{amsmath,amssymb,cite,url,etoolbox}
\patchcmd{\abstract}{---}{.\ }{}{\errmessage{Abstract separator patch failed}}
\patchcmd{\IEEEkeywords}{---}{.\ }{}{\errmessage{Keyword separator patch failed}}
\title{A Reproducible Check of a Linear Elastic Identity}
\author{Anonymous review draft}
\begin{document}\maketitle
\begin{abstract}This document checks a mathematical identity used in linear elastic calculations and tests the reproducibility of its typesetting. The statement concerns a symmetric matrix and a displacement vector. It is an algebraic identity, not a structural safety claim.\end{abstract}
\begin{IEEEkeywords}linear elasticity, reproducibility, numerical verification\end{IEEEkeywords}
\section{Introduction}A reproducible calculation needs both an explicit model and an inspectable record. The document uses the IEEEtran class described by Shell~\cite{shell}.
\section{Methods}Let $K\in\mathbb{R}^{n\times n}$ be symmetric and let $u\in\mathbb{R}^n$. Define $f=Ku$ and the quadratic energy $U=\tfrac12u^TKu$.
\section{Results}Substituting the definition of $f$ gives the exact identity
\begin{equation}2U=u^TKu=u^Tf.\label{eq:energy}\end{equation}
Equation~\eqref{eq:energy} provides a consistency check for a saved linear calculation. A small numerical discrepancy is evidence of consistency under finite precision; it is not a substitute for validating the physical model.
\section{Discussion and Limitations}The identity alone does not establish that the matrix, loading, boundary conditions, or constitutive assumptions describe a real structure. In particular, buckling and geometric nonlinearity require additional analysis.
\section{Conclusion}The check relates computed force, displacement, and energy within the explicitly defined model.
\section*{Reproducibility}The source, bibliography, compiler report, and rendered page accompany this document.
\bibliographystyle{IEEEtran}\bibliography{references}\end{document}`;
try {
  const bib = await store.artifact(
    research.id,
    'references.bib',
    'text/plain',
    Buffer.from(
      '@manual{shell,author={Michael Shell},title={How to Use the IEEEtran LaTeX Class},year={2015},url={https://ctan.org/pkg/ieeetran}}',
    ),
    'Primary template documentation',
  );
  const tex = await store.artifact(
    research.id,
    'manuscript.tex',
    'text/x-tex',
    Buffer.from(source),
    'Validation source',
  );
  const result = (await executeTool(
    'compile_latex',
    { sourceArtifactId: tex.id, inputArtifactIds: [bib.id] },
    ctx,
  )) as {
    exitCode: number;
    pdfArtifactId: string;
    reportArtifactId: string;
    pageArtifactIds: string[];
    compileManifestId: string;
  };
  expect(result.exitCode).toBe(0);
  expect(result.pageArtifactIds.length).toBeGreaterThan(0);
  const report = JSON.parse(
    Buffer.from(
      (await store.readArtifact(research.id, result.reportArtifactId)).data,
      'base64',
    ).toString(),
  );
  expect(report.unresolvedReferences).toBe(false);
  expect(report.overfullBoxes).toBe(0);
  expect(report.textContainsEmDash).toBe(false);
  mkdirSync('tmp/pdfs', { recursive: true });
  for (const id of [result.pdfArtifactId, ...result.pageArtifactIds]) {
    const a = await store.readArtifact(research.id, id);
    writeFileSync(join('tmp/pdfs', a.name), Buffer.from(a.data, 'base64'));
  }
  const bad = await store.artifact(
    research.id,
    'bad.tex',
    'text/x-tex',
    Buffer.from(source.replace('cite{shell}', 'cite{nonexistent}')),
    'Negative control',
  );
  const badResult = (await executeTool(
    'compile_latex',
    { sourceArtifactId: bad.id, inputArtifactIds: [bib.id] },
    ctx,
  )) as { exitCode: number; reportArtifactId: string };
  const badReport = JSON.parse(
    Buffer.from(
      (await store.readArtifact(research.id, badResult.reportArtifactId)).data,
      'base64',
    ).toString(),
  );
  expect(badReport.unresolvedReferences || badResult.exitCode !== 0).toBe(true);
  console.log(
    JSON.stringify({
      latex: 'passed',
      pages: report.pages,
      noEmDashes: true,
      noOverfullBoxes: true,
      bibtexResolved: true,
      missingCitationDetected: true,
    }),
  );
} finally {
  store.close();
}
