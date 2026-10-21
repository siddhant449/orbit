import { afterEach, describe, expect, it, vi } from "vitest";
import DesignPage from "./page";

// /design is a development page: in a production build it must return not found (proxy.ts also keeps it private).
// The env is stubbed after the import so React's JSX runtime loads its development build.
describe("/design in production", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("calls notFound() when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    let digest: string | undefined;
    try {
      DesignPage();
    } catch (error) {
      digest = (error as { digest?: string }).digest;
    }
    expect(digest).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("renders outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => DesignPage()).not.toThrow();
  });
});
