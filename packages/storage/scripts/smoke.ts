// One live check of the hosted adapter: put a 1x1 PNG under p/smoke/…, fetch its public URL, delete it, fetch again.
// Prints status codes only (never the token or the URL).
import { createBlobStores } from "../src/create";
import { objectKey } from "../src/keys";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  const { public: store } = createBlobStores({ ...process.env, STORAGE_DRIVER: "upstash" });
  const k = objectKey("smoke", "visual", "png");
  const put = await store.put(k, png, { contentType: "image/png", visibility: "public", cacheControl: "public, max-age=31536000, immutable" });
  console.log("put: ok", { hasUrl: !!put.url });
  try {
    const first = await fetch(put.url!);
    console.log("GET public url:", first.status, first.headers.get("content-type"), `${(await first.arrayBuffer()).byteLength} bytes`);
    const via = await store.get(k);
    console.log("store.get:", via ? `${via.bytes.length} bytes ${via.contentType}` : "missing");
  } finally {
    await store.delete(k);
    console.log("delete: ok");
  }
  const after = await fetch(put.url!);
  console.log("GET after delete:", after.status);
  console.log("store.get after delete:", (await store.get(k)) === null ? "null" : "STILL THERE");
}
main().catch((e) => {
  console.error("smoke failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
