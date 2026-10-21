import { render, screen } from "@testing-library/react";
import { domMax } from "motion/react";
import { describe, expect, it } from "vitest";
import { MotionProvider, loadMotionFeatures } from "./provider";

describe("MotionProvider (ruling U7)", () => {
  it("loads the features lazily and renders children before they arrive", async () => {
    render(
      <MotionProvider>
        <p>ready</p>
      </MotionProvider>,
    );
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(typeof loadMotionFeatures).toBe("function");
    await expect(loadMotionFeatures()).resolves.toBe(domMax);
  });
});
