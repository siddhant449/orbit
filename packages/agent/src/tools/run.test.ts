import { describe, expect, it, vi } from "vitest";
import { runTool } from "./run";

describe("runTool and cancellation", () => {
  it("rethrows an AbortError instead of logging it or turning it into Failed:", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const abort = new DOMException("This operation was aborted", "AbortError");
    await expect(runTool("searchKB", null, async () => Promise.reject(abort))).rejects.toBe(abort);
    const ctl = new AbortController();
    ctl.abort();
    await expect(runTool("searchKB", null, async () => Promise.reject(ctl.signal.reason))).rejects.toBe(ctl.signal.reason);
    const named = Object.assign(new Error("cancelled"), { name: "AbortError" });
    await expect(runTool("searchKB", null, async () => Promise.reject(named))).rejects.toBe(named);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("still converts ordinary errors into a Failed: result", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runTool("searchKB", null, async () => Promise.reject(new Error("db down")))).toBe(
      "Failed: something went wrong running searchKB.",
    );
    log.mockRestore();
  });
});
