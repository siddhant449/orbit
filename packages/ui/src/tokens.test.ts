// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, parseColor } from "./contrast";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** Custom properties declared in the first block whose selector list starts with `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector}\n`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) vars[m[1]!] = m[2]!.trim();
  return vars;
}

const themes = { dark: block(":root,"), light: block(":root.light,") };

describe("contrast helpers", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#4F5FF5")).toBeCloseTo(4.9, 1);
  });

  it("composites an rgba line over its ground", () => {
    expect(composite(parseColor("rgba(255, 255, 255, 0.5)"), parseColor("#000000"))).toEqual([128, 128, 128]);
  });
});

describe("control boundaries (ruling A17, WCAG 1.4.11)", () => {
  for (const [theme, vars] of Object.entries(themes)) {
    for (const ground of ["--panel", "--ground"] as const) {
      it(`${theme}: --line-control reaches 3:1 on ${ground}`, () => {
        const bg = parseColor(vars[ground]!);
        const line = composite(parseColor(vars["--line-control"]!), bg);
        expect(contrastRatio(line, bg)).toBeGreaterThanOrEqual(3);
      });
    }
    it(`${theme}: --line-strong is the control line`, () => {
      expect(vars["--line-strong"]).toBe("var(--line-control)");
    });
  }
});
