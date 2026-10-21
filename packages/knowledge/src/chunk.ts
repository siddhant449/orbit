/** Splits text into ~targetChars chunks on paragraph then sentence boundaries; each later chunk starts with the previous chunk's tail. */
export function chunkText(text: string, opts: { targetChars?: number; overlapChars?: number } = {}): string[] {
  const target = opts.targetChars ?? 3200;
  const overlap = Math.min(opts.overlapChars ?? 400, Math.floor(target / 2));
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= target) return [clean];

  // Break into units no larger than `room` (target minus the overlap prefix): paragraphs, sentences, then hard slices.
  const room = target - overlap;
  const units: string[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= room) {
      units.push(p);
      continue;
    }
    let buf = "";
    for (const sentence of p.match(/[^.!?\n]+(?:[.!?]+["')\]]*\s*|\n|$)/g) ?? [p]) {
      if (buf && buf.length + sentence.length > room) {
        units.push(buf.trim());
        buf = "";
      }
      if (sentence.length > room) {
        for (let i = 0; i < sentence.length; i += room) units.push(sentence.slice(i, i + room).trim());
      } else {
        buf += sentence;
      }
    }
    if (buf.trim()) units.push(buf.trim());
  }

  // Pack units into chunks; the overlap prefix is carved out of the budget so chunks stay near target.
  const bodies: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && cur.length + 2 + u.length > room) {
      bodies.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${u}` : u;
  }
  if (cur) bodies.push(cur);

  return bodies.map((body, i) => {
    if (i === 0) return body;
    const tail = bodies[i - 1]!.slice(-overlap).trimStart();
    return `${tail}\n\n${body}`;
  });
}
