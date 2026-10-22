import type { VisualsToolDeps } from "@brandloop/agent";
import { latestVisualForPost, startVisualEdit } from "./start-edit";

/** What the chat's image tools may do. Note what is missing: nothing here can make an image or spend a credit. */
export const visualsToolDeps: VisualsToolDeps = {
  latestAttached: (profileId, documentId) => latestVisualForPost(profileId, documentId),
  async startEdit(profileId, visualId, instruction) {
    const r = await startVisualEdit(profileId, visualId, instruction, crypto.randomUUID());
    return r.ok ? { ok: true, remainingEdits: r.remainingEdits } : { ok: false, message: r.message };
  },
};
