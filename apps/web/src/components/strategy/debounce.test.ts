import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncer } from "./debounce";

describe("createDebouncer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("arrowing through three goals writes once, with the last value, 500 ms after the last change", () => {
    const save = vi.fn();
    const d = createDebouncer(save, 500);
    d.schedule("get_customers");
    vi.advanceTimersByTime(300);
    d.schedule("build_authority");
    vi.advanceTimersByTime(300);
    d.schedule("grow_audience");
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("grow_audience");
  });

  it("flush (blur / unmount) writes the pending value now and only once", () => {
    const save = vi.fn();
    const d = createDebouncer(save, 500);
    d.schedule("a");
    d.flush();
    expect(save).toHaveBeenCalledWith("a");
    vi.advanceTimersByTime(1000);
    d.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending value", () => {
    const save = vi.fn();
    const d = createDebouncer(save, 500);
    d.schedule("a");
    d.cancel();
    vi.advanceTimersByTime(1000);
    d.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
