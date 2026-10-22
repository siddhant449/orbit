import { TransientJobError, type EnqueueOptions, type JobDriver, type JobHandler } from "./types";

export type LocalDriverOptions = {
  handlers: Record<string, JobHandler>;
  maxAttempts?: number;
  /** Wait before retry n is `retryDelayMs * n`. */
  retryDelayMs?: number;
  /** How the work is scheduled after enqueue returns. Default: a timer. The web app passes Next's `after`. */
  defer?: (run: () => Promise<void>) => void;
  /** Called for a final failure with the error (log the message only; payloads are ids). */
  onError?: (error: Error, info: { topic: string }) => void;
};

/** In-process driver: runs handlers in this Node process. Not durable across restarts (QStash comes later). */
export function createLocalDriver(opts: LocalDriverOptions): JobDriver {
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 2_000;
  const defer = opts.defer ?? ((run) => void setTimeout(() => void run(), 0));
  const seen = new Set<string>();
  const inflight = new Set<Promise<void>>();

  async function run(topic: string, handler: JobHandler, payload: unknown) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await handler(payload, { attempt, maxAttempts });
        return;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (err instanceof TransientJobError && attempt < maxAttempts) {
          if (retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
          continue;
        }
        opts.onError?.(error, { topic });
        return;
      }
    }
  }

  return {
    async enqueue(topic, payload, o: EnqueueOptions = {}) {
      const handler = opts.handlers[topic];
      if (!handler) throw new Error(`No handler for job topic "${topic}"`);
      if (o.dedupeId) {
        if (seen.has(o.dedupeId)) return;
        seen.add(o.dedupeId);
      }
      let done!: () => void;
      const tracked = new Promise<void>((resolve) => (done = resolve));
      inflight.add(tracked);
      defer(async () => {
        try {
          const wait = o.notBefore ? o.notBefore.getTime() - Date.now() : 0;
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          await run(topic, handler, payload);
        } finally {
          inflight.delete(tracked);
          done();
        }
      });
    },
    async idle() {
      while (inflight.size > 0) await Promise.all([...inflight]);
    },
  };
}
