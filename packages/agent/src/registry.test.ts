import { describe, expect, it } from "vitest";
import { createRunRegistry, getRunRegistry } from "./registry";

/** A source stream we push into by hand. */
function source() {
  let ctl!: ReadableStreamDefaultController<string>;
  const stream = new ReadableStream<string>({ start: (c) => void (ctl = c) });
  return { stream, push: (s: string) => ctl.enqueue(s), close: () => ctl.close() };
}

async function readAll(stream: ReadableStream<string>): Promise<string[]> {
  const out: string[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("RunRegistry", () => {
  it("replays buffered chunks then live ones, and returns null when idle", async () => {
    const reg = createRunRegistry();
    expect(reg.replay("c1")).toBeNull();

    reg.start("c1", "r1");
    const src = source();
    reg.attach("c1", "r1", src.stream);
    src.push("a");
    src.push("b");
    await tick();

    const replay = reg.replay("c1");
    expect(replay).not.toBeNull();
    const got = readAll(replay!);
    src.push("c");
    await tick();
    src.close();
    expect(await got).toEqual(["a", "b", "c"]);

    // After the stream ended there is nothing to resume.
    expect(reg.replay("c1")).toBeNull();
    reg.finish("c1", "r1");
    expect(reg.replay("c1")).toBeNull();
  });

  it("returns null once the run is finished, even if the stream is still open", async () => {
    const reg = createRunRegistry();
    reg.start("c1", "r1");
    reg.attach("c1", "r1", source().stream);
    reg.finish("c1", "r1");
    expect(reg.replay("c1")).toBeNull();
  });

  it("aborts only the matching run", () => {
    const reg = createRunRegistry();
    const ctl = reg.start("c1", "r1");
    expect(reg.abort("c1", "other")).toBe(false);
    expect(reg.abort("c2", "r1")).toBe(false);
    expect(ctl.signal.aborted).toBe(false);
    expect(reg.abort("c1", "r1")).toBe(true);
    expect(ctl.signal.aborted).toBe(true);
  });

  it("finish ignores a different run and attach ignores a stale run id", async () => {
    const reg = createRunRegistry();
    reg.start("c1", "r2");
    reg.finish("c1", "r1");
    const stale = source();
    reg.attach("c1", "r1", stale.stream);
    stale.push("stale");
    await tick();
    // r2 is still registered but has nothing attached: replay yields only what r2 streams.
    const live = source();
    reg.attach("c1", "r2", live.stream);
    const replay = readAll(reg.replay("c1")!);
    live.push("fresh");
    live.close();
    expect(await replay).toEqual(["fresh"]);
  });

  it("keeps draining the source when a replay reader cancels", async () => {
    const reg = createRunRegistry();
    reg.start("c1", "r1");
    const src = source();
    reg.attach("c1", "r1", src.stream);
    const reader = reg.replay("c1")!.getReader();
    src.push("a");
    expect((await reader.read()).value).toBe("a");
    await reader.cancel();
    src.push("b");
    await tick();
    const again = readAll(reg.replay("c1")!);
    src.close();
    expect(await again).toEqual(["a", "b"]);
  });

  it("getRunRegistry is a process-wide singleton", () => {
    expect(getRunRegistry()).toBe(getRunRegistry());
  });
});
