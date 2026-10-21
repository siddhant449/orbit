export const ZIP_MAX_UNCOMPRESSED: number;
export const ZIP_MAX_ENTRIES: number;
export const TOO_LARGE: string;
export class UserError extends Error {}
export function assertSafeZip(buf: Buffer, opts?: { maxEntries?: number; maxBytes?: number }): void;
export function assertInflatesWithin(buf: Buffer, maxBytes?: number): void;
