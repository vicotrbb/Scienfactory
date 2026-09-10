import { Database } from 'bun:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
import type { Artifact, Source } from '../shared/protocol';
const store = new Store('.data/publishing-validation');
const research = store.create('IEEE article · verified spatial truss study');
const ctx: ToolContext = {
  store,
  lab: new DockerLab(),
  researchId: research.id,
  agentId: 'validation-editor',
  signal: new AbortController().signal,
  changed: () => {},
  log: (type, text) => store.activity(research.id, type, text),
  delegate: async () => [],
};
try {
  const db = new Database('.data/research.sqlite', { readonly: true });
  const rows = (
    db
      .query("SELECT data FROM entities WHERE kind='artifact' AND research_id=? ORDER BY rowid")
      .all('2ac46316-c725-436b-b6f2-d7da9fbbda5e') as { data: string }[]
  ).map((r) => JSON.parse(r.data) as Artifact);
  db.close();
  const copied: Artifact[] = [];
  for (const name of [
    'engineering-results.json',
    'structure.json',
    'independent-verification.json',
    'validation-review.md',
    'truss.glb',
  ]) {
    const a = rows.findLast((a) => a.name === name);
    if (!a) throw new Error(`Missing source ${name}`);
    copied.push(
      await store.artifact(
        research.id,
        name,
        a.mime,
        new Uint8Array(await Bun.file(`.data/blobs/${a.sha256}`).arrayBuffer()),
        `Imported local research evidence; original SHA-256 ${a.sha256}`,
      ),
    );
  }
  store.message(
    research.id,
    'user',
    'Prepare and validate an IEEE-style article from the corrected 100 N truss study. This local validation uses real containers and a locally authored manuscript. It makes no external model calls.',
  );
  const plan = () =>
    executeTool(
      'update_plan',
      {
        goal: 'Prepare a reproducible scientific article',
        steps: [
          {
            id: 'verify',
            title: 'Independently reconstruct all three truss cases',
            status: 'complete',
          },
          {
            id: 'write',
            title: 'Write the IEEE manuscript and publication figure',
            status: 'complete',
          },
          { id: 'compile', title: 'Compile and audit the exact final source', status: 'complete' },
          {
            id: 'visual',
            title: 'Inspect every rendered page',
            status: 'pending',
            detail: 'Local visual review follows compilation.',
          },
        ],
      },
      ctx,
    );
  const verification = (await executeTool(
    'execute',
    {
      title: 'Independent three-case verification and publication figure',
      language: 'python',
      code: await Bun.file('tests/publishing/verify-and-plot.py').text(),
      inputArtifactIds: [copied.find((a) => a.name === 'engineering-results.json')!.id],
    },
    ctx,
  )) as { exitCode: number; stdout: string; artifacts: Artifact[]; executionRecordId: string };
  if (verification.exitCode !== 0) throw new Error(verification.stdout);
  const source = await store.artifact(
    research.id,
    'truss-study.tex',
    'text/x-tex',
    Buffer.from(await Bun.file('tests/publishing/article.tex').text()),
    'Locally authored AI-assisted anonymous validation draft',
  );
  const bib = await store.artifact(
    research.id,
    'references.bib',
    'text/plain',
    Buffer.from(await Bun.file('tests/publishing/references.bib').text()),
    'References checked against primary documentation',
  );
  const sourceDefinitions = [
    {
      key: 'purdue',
      title: 'Stiffness Methods for Systematic Analysis of Structures',
      url: 'https://engineering.purdue.edu/~aprakas/CE474/CE474-Ch5-StiffnessMethod.pdf',
      excerpt:
        'Course notes describe member relations, coordinate transformation, global assembly, support constraints, and space trusses.',
    },
    {
      key: 'numpy',
      title: 'numpy.linalg.solve, NumPy 2.2 Manual',
      url: 'https://numpy.org/doc/2.2/reference/generated/numpy.linalg.solve.html',
      excerpt: 'Reference documentation for solving a square full-rank linear system.',
    },
  ];
  const references = sourceDefinitions.map((s) => ({
    key: s.key,
    sourceId: store.put<Source>('source', {
      id: crypto.randomUUID(),
      researchId: research.id,
      title: s.title,
      url: s.url,
      excerpt: s.excerpt,
      kind: 'read',
      retrievedAt: Date.now(),
    }).id,
  }));
  const build = (await executeTool(
    'compile_latex',
    {
      sourceArtifactId: source.id,
      inputArtifactIds: [
        bib.id,
        verification.artifacts.find((a) => a.name === 'depth-tradeoff.pdf')!.id,
      ],
      title: 'Depth, compliance, and verification',
    },
    ctx,
  )) as {
    exitCode: number;
    compileManifestId: string;
    executionRecordId: string;
    pdfArtifactId: string;
    reportArtifactId: string;
    pageArtifactIds: string[];
  };
  const audit = (await executeTool(
    'review_article',
    {
      sourceArtifactId: source.id,
      compileManifestId: build.compileManifestId,
      references,
      claims: [
        {
          claim:
            'The three corrected 100 N cases reproduce saved deflections and satisfy equilibrium and energy tests.',
          location: 'Results, Table I',
          kind: 'computed',
          evidenceIds: [
            verification.executionRecordId,
            verification.artifacts.find((a) => a.name === 'verification.json')!.id,
          ],
          limitations:
            'A small finite linear axial-bar model; no physical or structural safety certification.',
        },
        {
          claim:
            'Increasing depth reduces calculated deflection and increases ideal member volume for these three configurations.',
          location: 'Results, Figure 1',
          kind: 'computed',
          evidenceIds: [
            verification.executionRecordId,
            copied.find((a) => a.name === 'engineering-results.json')!.id,
          ],
          limitations: 'No general power law, optimum, or comparison across topologies is claimed.',
        },
        {
          claim: 'The calculation follows the established direct stiffness method.',
          location: 'Introduction and Methods',
          kind: 'literature',
          evidenceIds: [references[0]!.sourceId],
          limitations:
            'The cited method does not independently validate this model or its implementation.',
        },
      ],
    },
    ctx,
  )) as { status: string; auditArtifactId: string; issues: unknown[] };
  await plan();
  await executeTool(
    'present',
    {
      title: 'The research behind the article',
      caption:
        'The saved geometry remains interactive. The paper uses a separately regenerated publication figure.',
      artifactIds: [
        copied.find((a) => a.name === 'truss.glb')!.id,
        verification.artifacts.find((a) => a.name === 'depth-tradeoff.png')!.id,
      ],
    },
    ctx,
  );
  store.message(
    research.id,
    'assistant',
    `The local article compilation and evidence-linkage audit finished with status: ${audit.status}. Source, PDF, bibliography, numerical data, independent verification, and compiler diagnostics are preserved. Page-by-page visual review is a separate check. This sample was prepared locally; it is not evidence that a live provider autonomously wrote or reviewed it.`,
  );
  store.updateResearch(research.id, { status: build.exitCode === 0 ? 'completed' : 'failed' });
  mkdirSync('output/pdf', { recursive: true });
  for (const id of [
    source.id,
    bib.id,
    build.pdfArtifactId,
    build.reportArtifactId,
    ...build.pageArtifactIds,
    audit.auditArtifactId,
    ...verification.artifacts.map((a) => a.id),
    ...copied.map((a) => a.id),
    verification.executionRecordId,
    build.compileManifestId,
    build.executionRecordId,
  ]) {
    if (!id) continue;
    const a = await store.readArtifact(research.id, id);
    writeFileSync(join('output/pdf', a.name), Buffer.from(a.data, 'base64'));
  }
  writeFileSync(
    'output/pdf/verify-and-plot.py',
    await Bun.file('tests/publishing/verify-and-plot.py').text(),
  );
  const report = JSON.parse(
    Buffer.from(
      (await store.readArtifact(research.id, build.reportArtifactId)).data,
      'base64',
    ).toString(),
  );
  console.log(
    JSON.stringify({
      researchId: research.id,
      build,
      report,
      audit,
      verification: verification.stdout,
    }),
  );
  if (build.exitCode !== 0) throw new Error('Paper compilation failed.');
} finally {
  store.close();
}
