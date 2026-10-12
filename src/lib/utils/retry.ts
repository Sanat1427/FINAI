export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 1,
  baseDelayMs: number = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      const isQuotaOrPermanent =
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.toLowerCase().includes("quota") ||
        msg.includes("NOT_FOUND") ||
        msg.includes("no longer available");

      // Avoid blind retries on quota exhaustion or unavailable models
      if (isQuotaOrPermanent) {
        throw error;
      }

      const isRetryable =
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("503") ||
        msg.includes("504") ||
        msg.includes("timeout") ||
        msg.includes("fetch failed");

      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }

      attempt++;
      // Exponential backoff with full jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterDelay = Math.random() * exponentialDelay;
      
      console.warn(`[Retry ${attempt}/${maxRetries}] Retrying after ${Math.round(jitterDelay)}ms due to error: ${msg}`);
      await new Promise((resolve) => setTimeout(resolve, jitterDelay));
    }
  }
}
