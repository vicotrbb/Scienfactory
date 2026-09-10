import { expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store';
import { DockerLab } from '../server/lab';
import { executeTool, type ToolContext } from '../server/toolkit';
import type { ModelAttachment } from '../server/providers';
const root = mkdtempSync(join(tmpdir(), 'scienfactory-files-'));
const store = new Store(root);
const lab = new DockerLab();
const research = store.create('File inspection verification');
const visual: ModelAttachment[] = [];
const ctx: ToolContext = {
  store,
  lab,
  researchId: research.id,
  agentId: 'file-test',
  signal: new AbortController().signal,
  changed: () => {},
  log: () => {},
  delegate: async () => [],
  attach: (files) => visual.push(...files),
};
try {
  const fixtures = await lab.execute(
    { language: 'python', code: await Bun.file('tests/fixtures-files.py').text() },
    ctx.signal,
  );
  expect(fixtures.exitCode).toBe(0);
  const files = await Promise.all(
    fixtures.artifacts.map((a) =>
      store.artifact(
        research.id,
        a.name,
        a.mime,
        Buffer.from(a.data, 'base64'),
        'Validation fixture',
      ),
    ),
  );
  const results = [];
  for (const name of [
    'notes.docx',
    'slides.pptx',
    'data.xlsx',
    'scan.png',
    'scanned.pdf',
    'sample.csv',
    'array.npy',
    'missing-values.npy',
    'data.parquet',
    'data.h5',
    'data.nc',
    'measurements.sqlite',
    'sphere.stl',
    'archive.zip',
    'speech.wav',
    'clip.mp4',
    'unknown.bin',
    'encrypted.pdf',
    'broken.pdf',
    'unsafe.npy',
    'bomb.zip',
  ]) {
    const artifact = files.find((a) => a.name === name);
    if (!artifact) throw new Error(`Missing fixture ${name}`);
    const report = (await executeTool('inspect_file', { artifactId: artifact.id }, ctx)) as {
      status: string;
      text: string;
      metadata: unknown;
      visualInputsAttached: number;
      warnings: string[];
    };
    const expected = ['encrypted.pdf', 'broken.pdf', 'unsafe.npy', 'bomb.zip'].includes(name)
      ? 'unreadable'
      : name === 'unknown.bin'
        ? 'unsupported'
        : 'inspected';
    expect(report.status).toBe(expected);
    if (name === 'notes.docx') expect(report.text).toContain('100 newtons');
    if (name === 'slides.pptx') expect(report.text).toContain('42');
    if (name === 'data.xlsx') expect(report.text).toContain('=B2*2');
    if (['scan.png', 'scanned.pdf'].includes(name)) {
      expect(report.text).toContain('CONTROL 42');
      expect(report.visualInputsAttached).toBeGreaterThan(0);
    }
    if (name === 'speech.wav') {
      expect(report.text.toLowerCase()).toMatch(/100|hundred/);
      expect(report.text.toLowerCase()).toMatch(/42|forty.?two/);
      expect(report.text.toLowerCase()).toContain('newton');
    }
    if (name === 'missing-values.npy') expect(JSON.stringify(report.metadata)).toContain('NaN');
    if (name === 'clip.mp4') expect(report.visualInputsAttached).toBeGreaterThan(0);
    results.push({ file: name, status: report.status, visualInputs: report.visualInputsAttached });
    console.log(JSON.stringify(results.at(-1)));
  }
  const archive = files.find((a) => a.name === 'archive.zip')!;
  const member = (await executeTool(
    'inspect_file',
    { artifactId: archive.id, member: 'notes.txt' },
    ctx,
  )) as { text: string };
  expect(member.text).toContain('Archive control: 42');
  await expect(
    executeTool('inspect_file', { artifactId: archive.id, member: '../escape.txt' }, ctx),
  ).rejects.toThrow();
  expect(visual.some((a) => a.mime === 'application/pdf')).toBe(true);
  console.log(JSON.stringify({ passed: results.length + 2, visualInputs: visual.length, root }));
} finally {
  store.close();
}
