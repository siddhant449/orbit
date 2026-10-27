import type { TurnContext } from "../context";
import { isIdeasRequest } from "../writing/ideas";

/**
 * Per-turn tool gating (token cut). The set is decided ONCE, before step 0, from facts the server already knows,
 * and stays fixed for the whole turn, so the tool list is a stable prefix for the provider's prompt cache. Tool
 * definitions for history conversion and execution are untouched; only the list sent to the model shrinks.
 *
 * Gating table (a tool is dropped only when NO legitimate flow of this turn can need it):
 *
 * | Server fact (turn start)            | Dropped                                                              | Why it is safe                                                                 |
 * |-------------------------------------|----------------------------------------------------------------------|--------------------------------------------------------------------------------|
 * | A post is open in this chat         | delegateWriting, createDocument, searchTemplates, readTemplate        | one post per chat: new drafts answer EXISTING_POST; edits go through updateDocument |
 * | No post is open                     | updateDocument, proposeDocumentEdits, getPostVersions, delegateEditing | all four need a post (they answer NO_POST); a post made this turn is edited next turn |
 * | An angle or idea was picked (no post)| generateIdeas, generateHooks, analyzePost, searchTemplates, readTemplate | the pick means "write now"; the server picks the template; presentOptions stays (guided flows chain pickers) |
 * | Ideas request (no post, no pick)    | searchTemplates, readTemplate, delegateEditing is already gone       | ideas never take a template                                                    |
 * | Web search off / no provider        | researchTopic (never built)                                          | already built conditionally                                                    |
 * | Visuals disabled                    | image tools (never built)                                            | already built conditionally                                                    |
 */
export function gatedToolNames(ctx: Pick<TurnContext, "documentRef" | "pickedAngle" | "userText">, all: readonly string[]): string[] {
  const drop = new Set<string>();
  const hasPost = Boolean(ctx.documentRef.current);
  if (hasPost) {
    for (const n of ["delegateWriting", "createDocument", "searchTemplates", "readTemplate"]) drop.add(n);
  } else {
    for (const n of ["updateDocument", "proposeDocumentEdits", "getPostVersions", "delegateEditing"]) drop.add(n);
    if (ctx.pickedAngle) {
      for (const n of ["generateIdeas", "generateHooks", "analyzePost", "searchTemplates", "readTemplate"]) drop.add(n);
    } else if (isIdeasRequest(ctx.userText)) {
      for (const n of ["searchTemplates", "readTemplate"]) drop.add(n);
    }
  }
  return all.filter((n) => !drop.has(n));
}
