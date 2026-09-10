import type { Capabilities, Language } from '../shared/protocol';
import { Semaphore } from './concurrency';

export interface LabRequest {
  language: Language;
  code: string;
  inputs?: { name: string; data: string }[];
}
export interface LabResult {
  exitCode: number;
  stdout: string;
  durationMs: number;
  error?: string;
  artifacts: { name: string; mime: string; data: string }[];
}
export interface Lab {
  execute(
    request: LabRequest,
    signal: AbortSignal,
    onOutput?: (text: string) => void,
  ): Promise<LabResult>;
  capabilities(): Promise<Capabilities>;
}
const IMAGE = process.env.LAB_IMAGE ?? 'scienfactory-lab:research';
async function boundedText(stream: ReadableStream<Uint8Array>, limit = 16000) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream)
    if (size < limit) {
      const part = chunk.slice(0, limit - size);
      chunks.push(part);
      size += part.length;
    }
  return Buffer.concat(chunks).toString('utf8');
}

/** No host mounts, no network, no keys; one ephemeral container per execution. */
export class DockerLab implements Lab {
  private slots = new Semaphore(Number(process.env.LAB_CONCURRENCY ?? 2));
  async capabilities(): Promise<Capabilities> {
    try {
      const check = Bun.spawn(
        ['docker', 'image', 'inspect', IMAGE, '--format', '{{json .Config.Labels}}'],
        {
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const timer = setTimeout(() => check.kill(), 3000);
      const [error, output] = await Promise.all([
        new Response(check.stderr).text(),
        new Response(check.stdout).text(),
      ]);
      const exit = await check.exited;
      clearTimeout(timer);
      if (exit === 0) {
        const labels = JSON.parse(output) || {};
        const mathlib =
          typeof labels['scienfactory.mathlib'] === 'string'
            ? labels['scienfactory.mathlib']
            : undefined;
        return {
          docker: true,
          image: true,
          mathlib,
          documents: labels['scienfactory.documents'] === '1',
          speech: labels['scienfactory.speech'],
          detail: mathlib ? `Isolated lab ready · Mathlib ${mathlib}` : 'Isolated lab ready',
        };
      }
      return {
        docker: !/connect|permission denied|not running/i.test(error),
        image: false,
        detail: `Lab unavailable. Build the configured worker ${IMAGE} with Docker running; see the README setup.`,
      };
    } catch {
      return {
        docker: false,
        image: false,
        detail: 'Docker is not installed or cannot be reached.',
      };
    }
  }
  execute(
    request: LabRequest,
    signal: AbortSignal,
    onOutput: (text: string) => void = () => {},
  ): Promise<LabResult> {
    return this.slots.use(signal, async () => {
      const name = `scienfactory-job-${crypto.randomUUID()}`;
      const process = Bun.spawn(
        [
          'docker',
          'run',
          '--rm',
          '-i',
          '--name',
          name,
          '--label',
          'app=scienfactory-job',
          '--network',
          'none',
          '--env',
          'OPENBLAS_NUM_THREADS=2',
          '--env',
          'OMP_NUM_THREADS=2',
          '--env',
          'MKL_NUM_THREADS=2',
          '--read-only',
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges',
          '--pids-limit',
          '128',
          '--memory',
          '1536m',
          '--memory-swap',
          '1536m',
          '--cpus',
          '2',
          '--ulimit',
          'nofile=256:256',
          '--tmpfs',
          '/tmp:rw,nosuid,size=256m,mode=1777',
          '--tmpfs',
          '/workspace:rw,nosuid,size=512m,mode=1777',
          IMAGE,
        ],
        { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
      );
      let cleanup: Promise<unknown> | undefined;
      const stop = () => {
        cleanup ??= (async () => {
          const remove = async () => {
            const removal = Bun.spawn(['docker', 'rm', '-f', name], {
              stdout: 'ignore',
              stderr: 'ignore',
            });
            const timer = setTimeout(() => removal.kill(), 3000);
            await removal.exited;
            clearTimeout(timer);
          };
          await remove();
          process.kill();
          await process.exited;
          // Covers cancellation racing container creation in the Docker daemon.
          await remove();
        })();
      };
      signal.addEventListener('abort', stop, { once: true });
      const timeout = setTimeout(stop, 125000);
      process.stdin.write(JSON.stringify(request) + '\n');
      process.stdin.end();
      const result: LabResult = { exitCode: -1, stdout: '', durationMs: 0, artifacts: [] };
      const errorText = boundedText(process.stderr);
      let buffer = '';
      const decoder = new TextDecoder();
      let received = 0;
      try {
        for await (const chunk of process.stdout) {
          received += chunk.byteLength;
          if (received > 13 * 1024 * 1024) {
            stop();
            throw new Error('Container output exceeded its limit.');
          }
          buffer += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.type === 'stdout') {
              result.stdout += event.text;
              onOutput(event.text);
            }
            if (event.type === 'artifact')
              result.artifacts.push({ name: event.name, mime: event.mime, data: event.data });
            if (event.type === 'result') {
              result.exitCode = event.exitCode;
              result.durationMs = event.durationMs;
              result.error = event.error ?? undefined;
            }
          }
        }
        const exit = await process.exited;
        const stderr = await errorText;
        signal.throwIfAborted();
        if (exit !== 0 && result.exitCode === 0) result.exitCode = exit;
        if (result.exitCode === -1)
          throw new Error(
            exit === 0
              ? 'Container returned no execution result.'
              : `Container could not run. ${stderr.slice(0, 500)}`,
          );
        return result;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', stop);
        stop();
        await cleanup;
      }
    });
  }
}
