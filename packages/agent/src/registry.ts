/**
 * In-process registry of running chat turns (design §12). One entry per chat: the run's AbortController
 * and a buffer of its SSE chunks, so `GET /api/chat/:id/stream` can replay what was sent and tail the rest.
 * The buffer lives in this process only; other instances answer 204 and the client falls back to polling.
 */
export type RunRegistry = {
  start(chatId: string, runId: string): AbortController;
  attach(chatId: string, runId: string, sse: ReadableStream<string>): void;
  replay(chatId: string): ReadableStream<string> | null;
  abort(chatId: string, runId: string): boolean;
  finish(chatId: string, runId: string): void;
};

type Run = {
  runId: string;
  controller: AbortController;
  chunks: string[];
  /** The SSE copy has ended (or failed). */
  ended: boolean;
  listeners: Set<ReadableStreamDefaultController<string>>;
};

export function createRunRegistry(): RunRegistry {
  const runs = new Map<string, Run>();
  const current = (chatId: string, runId: string) => {
    const run = runs.get(chatId);
    return run && run.runId === runId ? run : null;
  };

  const end = (run: Run) => {
    run.ended = true;
    for (const l of run.listeners) {
      try {
        l.close();
      } catch {
        /* the reader already went away */
      }
    }
    run.listeners.clear();
  };

  return {
    start(chatId, runId) {
      const run: Run = { runId, controller: new AbortController(), chunks: [], ended: false, listeners: new Set() };
      runs.set(chatId, run);
      return run.controller;
    },

    attach(chatId, runId, sse) {
      const run = current(chatId, runId);
      if (!run) {
        // Not ours any more: drain it so the tee'd response stream is never held back.
        void sse.pipeTo(new WritableStream()).catch(() => {});
        return;
      }
      // Always read to the end: this copy keeps the turn running even after the browser disconnects.
      void (async () => {
        const reader = sse.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            run.chunks.push(value);
            for (const l of run.listeners) {
              try {
                l.enqueue(value);
              } catch {
                run.listeners.delete(l);
              }
            }
          }
        } catch {
          /* the source failed; the turn's own error handling reports it */
        } finally {
          end(run);
        }
      })();
    },

    replay(chatId) {
      const run = runs.get(chatId);
      if (!run || run.ended) return null;
      let self: ReadableStreamDefaultController<string>;
      return new ReadableStream<string>({
        start(controller) {
          self = controller;
          for (const chunk of run.chunks) controller.enqueue(chunk);
          if (run.ended) controller.close();
          else run.listeners.add(controller);
        },
        cancel() {
          run.listeners.delete(self);
        },
      });
    },

    abort(chatId, runId) {
      const run = current(chatId, runId);
      if (!run) return false;
      run.controller.abort();
      return true;
    },

    finish(chatId, runId) {
      if (current(chatId, runId)) runs.delete(chatId);
    },
  };
}

const KEY = Symbol.for("brandloop.agent.runRegistry");

/** The process-wide registry, kept on `globalThis` so dev reloads and route bundles share one. */
export function getRunRegistry(): RunRegistry {
  const g = globalThis as unknown as Record<symbol, RunRegistry | undefined>;
  return (g[KEY] ??= createRunRegistry());
}
