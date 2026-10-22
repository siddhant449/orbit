export type ProviderErrorCode = "refused" | "unavailable" | "verification_required" | "timeout" | "bad_output";

/**
 * A provider failure in our own terms. The message is fixed copy for operators and logs: it never carries the API key,
 * the prompt or the provider's response body.
 */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
    message?: string,
    /** HTTP status when the provider answered, for operator logs. */
    readonly status?: number,
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "ProviderError";
  }
}

const DEFAULT_MESSAGES: Record<ProviderErrorCode, string> = {
  refused: "The image provider declined this request.",
  unavailable: "The image provider is unavailable.",
  verification_required: "The image provider needs the account to be verified before this model can be used.",
  timeout: "The image provider took too long to answer.",
  bad_output: "The image provider returned something that isn't a usable image.",
};
