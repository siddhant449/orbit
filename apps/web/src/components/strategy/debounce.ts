/**
 * Trailing debounce with an explicit flush: `schedule` keeps only the newest value and calls `fn` once, `ms` after
 * the last change; `flush` calls it now if a value is pending (on blur or unmount); `cancel` drops it.
 */
export function createDebouncer<T>(fn: (value: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    clear();
    if (!pending) return;
    const { value } = pending;
    pending = null;
    fn(value);
  };

  return {
    schedule(value: T) {
      pending = { value };
      clear();
      timer = setTimeout(flush, ms);
    },
    flush,
    cancel() {
      clear();
      pending = null;
    },
  };
}
