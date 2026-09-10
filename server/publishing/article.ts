import { z } from 'zod';
import type { Artifact, Source } from '../../shared/protocol';
import type { ToolContext } from '../toolkit';
import { present } from '../canvas';

export const compilationSchema = z.object({
  sourceArtifactId: z.string(),
  inputArtifactIds: z.array(z.string()).max(9).default([]),
  title: z.string().min(1).max(160).default('Scientific article'),
});
export const articleReviewSchema = z.object({
  sourceArtifactId: z.string(),
  compileManifestId: z.string(),
  references: z
    .array(z.object({ key: z.string().min(1), sourceId: z.string() }))
    .max(100)
    .default([]),
  claims: z
    .array(
      z.object({
        claim: z.string().min(1).max(2000),
        location: z.string().min(1).max(300),
        kind: z.enum(['computed', 'formal', 'literature', 'interpretation', 'conjecture']),
        evidenceIds: z.array(z.string()).max(20),
        limitations: z.string().min(1).max(3000),
      }),
    )
    .min(1)
    .max(100),
});
interface CompilationManifest {
  sourceArtifactId: string;
  sourceHash: string;
  inputArtifactIds: string[];
  executionRecordId: string;
  pdfArtifactId?: string;
  reportArtifactId?: string;
  pageArtifactIds: string[];
}
export async function compileLatex(
  args: unknown,
  ctx: ToolContext,
  execute: (request: unknown) => Promise<unknown>,
) {
  const request = compilationSchema.parse(args);
  const source = await ctx.store.readArtifact(ctx.researchId, request.sourceArtifactId);
  if (!source.name.toLowerCase().endsWith('.tex'))
    throw new Error('Choose a .tex source artifact.');
  const inputs = [...new Set(request.inputArtifactIds.filter((id) => id !== source.id))];
  const names = new Set<string>();
  for (const id of inputs) {
    const file = await ctx.store.readArtifact(ctx.researchId, id);
    if (names.has(file.name))
      throw new Error(`Duplicate input filename: ${file.name}. Select one version.`);
    names.add(file.name);
  }
  const result = (await execute({
    language: 'latex',
    title: request.title,
    code: Buffer.from(source.data, 'base64').toString('utf8'),
    inputArtifactIds: inputs,
  })) as { exitCode: number; artifacts: Artifact[]; executionRecordId: string; stdout: string };
  const pdf = result.artifacts.find((a) => a.name === 'paper.pdf');
  const report = result.artifacts.find((a) => a.name === 'compile-report.json');
  if (!report)
    throw new Error(
      'The research worker is required for article compilation. Build bun run lab:research. Compiler details are in the canvas.',
    );
  const manifest: CompilationManifest = {
    sourceArtifactId: source.id,
    sourceHash: source.sha256,
    inputArtifactIds: inputs,
    executionRecordId: result.executionRecordId,
    pdfArtifactId: pdf?.id,
    reportArtifactId: report.id,
    pageArtifactIds: result.artifacts
      .filter((a) => /^paper-page-\d+\.png$/.test(a.name))
      .map((a) => a.id),
  };
  const saved = await ctx.store.artifact(
    ctx.researchId,
    'article-build.json',
    'application/json',
    Buffer.from(JSON.stringify(manifest, null, 2)),
    'Article compiler manifest; source and inputs linked to actual execution',
  );
  if (pdf)
    await present(
      {
        title: request.title,
        caption:
          'Compiled LaTeX manuscript. Scientific and editorial review are separate from compilation.',
        artifactIds: [pdf.id],
      },
      ctx,
    );
  ctx.changed();
  return {
    ...manifest,
    compileManifestId: saved.id,
    exitCode: result.exitCode,
    instruction:
      'Read compile-report.json, inspect the PDF pages, then review_article with this exact source and compileManifestId. Address warnings before delivery.',
  };
}
export interface ArticleIssue {
  severity: 'blocker' | 'warning';
  code: string;
  message: string;
}
export function lintArticle(source: string): ArticleIssue[] {
  const issues: ArticleIssue[] = [];
  const body = source
    .split('\n')
    .filter((line) => !/^\s*\\patchcmd\{\\(?:abstract|IEEEkeywords)\}/.test(line))
    .map((line) => line.replace(/(?<!\\)%.*$/, ''))
    .join('\n');
  const block = (code: string, message: string) =>
    issues.push({ severity: 'blocker', code, message });
  if (/\u2014|---|\\textemdash|\\emdash/.test(body))
    block('em-dash', 'Replace every em dash with sentence punctuation.');
  if (!/\\documentclass(?:\[[^\]]*\])?\{IEEEtran\}/.test(body))
    block('class', 'Use the actual IEEEtran document class.');
  for (const [name, regex] of Object.entries({
    title: /\\title\{[^}]+\}/,
    abstract: /\\begin\{abstract\}[\s\S]+?\\end\{abstract\}/,
    methods:
      /\\section\*?(?:\[[^\]]*\])?\{[^}]*(?:Methods?|Methodology|Experimental|Approach)[^}]*\}/i,
    results: /\\section\*?(?:\[[^\]]*\])?\{[^}]*(?:Results?|Evaluation)[^}]*\}/i,
    limitations: /(?:limitations|threats to validity)/i,
    references: /\\(?:bibliography\{|begin\{thebibliography\})/,
  })) {
    if (!regex.test(body))
      block(`missing-${name}`, `The manuscript needs a concrete ${name} section or field.`);
  }
  if (
    /\b(?:TODO|TBD|lorem ipsum|replace this guidance|replace with specific|A Precise Title)\b/i.test(
      body,
    )
  )
    block('placeholder', 'Remove template placeholders and unfinished prose.');
  if (
    /\\usepackage(?:\[[^\]]*\])?\{geometry\}|\\(?:textwidth|textheight|oddsidemargin|evensidemargin)\s*=|\\vspace\*?\{-/.test(
      body,
    )
  )
    issues.push({
      severity: 'warning',
      code: 'layout-override',
      message: 'Review manual IEEE layout overrides and negative spacing.',
    });
  if (
    /\b(?:revolutionary|groundbreaking|unprecedented|perfectly proves|guarantees correctness)\b/i.test(
      body,
    )
  )
    issues.push({
      severity: 'warning',
      code: 'overstatement',
      message:
        'Replace promotional or universal claims with the specific contribution supported by evidence.',
    });
  return issues;
}
export async function reviewArticle(args: unknown, ctx: ToolContext) {
  const request = articleReviewSchema.parse(args);
  const read = async (id: string) => {
    const a = await ctx.store.readArtifact(ctx.researchId, id);
    return { artifact: a, text: Buffer.from(a.data, 'base64').toString('utf8') };
  };
  const source = await read(request.sourceArtifactId);
  const savedManifest = await read(request.compileManifestId);
  if (!savedManifest.artifact.provenance.startsWith('Article compiler manifest;'))
    throw new Error('Select a manifest created by compile_latex.');
  const manifest = JSON.parse(savedManifest.text) as CompilationManifest;
  if (
    manifest.sourceArtifactId !== source.artifact.id ||
    manifest.sourceHash !== source.artifact.sha256
  )
    throw new Error(
      'The audit source differs from the compiled source. Recompile the exact final version.',
    );
  const inputFiles = await Promise.all(manifest.inputArtifactIds.map(read));
  const manuscript = [
    source.text,
    ...inputFiles.filter((f) => f.artifact.name.endsWith('.tex')).map((f) => f.text),
  ].join('\n');
  const issues = lintArticle(manuscript);
  const block = (code: string, message: string) =>
    issues.push({ severity: 'blocker', code, message });
  const evidence = await read(manifest.executionRecordId);
  const execution = JSON.parse(evidence.text) as { exitCode: number; artifacts: Artifact[] };
  if (
    !evidence.artifact.provenance.startsWith('Execution record for') ||
    execution.exitCode !== 0 ||
    !manifest.pdfArtifactId
  )
    block('compilation', 'A successful actual compilation and PDF are required.');
  if (manifest.reportArtifactId) {
    const report = JSON.parse((await read(manifest.reportArtifactId)).text);
    if (report.unresolvedReferences)
      block('references', 'The final compiler log contains unresolved references or citations.');
    if (report.textContainsEmDash)
      block(
        'rendered-em-dash',
        'The compiled PDF contains an em dash. Inspect source, included files, and labels.',
      );
    if (report.overfullBoxes)
      block(
        'overflow',
        `${report.overfullBoxes} overfull text boxes require correction and visual review.`,
      );
  }
  for (const file of inputFiles) {
    if (/\.(?:tex|bib)$/.test(file.artifact.name) && /\u2014|---|\\textemdash/.test(file.text))
      block('input-em-dash', `${file.artifact.name} contains an em-dash representation.`);
  }
  const citations = [...manuscript.matchAll(/\\cite\w*\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)].flatMap(
    (m) => m[1]!.split(',').map((k) => k.trim()),
  );
  const references = new Map(request.references.map((r) => [r.key, r.sourceId]));
  for (const key of new Set(citations))
    if (!references.has(key))
      block('unmapped-citation', `Citation ${key} is missing its source provenance mapping.`);
  for (const ref of request.references) {
    const entry = ctx.store.get<Source>('source', ref.sourceId);
    if (!entry || entry.researchId !== ctx.researchId)
      block('missing-source', `Reference ${ref.key} does not point to a source in this research.`);
    else if (entry.kind !== 'read')
      issues.push({
        severity: 'warning',
        code: 'source-metadata',
        message: `Reference ${ref.key} has metadata only; verify the source's content before supporting a scientific claim.`,
      });
  }
  for (const [index, claim] of request.claims.entries()) {
    const label = `Claim ${index + 1}`;
    const artifacts: { artifact: Artifact; value?: { exitCode?: number; language?: string } }[] =
      [];
    let sources = 0;
    for (const id of claim.evidenceIds) {
      const a = ctx.store.get<Artifact>('artifact', id);
      const s = ctx.store.get<Source>('source', id);
      if ((!a || a.researchId !== ctx.researchId) && (!s || s.researchId !== ctx.researchId)) {
        block('missing-evidence', `${label} references evidence outside this research.`);
        continue;
      }
      if (s?.researchId === ctx.researchId) sources++;
      if (a?.researchId === ctx.researchId) {
        let value: { exitCode?: number; language?: string } | undefined;
        if (a.provenance.startsWith('Execution record for')) {
          try {
            value = JSON.parse((await read(id)).text);
          } catch {
            /* Invalid record cannot support an executed claim. */
          }
        }
        artifacts.push({ artifact: a, value });
      }
    }
    if (claim.kind !== 'conjecture' && !claim.evidenceIds.length)
      block('empty-evidence', `${label} needs evidence or must be labeled a conjecture.`);
    if (claim.kind === 'computed' && !artifacts.some((a) => a.value?.exitCode === 0))
      block(
        'unexecuted-result',
        `${label} needs a successful execution record, not only an authored result file.`,
      );
    if (
      claim.kind === 'formal' &&
      !artifacts.some((a) => a.value?.exitCode === 0 && a.value.language === 'lean')
    )
      block('unproved-theorem', `${label} needs a successful checked Lean execution record.`);
    if (claim.kind === 'literature' && !sources)
      block('literature-source', `${label} needs a retrieved source.`);
  }
  const audit = {
    status: issues.some((i) => i.severity === 'blocker') ? 'needs_revision' : 'checks_passed',
    scientificValidity: 'requires_independent_review',
    scope:
      'Mechanical formatting and evidence linkage only. Neither claim completeness nor scientific entailment is automatically certified.',
    sourceArtifactId: source.artifact.id,
    sourceHash: source.artifact.sha256,
    compileManifestId: request.compileManifestId,
    references: request.references,
    claims: request.claims,
    issues,
    assessedBy: ctx.agentId,
    assessedAt: Date.now(),
  };
  const artifact = await ctx.store.artifact(
    ctx.researchId,
    'article-review.json',
    'application/json',
    Buffer.from(JSON.stringify(audit, null, 2)),
    'Mechanical article audit; scientific validity requires independent review',
  );
  await present(
    {
      title: 'Manuscript review',
      content: `## ${audit.status === 'checks_passed' ? 'Mechanical checks passed' : 'Revision required'}\n\n${request.claims.length} central claims linked to evidence. Scientific interpretation still requires independent review.\n\n${issues.length ? issues.map((i) => `- **${i.severity}:** ${i.message}`).join('\n') : 'No mechanical blockers found.'}`,
      format: 'markdown',
    },
    ctx,
  );
  ctx.changed();
  return { ...audit, auditArtifactId: artifact.id };
}
