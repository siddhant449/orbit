import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosave, type AutosaveDoc, type AutosaveResult, type AutosaveSnapshot } from "./autosave";

type Call = { text: string; expectedVersion: number; resolve: (r: AutosaveResult) => void };

function setup(doc: AutosaveDoc = { id: "d1", version: 3, text: "Hello" }, delay = 800) {
  const calls: Call[] = [];
  const states: AutosaveSnapshot[] = [];
  const replaced: string[] = [];
  const save = vi.fn(
    (text: string, expectedVersion: number) =>
      new Promise<AutosaveResult>((resolve) => calls.push({ text, expectedVersion, resolve })),
  );
  const a = new Autosave({ doc, delay, save, onChange: (s) => states.push(s), onReplace: (t) => replaced.push(t) });
  return { a, calls, states, replaced, save, last: () => a.snapshot() };
}

// setTimeout is faked: let pending promise callbacks run instead.
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => vi.useRealTimers());

describe("Autosave", () => {
  it("starts clean at the document's version", () => {
    const { last } = setup();
    expect(last()).toMatchObject({ phase: "saved", version: 3, dirty: false });
  });

  it("debounces edits into one save with the base version", async () => {
    const { a, calls, last } = setup();
    a.edit("Hello w");
    vi.advanceTimersByTime(500);
    a.edit("Hello wo");
    vi.advanceTimersByTime(500);
    a.edit("Hello world");
    expect(last()).toMatchObject({ phase: "dirty", dirty: true });
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(800);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ text: "Hello world", expectedVersion: 3 });
    expect(last().phase).toBe("saving");
    calls[0]!.resolve({ ok: true, version: 4 });
    await vi.waitFor(() => expect(last()).toMatchObject({ phase: "saved", version: 4, dirty: false }));
  });

  it("does not save an edit that returns to the saved text", () => {
    const { a, calls, last } = setup();
    a.edit("Hello!");
    a.edit("Hello");
    vi.advanceTimersByTime(2000);
    expect(calls).toHaveLength(0);
    expect(last()).toMatchObject({ phase: "saved", dirty: false });
  });

  it("never saves an empty post", () => {
    const { a, calls, last } = setup();
    a.edit("   ");
    vi.advanceTimersByTime(2000);
    expect(calls).toHaveLength(0);
    expect(last().phase).toBe("empty");
  });

  it("queues edits made while a save is in flight and saves them on the new version", async () => {
    const { a, calls, last } = setup();
    a.edit("one");
    vi.advanceTimersByTime(800);
    a.edit("one two");
    vi.advanceTimersByTime(800);
    expect(calls).toHaveLength(1);
    calls[0]!.resolve({ ok: true, version: 4 });
    await flush();
    vi.advanceTimersByTime(800);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ text: "one two", expectedVersion: 4 });
    calls[1]!.resolve({ ok: true, version: 5 });
    await vi.waitFor(() => expect(last()).toMatchObject({ phase: "saved", version: 5 }));
  });

  it("flush saves now", () => {
    const { a, calls } = setup();
    a.edit("now");
    a.flush();
    expect(calls).toHaveLength(1);
  });

  it("stops on a 409 and offers keep-mine / use-latest", async () => {
    const { a, calls, last, replaced } = setup();
    a.edit("mine");
    vi.advanceTimersByTime(800);
    calls[0]!.resolve({ ok: false, conflict: { id: "d1", version: 5, text: "theirs" } });
    await vi.waitFor(() => expect(last().phase).toBe("conflict"));
    expect(last().conflict).toEqual({ id: "d1", version: 5, text: "theirs" });
    // More typing while the choice is open doesn't save behind the user's back.
    a.edit("mine, more");
    vi.advanceTimersByTime(5000);
    expect(calls).toHaveLength(1);

    a.keepMine();
    expect(calls[1]).toMatchObject({ text: "mine, more", expectedVersion: 5 });
    calls[1]!.resolve({ ok: true, version: 6 });
    await vi.waitFor(() => expect(last()).toMatchObject({ phase: "saved", version: 6, conflict: null }));
    expect(replaced).toEqual([]);
  });

  it("use-latest replaces the editor's text and is clean", async () => {
    const { a, calls, last, replaced } = setup();
    a.edit("mine");
    vi.advanceTimersByTime(800);
    calls[0]!.resolve({ ok: false, conflict: { id: "d1", version: 5, text: "theirs" } });
    await vi.waitFor(() => expect(last().phase).toBe("conflict"));
    a.useLatest();
    expect(replaced).toEqual(["theirs"]);
    expect(last()).toMatchObject({ phase: "saved", version: 5, dirty: false, conflict: null });
  });

  it("reports errors and retries on the next edit or retry()", async () => {
    const { a, calls, last } = setup();
    a.edit("x1");
    vi.advanceTimersByTime(800);
    calls[0]!.resolve({ ok: false, error: "Offline." });
    await vi.waitFor(() => expect(last()).toMatchObject({ phase: "error", error: "Offline." }));
    a.retry();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ text: "x1", expectedVersion: 3 });
  });

  describe("remote versions (AI edits, applied suggestions, restores)", () => {
    it("adopt a newer version into a clean editor", () => {
      const { a, last, replaced } = setup();
      a.remote({ id: "d1", version: 4, text: "AI text" });
      expect(replaced).toEqual(["AI text"]);
      expect(last()).toMatchObject({ phase: "saved", version: 4, dirty: false });
    });

    it("ignore older or same versions", () => {
      const { a, replaced, last } = setup();
      a.remote({ id: "d1", version: 3, text: "stale" });
      a.remote({ id: "d1", version: 2, text: "older" });
      expect(replaced).toEqual([]);
      expect(last().version).toBe(3);
    });

    it("never clobber unsaved edits: they raise the conflict choice instead", () => {
      const { a, calls, replaced, last } = setup();
      a.edit("my unsaved edit");
      a.remote({ id: "d1", version: 4, text: "AI text" });
      expect(replaced).toEqual([]);
      expect(last()).toMatchObject({ phase: "conflict", conflict: { version: 4, text: "AI text" } });
      vi.advanceTimersByTime(5000);
      expect(calls).toHaveLength(0);
    });

    it("whose text matches the editor just move the base (our own save echoing back)", () => {
      const { a, replaced, last } = setup();
      a.edit("same");
      a.remote({ id: "d1", version: 4, text: "same" });
      expect(replaced).toEqual([]);
      expect(last()).toMatchObject({ phase: "saved", version: 4, dirty: false });
    });

    it("arriving while a save is in flight resolve through that save's result", async () => {
      const { a, calls, last } = setup();
      a.edit("mine");
      vi.advanceTimersByTime(800);
      a.remote({ id: "d1", version: 4, text: "AI text" });
      expect(last().phase).toBe("conflict");
      calls[0]!.resolve({ ok: false, conflict: { id: "d1", version: 4, text: "AI text" } });
      await flush();
      expect(last()).toMatchObject({ phase: "conflict", conflict: { version: 4 } });
    });

    it("pause and resume", () => {
      const { a, calls } = setup();
      a.pause();
      a.edit("typed while the AI writes");
      vi.advanceTimersByTime(5000);
      expect(calls).toHaveLength(0);
      a.resume();
      vi.advanceTimersByTime(800);
      expect(calls).toHaveLength(1);
    });
  });

  it("dispose cancels a pending save", () => {
    const { a, calls } = setup();
    a.edit("bye");
    a.dispose();
    vi.advanceTimersByTime(5000);
    expect(calls).toHaveLength(0);
  });

  describe("lifecycle", () => {
    it("close() sends the pending edit, then stops", () => {
      const { a, calls } = setup();
      a.edit("typed just before leaving");
      a.close();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ text: "typed just before leaving", expectedVersion: 3 });
      a.edit("after close");
      vi.advanceTimersByTime(5000);
      expect(calls).toHaveLength(1);
    });

    it("close({ keepalive }) asks the save to outlive the page", () => {
      const { a, save } = setup();
      a.edit("unload");
      a.close({ keepalive: true });
      expect(save).toHaveBeenCalledWith("unload", 3, { keepalive: true });
    });

    it("survives mount → cleanup → mount (StrictMode): open() after close() autosaves again", async () => {
      const { a, calls, last } = setup();
      a.close();
      a.open();
      a.edit("still saving");
      vi.advanceTimersByTime(800);
      expect(calls).toHaveLength(1);
      calls[0]!.resolve({ ok: true, version: 4 });
      await vi.waitFor(() => expect(last()).toMatchObject({ phase: "saved", version: 4 }));
    });

    it("a save in flight across close → open still lands", async () => {
      const { a, calls, last } = setup();
      a.edit("in flight");
      a.close();
      a.open();
      calls[0]!.resolve({ ok: true, version: 4 });
      await vi.waitFor(() => expect(last()).toMatchObject({ phase: "saved", version: 4, dirty: false }));
    });
  });

  describe("exclusive (rename)", () => {
    it("runs with the current text and version once nothing is in flight, and moves the base", async () => {
      const { a, calls, last } = setup();
      a.edit("edited");
      vi.advanceTimersByTime(800);
      const task = vi.fn<(text: string, v: number) => Promise<AutosaveResult>>(async () => ({ ok: true, version: 5 }));
      const done = a.exclusive(task);
      expect(task).not.toHaveBeenCalled();
      calls[0]!.resolve({ ok: true, version: 4 });
      await expect(done).resolves.toEqual({ ok: true, version: 5 });
      expect(task).toHaveBeenCalledWith("edited", 4);
      expect(last()).toMatchObject({ phase: "saved", version: 5 });
      a.edit("edited again");
      vi.advanceTimersByTime(800);
      expect(calls[1]).toMatchObject({ text: "edited again", expectedVersion: 5 });
    });

    it("carries unsaved text in the same write and cancels the pending autosave", async () => {
      const { a, calls, last } = setup();
      a.edit("unsaved");
      const task = vi.fn(async (): Promise<AutosaveResult> => ({ ok: true, version: 4 }));
      await a.exclusive(task);
      expect(task).toHaveBeenCalledWith("unsaved", 3);
      vi.advanceTimersByTime(5000);
      expect(calls).toHaveLength(0);
      expect(last()).toMatchObject({ phase: "saved", dirty: false, version: 4 });
    });

    it("refuses while the conflict choice is open", async () => {
      const { a } = setup();
      a.edit("mine");
      a.remote({ id: "d1", version: 4, text: "theirs" });
      const task = vi.fn();
      await expect(a.exclusive(task)).resolves.toMatchObject({ ok: false });
      expect(task).not.toHaveBeenCalled();
    });
  });
});
