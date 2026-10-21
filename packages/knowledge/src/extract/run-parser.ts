import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, type ResourceLimits } from "node:worker_threads";
import { IngestError } from "../errors";

export const PARSE_TIMEOUT_MS = 60_000;
export const PARSE_RESOURCE_LIMITS: ResourceLimits = { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 64 };
const TOO_COMPLEX = "That file is too large or complex to read.";

export type ParseJob = { buf: Buffer; mime: string; maxChars: number; maxInflateBytes?: number };
export type ParseOptions = { timeoutMs?: number; resourceLimits?: ResourceLimits; workerFile?: string };

/**
 * Where the plain-JS worker entry lives. It is deliberately NOT a bundled asset: Turbopack would emit it
 * outside node_modules resolution, so its imports (mammoth, unpdf, ...) would not resolve. We look next to
 * this source file first, then relative to the working directory (apps/web in dev and `next start`).
 */
function workerPath(): string {
  const rel = "./parse-worker.mjs"; // non-literal on purpose: keeps bundlers from rewriting the URL
  const candidates = [
    fileURLToPath(new URL(rel, import.meta.url)),
    resolve(process.cwd(), "packages/knowledge/src/extract/parse-worker.mjs"),
    resolve(process.cwd(), "../../packages/knowledge/src/extract/parse-worker.mjs"),
  ];
  const found = candidates.find((p) => existsSync(p) && existsSync(join(dirname(p), "parse-core.mjs")));
  if (!found) throw new IngestError(TOO_COMPLEX);
  return found;
}

/**
 * Parses an untrusted document in a worker thread with a memory ceiling. A hang is killed by
 * `worker.terminate()` at the timeout; an out-of-memory crash or non-zero exit becomes a readable error.
 */
export function parseInWorker(job: ParseJob, opts: ParseOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? PARSE_TIMEOUT_MS;
  return new Promise<string>((resolvePromise, reject) => {
    const copy = new Uint8Array(job.buf); // a private copy, because a pooled Buffer's ArrayBuffer can't be transferred
    const worker = new Worker(/* webpackIgnore: true */ opts.workerFile ?? workerPath(), {
      workerData: { ...job, buf: copy },
      transferList: [copy.buffer],
      resourceLimits: opts.resourceLimits ?? PARSE_RESOURCE_LIMITS,
    });
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };
    const timer = setTimeout(
      () => done(() => reject(new IngestError("That file took too long to read"))),
      timeoutMs,
    );
    worker.once("message", (m: { ok: boolean; text?: string; message?: string | null }) =>
      done(() => {
        if (m.ok) resolvePromise(m.text ?? "");
        else reject(new IngestError(m.message || "Couldn't read that file"));
      }),
    );
    worker.once("error", () => done(() => reject(new IngestError(TOO_COMPLEX))));
    worker.once("exit", () => done(() => reject(new IngestError(TOO_COMPLEX))));
  });
}
