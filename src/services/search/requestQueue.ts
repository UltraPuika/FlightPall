/**
 * Concurrency-limited, rate-throttled task queue with retries and cancellation.
 */
import { ProviderError } from '../providers/types';

export interface QueueOptions {
  concurrency: number;
  minIntervalMs: number;
  maxRetries: number;
  baseBackoffMs: number;
  signal: AbortSignal;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function isAbort(err: unknown): boolean {
  return (err as Error)?.name === 'AbortError';
}

export type TaskOutcome<T> = { ok: true; value: T; attempts: number } | { ok: false; error: Error; attempts: number };

/**
 * Runs `tasks` with the given limits. `onSettled` fires as each task finishes, so
 * callers can stream partial results. Resolves with outcomes in task order.
 */
export async function runQueue<T>(
  tasks: (() => Promise<T>)[],
  opts: QueueOptions,
  onSettled?: (index: number, outcome: TaskOutcome<T>) => void,
): Promise<TaskOutcome<T>[]> {
  const sleep = opts.sleep ?? abortableSleep;
  const results: TaskOutcome<T>[] = new Array(tasks.length);
  let next = 0;
  let lastStart = 0;
  let startGate: Promise<void> = Promise.resolve();

  // Serialise request *starts* to honour minIntervalMs between them
  const waitForSlot = () => {
    const gate = startGate.then(async () => {
      const wait = lastStart + opts.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait, opts.signal);
      lastStart = Date.now();
    });
    startGate = gate.catch(() => undefined);
    return gate;
  };

  async function runOne(index: number): Promise<TaskOutcome<T>> {
    let attempt = 0;
    for (;;) {
      attempt++;
      if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await waitForSlot();
      try {
        return { ok: true, value: await tasks[index](), attempts: attempt };
      } catch (err) {
        if (isAbort(err)) throw err;
        const retryable = err instanceof ProviderError ? err.retryable : false;
        if (!retryable || attempt > opts.maxRetries) return { ok: false, error: err as Error, attempts: attempt };
        const backoff = (err as ProviderError).retryAfterMs ?? opts.baseBackoffMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
        await sleep(Math.min(backoff, 30_000), opts.signal);
      }
    }
  }

  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      const outcome = await runOne(index);
      results[index] = outcome;
      onSettled?.(index, outcome);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency, tasks.length)) }, worker));
  return results;
}
