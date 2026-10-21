import mammoth from "mammoth";
import { assertSafeZip } from "./zip-guard";

export async function extractDocx(buf: Buffer, maxChars: number): Promise<string> {
  assertSafeZip(buf);
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value.slice(0, maxChars);
}
