export function parseDocument(job: { buf: Uint8Array; mime: string; maxChars: number; maxInflateBytes?: number }): Promise<string>;
