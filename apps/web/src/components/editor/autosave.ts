/**
 * The post editor's autosave (screens.md B3): edits are debounced into one optimistic-concurrency save
 * (`expectedVersion`). Nothing the user typed is overwritten without their choice: a 409, or a newer version arriving
 * from elsewhere (the AI editing in the chat column, an applied suggestion, a restore) while there are unsaved edits,
 * stops autosaving and offers keep-mine (save over the newer version) or use-latest. A newer version arriving into a
 * clean editor is adopted at once.
 */

export type AutosaveDoc = { id: string; version: number; text: string };
export type AutosaveResult = { ok: true; version: number } | { ok: false; conflict: AutosaveDoc } | { ok: false; error: string };

export type AutosavePhase = "saved" | "dirty" | "saving" | "error" | "conflict" | "empty";
export type AutosaveSnapshot = {
  phase: AutosavePhase;
  /** The version the editor's text is based on. */
  version: number;
  dirty: boolean;
  conflict: AutosaveDoc | null;
  error: string | null;
};

type Options = {
  doc: AutosaveDoc;
  delay?: number;
  save: (text: string, expectedVersion: number) => Promise<AutosaveResult>;
  onChange?: (s: AutosaveSnapshot) => void;
  /** The editor must show this text (a version adopted from elsewhere, or use-latest). */
  onReplace?: (text: string) => void;
};

export const AUTOSAVE_DELAY = 800;

export class Autosave {
  private text: string;
  private savedText: string;
  private version: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private paused = false;
  private disposed = false;
  private conflict: AutosaveDoc | null = null;
  private error: string | null = null;
  private readonly delay: number;
  private last: AutosaveSnapshot;

  constructor(private readonly opts: Options) {
    this.text = opts.doc.text;
    this.savedText = opts.doc.text;
    this.version = opts.doc.version;
    this.delay = opts.delay ?? AUTOSAVE_DELAY;
    this.last = this.compute();
  }

  snapshot(): AutosaveSnapshot {
    return this.last;
  }

  get currentText(): string {
    return this.text;
  }

  private get dirty() {
    return this.text !== this.savedText;
  }

  private compute(): AutosaveSnapshot {
    const phase: AutosavePhase = this.conflict
      ? "conflict"
      : this.inFlight
        ? "saving"
        : this.error && this.dirty
          ? "error"
          : this.dirty && !this.text.trim()
            ? "empty"
            : this.dirty
              ? "dirty"
              : "saved";
    return { phase, version: this.version, dirty: this.dirty, conflict: this.conflict, error: phase === "error" ? this.error : null };
  }

  private emit() {
    const next = this.compute();
    const prev = this.last;
    if (
      prev.phase === next.phase &&
      prev.version === next.version &&
      prev.dirty === next.dirty &&
      prev.conflict === next.conflict &&
      prev.error === next.error
    ) {
      return;
    }
    this.last = next;
    this.opts.onChange?.(next);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.clearTimer();
    if (this.disposed || this.paused || this.conflict || !this.dirty || !this.text.trim()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run();
    }, this.delay);
  }

  private run(expected = this.version) {
    if (this.disposed || this.inFlight || !this.dirty || !this.text.trim()) return;
    const text = this.text;
    this.inFlight = true;
    this.error = null;
    this.emit();
    void this.opts.save(text, expected).then(
      (res) => this.settle(text, res),
      () => this.settle(text, { ok: false, error: "Your edit couldn't be saved. Check your connection." }),
    );
  }

  private settle(text: string, res: AutosaveResult) {
    this.inFlight = false;
    if (this.disposed) return;
    if (res.ok) {
      this.version = Math.max(this.version, res.version);
      this.savedText = text;
      this.conflict = null;
      this.error = null;
    } else if ("conflict" in res) {
      // A newer copy of the same conflict (or a newer one) wins over one already shown.
      if (!this.conflict || res.conflict.version >= this.conflict.version) this.conflict = res.conflict;
    } else {
      this.error = res.error;
    }
    this.emit();
    this.schedule();
  }

  /** The editor's text changed (typing, toolbar, undo). */
  edit(text: string) {
    if (text === this.text) return;
    this.text = text;
    if (!this.dirty) this.error = null;
    this.emit();
    this.schedule();
  }

  /** Save now (leaving the page, Cmd+S). */
  flush() {
    this.clearTimer();
    if (!this.paused && !this.conflict) this.run();
  }

  retry() {
    this.error = null;
    this.flush();
    this.emit();
  }

  /** Conflict choice: save the editor's text over the newer version. */
  keepMine() {
    const c = this.conflict;
    if (!c) return;
    this.conflict = null;
    this.version = Math.max(this.version, c.version);
    // The newer version is now the base; the editor's text is what gets saved on it.
    this.savedText = c.text;
    if (!this.dirty) {
      this.emit();
      return;
    }
    this.clearTimer();
    this.run(c.version);
  }

  /** Conflict choice: take the newer version, dropping the unsaved edit. */
  useLatest() {
    const c = this.conflict;
    if (!c) return;
    this.conflict = null;
    this.adopt(c);
  }

  private adopt(doc: AutosaveDoc) {
    this.clearTimer();
    this.version = doc.version;
    this.savedText = doc.text;
    this.error = null;
    if (this.text !== doc.text) {
      this.text = doc.text;
      this.opts.onReplace?.(doc.text);
    }
    this.emit();
  }

  /** A version saved elsewhere (stream snapshot, applied suggestion, restore, our own save echoing back). */
  remote(doc: AutosaveDoc) {
    if (this.disposed || doc.version <= this.version) return;
    if (doc.text === this.text) {
      // Already showing it: only the base moves.
      this.clearTimer();
      this.version = doc.version;
      this.savedText = doc.text;
      this.error = null;
      if (this.conflict && this.conflict.version <= doc.version) this.conflict = null;
      this.emit();
      return;
    }
    if (this.dirty || this.inFlight) {
      this.clearTimer();
      if (!this.conflict || doc.version > this.conflict.version) this.conflict = doc;
      this.emit();
      return;
    }
    this.adopt(doc);
  }

  /** Holds saves (while the AI is writing the post); edits keep collecting. */
  pause() {
    this.paused = true;
    this.clearTimer();
  }

  resume() {
    this.paused = false;
    this.schedule();
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }
}
