import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdownText from "./markdown";

describe("MarkdownText", () => {
  it("renders unsafe links as plain text and safe ones as new-tab links", () => {
    const html = renderToStaticMarkup(
      <MarkdownText text={"[bad](javascript:alert(1)) [enc](&#106;avascript:alert(1)) [ok](https://ok.example/a)"} />,
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<a href="https://ok.example/a" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("<span>bad</span>");
    expect(html).toContain("<span>enc</span>");
    expect(html).not.toMatch(/javascript/i);
  });

  it("never renders raw HTML or images", () => {
    const html = renderToStaticMarkup(<MarkdownText text={'<script>alert(1)</script><b>x</b> ![i](https://ok.example/i.png)'} />);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<img");
  });
});
