import { createLocalDriver, type LocalDriverOptions } from "./local";
import type { JobDriver } from "./types";

export * from "./types";
export { createLocalDriver } from "./local";
export type { LocalDriverOptions } from "./local";

/** JOBS_DRIVER=local (the default). The QStash driver is built with the rest of feature 4's job infrastructure. */
export function createJobDriver(env: Record<string, string | undefined>, opts: LocalDriverOptions): JobDriver {
  const driver = env.JOBS_DRIVER?.trim() || "local";
  if (driver === "qstash") throw new Error("JOBS_DRIVER=qstash is not built yet; use local");
  if (driver !== "local") throw new Error(`Unknown JOBS_DRIVER "${driver}"`);
  return createLocalDriver(opts);
}
