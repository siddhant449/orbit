/**
 * Makes everything outside `el` inert (the shell's header, tab bar, sidebar, the editor beside it, other body
 * children), so focus and the screen reader stay inside a full-screen sheet. Elements already inert are left as they
 * were. Returns the undo.
 */
export function inertOthers(el: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children)) {
      if (sib === node || !(sib instanceof HTMLElement) || sib.inert) continue;
      sib.inert = true;
      changed.push(sib);
    }
    node = parent;
  }
  return () => {
    for (const sib of changed) sib.inert = false;
  };
}
