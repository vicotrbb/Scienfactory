/** FIFO permits; cancellation removes waiters and never steals a running permit. */
export class Semaphore {
  private active = 0;
  private waiters: {
    resolve: () => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
    abort: () => void;
  }[] = [];
  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid concurrency limit.');
  }
  async use<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.active < this.limit) this.active++;
    else
      await new Promise<void>((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          signal,
          abort: () => {
            const index = this.waiters.indexOf(waiter);
            if (index >= 0) this.waiters.splice(index, 1);
            reject(new Error('Cancelled while queued.'));
          },
        };
        signal.addEventListener('abort', waiter.abort, { once: true });
        this.waiters.push(waiter);
      });
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      const next = this.waiters.shift();
      if (next) {
        next.signal.removeEventListener('abort', next.abort);
        next.resolve();
      } else this.active--;
    }
  }
}
