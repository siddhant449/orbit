/** A failure whose message is safe to show the user as the item's error. */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}
