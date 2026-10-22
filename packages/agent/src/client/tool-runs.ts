export type ToolGroup<P> = { type: "tool-group"; parts: P[] };

const isTool = (p: { type: string }) => p.type.startsWith("tool-") || p.type === "dynamic-tool";

/**
 * Collapses `min` (default 3) or more consecutive tool parts into one group ("Worked through N steps"). `step-start`
 * markers between tool parts don't break a run; inside a collapsed run they are dropped (they render nothing).
 */
export function collapseToolRuns<P extends { type: string }>(parts: P[], min = 3): (P | ToolGroup<P>)[] {
  const out: (P | ToolGroup<P>)[] = [];
  let i = 0;
  while (i < parts.length) {
    if (!isTool(parts[i]!)) {
      out.push(parts[i]!);
      i++;
      continue;
    }
    // Scan the run: tools and step-starts, ending at the last tool part.
    const tools: P[] = [];
    let j = i;
    let end = i;
    while (j < parts.length && (isTool(parts[j]!) || parts[j]!.type === "step-start")) {
      if (isTool(parts[j]!)) {
        tools.push(parts[j]!);
        end = j;
      }
      j++;
    }
    if (tools.length >= min) out.push({ type: "tool-group", parts: tools });
    else out.push(...parts.slice(i, end + 1));
    i = end + 1;
  }
  return out;
}
