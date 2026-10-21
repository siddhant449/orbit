import { EMBEDDING_DIMENSIONS, type Embedder } from "./embed";

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic offline embedder: hashed bag of lowercase words, L2-normalised. */
export function fakeEmbedder(): Embedder & { calls: number } {
  const e = {
    calls: 0,
    async embed(texts: string[]) {
      e.calls++;
      return texts.map((t) => {
        const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
        for (const w of t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) v[fnv(w) % EMBEDDING_DIMENSIONS]! += 1;
        const norm = Math.hypot(...v) || 1;
        return v.map((x) => x / norm);
      });
    },
  };
  return e;
}

export function failingEmbedder(message = "embeddings down"): Embedder {
  return {
    async embed() {
      throw new Error(message);
    },
  };
}
