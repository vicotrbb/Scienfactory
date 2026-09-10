import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store';
import { executeTool, type ToolContext } from '../server/toolkit';
import { ieeeTemplate } from '../server/publishing/guide';
import { lintArticle } from '../server/publishing/article';
const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
const text = String.raw`\documentclass[conference]{IEEEtran}
\title{A reproducible calculation}\begin{document}\maketitle
\begin{abstract}We compute a bounded result and verify it independently.\end{abstract}
\section{Methods}We solve a linear system.\section{Results}The residual is small.
\section{Limitations}Only the stated finite model is tested.\begin{thebibliography}{1}\bibitem{x}A real source.\end{thebibliography}\end{document}`;
function context() {
  const store = new Store(mkdtempSync(join(tmpdir(), 'article-test-')));
  stores.push(store);
  return {
    store,
    researchId: store.create('Article audit').id,
    agentId: 'test',
    signal: new AbortController().signal,
    log: () => {},
    changed: () => {},
    delegate: async () => [],
    lab: {
      capabilities: async () => ({ docker: true, image: true, documents: true, detail: 'Fixture' }),
      execute: async () => ({
        exitCode: 0,
        stdout: 'Compiled',
        durationMs: 20,
        artifacts: [
          {
            name: 'paper.pdf',
            mime: 'application/pdf',
            data: Buffer.from('%PDF fixture').toString('base64'),
          },
          {
            name: 'compile-report.json',
            mime: 'application/json',
            data: Buffer.from(
              JSON.stringify({
                exitCode: 0,
                pages: 1,
                unresolvedReferences: false,
                overfullBoxes: 0,
                textContainsEmDash: false,
              }),
            ).toString('base64'),
          },
        ],
      }),
    },
  } satisfies ToolContext;
}
test('manuscript lint catches em dashes, missing IEEE structure and unfinished template prose', () => {
  expect(lintArticle(text)).toEqual([]);
  expect(
    lintArticle(text.replace('bounded result', 'bounded result\u2014a useful check')).some(
      (i) => i.code === 'em-dash',
    ),
  ).toBe(true);
  expect(
    lintArticle(text.replace('bounded result', 'bounded result---a useful check')).some(
      (i) => i.code === 'em-dash',
    ),
  ).toBe(true);
  expect(lintArticle(ieeeTemplate()).some((i) => i.code === 'placeholder')).toBe(true);
  expect(lintArticle(ieeeTemplate()).some((i) => i.code === 'em-dash')).toBe(false);
  expect(lintArticle(text.replace('{IEEEtran}', '{article}')).some((i) => i.code === 'class')).toBe(
    true,
  );
});
test('article audit requires exact compiled source and actual execution evidence for computed/formal claims', async () => {
  const ctx = context();
  const source = await ctx.store.artifact(
    ctx.researchId,
    'article.tex',
    'text/x-tex',
    Buffer.from(text),
    'User source',
  );
  const compile = (await executeTool('compile_latex', { sourceArtifactId: source.id }, ctx)) as {
    compileManifestId: string;
    executionRecordId: string;
  };
  const claimed = await ctx.store.artifact(
    ctx.researchId,
    'claimed-proof.json',
    'application/json',
    Buffer.from('{"language":"lean","exitCode":0}'),
    'Written by agent; not verified',
  );
  const request = {
    sourceArtifactId: source.id,
    compileManifestId: compile.compileManifestId,
    claims: [
      {
        claim: 'A theorem holds.',
        location: 'Results',
        kind: 'formal',
        evidenceIds: [claimed.id],
        limitations: 'The model is finite.',
      },
    ],
  };
  const failed = (await executeTool('review_article', request, ctx)) as {
    status: string;
    issues: { code: string }[];
  };
  expect(failed.status).toBe('needs_revision');
  expect(failed.issues.some((i) => i.code === 'unproved-theorem')).toBe(true);
  const revised = await ctx.store.artifact(
    ctx.researchId,
    'article.tex',
    'text/x-tex',
    Buffer.from(text + '\n% revision'),
    'Revised source',
  );
  await expect(
    executeTool('review_article', { ...request, sourceArtifactId: revised.id }, ctx),
  ).rejects.toThrow('differs');
  const reviewed = (await executeTool(
    'review_article',
    {
      ...request,
      claims: [
        {
          ...request.claims[0],
          kind: 'computed',
          claim: 'The document compiled.',
          evidenceIds: [compile.executionRecordId],
        },
      ],
    },
    ctx,
  )) as { status: string; scientificValidity: string };
  expect(reviewed.status).toBe('checks_passed');
  expect(reviewed.scientificValidity).toBe('requires_independent_review');
});
test('file inspection and article compilation reject cross-research file references before execution', async () => {
  const ctx = context();
  const foreign = ctx.store.create('Other research');
  const artifact = await ctx.store.artifact(
    foreign.id,
    'source.tex',
    'text/x-tex',
    Buffer.from(text),
    'Other user file',
  );
  await expect(executeTool('inspect_file', { artifactId: artifact.id }, ctx)).rejects.toThrow();
  await expect(
    executeTool('compile_latex', { sourceArtifactId: artifact.id }, ctx),
  ).rejects.toThrow();
});

test('a requested manuscript cannot silently finish without a current compiled and audited deliverable', async () => {
  const { ResearchEngine } = await import('../server/engine');
  const { defaultLimits } = await import('../shared/protocol');
  const ctx = context();
  let nudges = 0;
  const engine = new ResearchEngine(
    ctx.store,
    ctx.lab,
    () => {},
    () => {},
    () => ({
      inputBound: () => 100,
      nudge: () => {
        nudges++;
      },
      result: () => {},
      turn: async () => ({
        text: 'I will write the paper later.',
        calls: [],
        inputTokens: 1,
        outputTokens: 1,
      }),
    }),
  );
  engine.start(
    ctx.researchId,
    'Write a scientific article from the investigation',
    { provider: 'openai', model: 'fixture', limits: defaultLimits },
    'fixture-key',
  );
  while (engine.busy(ctx.researchId)) await Bun.sleep(5);
  expect(nudges).toBe(2);
  expect(ctx.store.snapshot(ctx.researchId).research.status).toBe('failed');
  expect(ctx.store.snapshot(ctx.researchId).runs[0]?.error).toContain(
    'mechanical review are incomplete',
  );
});

test('manual LaTeX compilation selects referenced latest files and nested inputs only', async () => {
  const { latexDependencies } = await import('../shared/latex');
  const ctx = context();
  const main = await ctx.store.artifact(
    ctx.researchId,
    'main.tex',
    'text/x-tex',
    Buffer.from(''),
    'Test',
  );
  const make = (name: string) =>
    ctx.store.artifact(ctx.researchId, name, 'text/plain', Buffer.from(''), 'Test');
  const old = await make('figure.pdf');
  const figure = await make('figure.pdf');
  const chapter = await make('methods.tex');
  const bib = await make('refs.bib');
  const noise = await Promise.all(Array.from({ length: 12 }, (_, i) => make(`unrelated-${i}.pdf`)));
  const inputs = await latexDependencies(
    '\\input{methods}\\bibliography{refs}',
    main,
    [old, figure, chapter, bib, ...noise],
    async () => '\\includegraphics[width=1cm]{figure}',
  );
  expect(inputs.map((a) => a.id)).toEqual([chapter.id, figure.id, bib.id]);
  await expect(
    latexDependencies('\\includegraphics{missing}', main, [figure], async () => ''),
  ).rejects.toThrow('Missing literal');
});
