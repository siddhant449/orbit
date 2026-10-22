import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: IntegrationsPage } = await import("./page");

const textNodes = (html: string) =>
  html
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

describe("Integrations (B12, honest states)", () => {
  const html = renderToStaticMarkup(<IntegrationsPage />);
  const texts = textNodes(html);

  it("renders the p14 sections", () => {
    for (const h of ["Integrations", "Social accounts", "AI assistants", "Developers", "Apps"]) expect(texts).toContain(h);
    expect(texts).toContain("Connect LinkedIn");
  });

  it("never claims a connection: no element reads Active or Connected", () => {
    expect(texts).not.toContain("Active");
    expect(texts).not.toContain("Connected");
  });

  it("says Orbit, not Brandloop", () => {
    expect(html).not.toContain("Brandloop");
    expect(html).toContain("Orbit");
  });
});
