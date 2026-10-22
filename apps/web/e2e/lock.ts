import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Single-runner lock for the e2e suite. Every spec signs in as the same Clerk test user (shell.spec even switches its
 * current profile), so two runners at once corrupt each other's state. The lock is `apps/web/test-results/.e2e.lock`
 * in the MAIN checkout (found through git's common dir), so runners in different worktrees see the same file.
 * Override with E2E_LOCK_FILE. A lock older than 30 minutes, or whose pid is gone, is stale and taken over.
 * A second runner waits up to E2E_LOCK_WAIT_MS (default 5 minutes), then fails with the holder's pid and start time.
 */
export const STALE_AFTER_MS = 30 * 60_000;

type LockBody = { pid: number; startedAt: string; cwd: string };

export function lockFilePath(): string {
  if (process.env.E2E_LOCK_FILE) return path.resolve(process.env.E2E_LOCK_FILE);
  const webDir = path.resolve(__dirname, "..");
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: webDir, encoding: "utf8" }).trim();
    return path.join(path.dirname(common), "apps", "web", "test-results", ".e2e.lock");
  } catch {
    return path.join(webDir, "test-results", ".e2e.lock");
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readLock(file: string): LockBody | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LockBody;
  } catch {
    return null;
  }
}

/** Why a held lock is stale, or null when its holder is alive and recent. */
export function staleReason(body: LockBody | null, now = Date.now(), alive = pidAlive): string | null {
  if (!body || typeof body.pid !== "number") return "unreadable";
  const age = now - Date.parse(body.startedAt);
  if (!Number.isFinite(age) || age > STALE_AFTER_MS) return `older than 30 minutes (started ${body.startedAt})`;
  if (!alive(body.pid)) return `pid ${body.pid} is not running`;
  return null;
}

export async function acquireE2eLock(file = lockFilePath()): Promise<() => void> {
  const waitMs = Number(process.env.E2E_LOCK_WAIT_MS ?? 5 * 60_000);
  const deadline = Date.now() + waitMs;
  mkdirSync(path.dirname(file), { recursive: true });
  let announced = false;
  for (;;) {
    const body: LockBody = { pid: process.pid, startedAt: new Date().toISOString(), cwd: process.cwd() };
    try {
      writeFileSync(file, JSON.stringify(body), { flag: "wx" });
      return () => {
        if (readLock(file)?.pid === process.pid) rmSync(file, { force: true });
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const held = readLock(file);
    const stale = staleReason(held);
    if (stale) {
      console.warn(`e2e lock: taking over a stale lock (${stale}): ${file}`);
      rmSync(file, { force: true });
      continue;
    }
    const holder = `pid ${held!.pid}, started ${held!.startedAt}, in ${held!.cwd}`;
    if (Date.now() >= deadline) {
      throw new Error(
        `Another e2e run holds the lock (${holder}). Only one runner may use the shared Clerk test user at a time. ` +
          `Wait for it to finish, or delete ${file} if that run is gone.`,
      );
    }
    if (!announced) {
      console.warn(`e2e lock: waiting for another run (${holder}) …`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

/** Playwright globalSetup: holds the lock for the whole run; the returned function is the teardown. */
export default async function globalSetup() {
  return acquireE2eLock();
}
