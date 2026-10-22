// React's development-only performance tracks occasionally hand `performance.measure` a start time from before the
// page's time origin (e.g. after the tab slept), which the browser rejects with a TypeError that surfaces in the dev
// overlay. Swallow only that specific error, only in development, so real timing calls behave as normal.
if (process.env.NODE_ENV !== "production" && typeof performance !== "undefined") {
  const measure = performance.measure.bind(performance);
  performance.measure = ((...args: Parameters<Performance["measure"]>) => {
    try {
      return measure(...args);
    } catch (error) {
      if (error instanceof TypeError && /negative time stamp/i.test(error.message)) return undefined as unknown as PerformanceMeasure;
      throw error;
    }
  }) as Performance["measure"];
}
