"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@brandloop/ui";

/**
 * Assistant text as markdown, loaded lazily. Raw HTML is never rendered (no rehype-raw, `skipHtml`), images
 * are dropped, and links keep only http, https and mailto targets, opening in a new tab without an opener.
 */

const SAFE_URL = /^(https?:|mailto:)/i;

export function safeUrl(url: string): string {
  return SAFE_URL.test(url.trim()) ? url.trim() : "";
}

const components: Components = {
  p: ({ children }) => <p>{children}</p>,
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Headings inside a reply sit below the page's own headings.
  h1: ({ children }) => <h3 className="md-h">{children}</h3>,
  h2: ({ children }) => <h3 className="md-h">{children}</h3>,
  h3: ({ children }) => <h4 className="md-h">{children}</h4>,
  h4: ({ children }) => <h4 className="md-h">{children}</h4>,
  h5: ({ children }) => <h4 className="md-h">{children}</h4>,
  h6: ({ children }) => <h4 className="md-h">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }) => (
    <div className="md-table" data-lenis-prevent>
      <table>{children}</table>
    </div>
  ),
};

export default function MarkdownText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className={cn("md", streaming && "md--streaming")}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={components}
        skipHtml
        disallowedElements={["img"]}
        unwrapDisallowed
        urlTransform={safeUrl}
      >
        {text}
      </Markdown>
    </div>
  );
}
