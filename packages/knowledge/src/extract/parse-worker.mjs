import { parentPort, workerData } from "node:worker_threads";
import { parseDocument } from "./parse-core.mjs";

try {
  parentPort.postMessage({ ok: true, text: await parseDocument(workerData) });
} catch (err) {
  // Only UserError text is meant for users; the host maps everything else to a generic message.
  parentPort.postMessage({ ok: false, message: err && err.name === "UserError" ? err.message : null });
}
