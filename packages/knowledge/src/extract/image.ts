import type { AiClient } from "@brandloop/ai";
import { IngestError } from "../errors";

const SYSTEM =
  "You turn an image into text for a personal knowledge base. Transcribe any visible text exactly, then describe " +
  "anything else that carries meaning (charts, diagrams, screenshots). Plain text only. Never reply conversationally.";

export async function extractImage(buf: Buffer, mime: string, ai: AiClient): Promise<string> {
  const text = await ai.text({
    model: "extract",
    system: SYSTEM,
    prompt: "Transcribe and describe this image.",
    images: [{ mediaType: mime, base64: buf.toString("base64") }],
  });
  if (!text.trim()) throw new IngestError("Couldn't read that image");
  return text;
}
