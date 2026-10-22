/** Thrown by a handler to say "try again later" (a provider hiccup). Anything else thrown is a final failure. */
export class TransientJobError extends Error {
  constructor(message = "Transient job failure") {
    super(message);
    this.name = "TransientJobError";
  }
}

export type JobContext = { attempt: number; maxAttempts: number };
export type JobHandler = (payload: any, ctx: JobContext) => Promise<unknown>;
export type EnqueueOptions = { dedupeId?: string; notBefore?: Date };

export type JobDriver = {
  /** Queues the job and returns at once; the handler runs after the caller's response. */
  enqueue(topic: string, payload: unknown, opts?: EnqueueOptions): Promise<void>;
  /** Resolves when every job queued so far (including retries) has finished. For tests and graceful shutdown. */
  idle(): Promise<void>;
};
