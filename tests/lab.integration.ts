import { DockerLab } from '../server/lab';
import { examples } from '../shared/examples';
import type { Language } from '../shared/protocol';
const lab = new DockerLab();
if (!(await lab.capabilities()).image)
  throw new Error('Build the lab image before integration testing.');
for (const language of Object.keys(examples) as Language[]) {
  const result = await lab.execute(
    { language, code: examples[language] },
    new AbortController().signal,
  );
  if (result.exitCode !== 0)
    throw new Error(`${language} failed: ${result.stdout}\n${result.error ?? ''}`);
  if (language !== 'lean' && !result.artifacts.length)
    throw new Error(`${language} generated no artifacts.`);
  console.log(
    JSON.stringify({
      language,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      artifacts: result.artifacts.map((a) => a.name),
    }),
  );
}
const invalid = await lab.execute(
  { language: 'lean', code: 'theorem invalid : False := by sorry' },
  new AbortController().signal,
);
if (invalid.exitCode === 0) throw new Error('Lean accepted a proof hole');
const isolation = await lab.execute(
  {
    language: 'python',
    code: `import os, socket
assert 'OPENAI_API_KEY' not in os.environ
assert not os.path.exists('/var/run/docker.sock')
assert not os.path.exists('/Users')
try:
    open('/escape', 'w').write('test')
    raise AssertionError('Root filesystem is writable')
except OSError:
    pass
s = socket.socket()
s.settimeout(1)
try:
    s.connect(('1.1.1.1', 443))
    raise AssertionError('Network escaped')
except OSError:
    pass
print('isolation verified')`,
  },
  new AbortController().signal,
);
if (isolation.exitCode !== 0 || !isolation.stdout.includes('isolation verified'))
  throw new Error('Isolation verification failed');
const abort = new AbortController();
const job = lab.execute({ language: 'python', code: 'import time; time.sleep(60)' }, abort.signal);
setTimeout(() => abort.abort(), 1200);
let cancelled = false;
try {
  await job;
} catch {
  cancelled = true;
}
if (!cancelled) throw new Error('Cancellation did not abort execution');
const unicode = await lab.execute(
  { language: 'python', code: 'print("∑" * 5000)' },
  new AbortController().signal,
);
if (unicode.stdout !== '∑'.repeat(5000) + '\n') throw new Error('Unicode output was corrupted');
const animation = await lab.execute(
  {
    language: 'python',
    code: "import subprocess\nsubprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=320x240:rate=12','-t','1','-pix_fmt','yuv420p','-y','artifacts/animation.mp4'],check=True)",
  },
  new AbortController().signal,
);
if (animation.exitCode !== 0 || !animation.artifacts.some((a) => a.name === 'animation.mp4'))
  throw new Error('Animation rendering failed: ' + animation.stdout);
console.log(
  'PASS: seven runtimes, proof-hole rejection, network/filesystem/credential isolation, cancellation, Unicode streaming, and MP4 rendering',
);
