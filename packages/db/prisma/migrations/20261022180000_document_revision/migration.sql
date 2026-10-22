-- Restore moves the current-version pointer instead of appending; concurrency moves to a separate revision counter.
ALTER TABLE "Document" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
