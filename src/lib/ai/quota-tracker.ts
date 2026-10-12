/**
 * In-memory circuit breaker for permanent LLM provider quota errors (e.g. Gemini 429 RESOURCE_EXHAUSTED).
 * Prevents subsequent calls and agents within the Financial Council from wasting 8–15s retrying an exhausted provider.
 */

let geminiQuotaExhaustedUntil = 0;
let lastQuotaReason = "";
let lastQuotaType: "daily_quota" | "transient_429" | "unknown" = "unknown";

export type QuotaErrorType = "daily_quota" | "transient_429" | "unknown";

export interface QuotaClassification {
  isQuota: boolean;
  type: QuotaErrorType;
  cooldownMs: number;
  reason: string;
}

/**
 * Classifies an LLM error into daily quota exhaustion vs. transient 429 rate limit.
 * - Daily quota: 'GenerateContent requests per day per project', 'daily quota', 'freetier daily', etc.
 * - Transient 429: 'requests per minute', 'rpm', 'rate limit exceeded', HTTP 429.
 */
export function classifyQuotaError(error: any): QuotaClassification {
  if (!error) return { isQuota: false, type: "unknown", cooldownMs: 0, reason: "" };

  const msg = typeof error === "string" ? error : error.message || error.statusText || "";
  const status = error.status || error.code || error.statusCode;
  const lower = `${msg} ${error.details || ""}`.toLowerCase();

  const isDaily =
    lower.includes("per day") ||
    lower.includes("perday") ||
    lower.includes("daily quota") ||
    lower.includes("daily limit") ||
    lower.includes("day limit") ||
    lower.includes("free_tier_daily") ||
    lower.includes("freetier daily") ||
    lower.includes("requests per day");

  const isTransient =
    lower.includes("per minute") ||
    lower.includes("perminute") ||
    lower.includes("rpm") ||
    lower.includes("tpm") ||
    lower.includes("requests per minute") ||
    lower.includes("tokens per minute") ||
    lower.includes("rate limit") ||
    status === 429 ||
    status === "429";

  const isQuota =
    isDaily ||
    isTransient ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("429") ||
    lower.includes("freetier");

  if (!isQuota) {
    return { isQuota: false, type: "unknown", cooldownMs: 0, reason: msg };
  }

  if (isDaily) {
    return {
      isQuota: true,
      type: "daily_quota",
      cooldownMs: 60 * 60 * 1000, // 1 hour cooldown for daily exhaustion
      reason: msg || "Daily quota exhausted",
    };
  }

  if (isTransient) {
    return {
      isQuota: true,
      type: "transient_429",
      cooldownMs: 60_000, // 60s cooldown for transient per-minute rate limit
      reason: msg || "Transient 429 rate limit exceeded",
    };
  }

  // Ambiguous RESOURCE_EXHAUSTED fallback
  return {
    isQuota: true,
    type: "unknown",
    cooldownMs: 60 * 60 * 1000,
    reason: msg || "RESOURCE_EXHAUSTED",
  };
}

export function isQuotaError(error: any): boolean {
  return classifyQuotaError(error).isQuota;
}

export function isGeminiQuotaExhausted(): boolean {
  return Date.now() < geminiQuotaExhaustedUntil;
}

export function markGeminiQuotaExhausted(
  retryDelayMs?: number,
  reason = "RESOURCE_EXHAUSTED"
): void {
  const classification = classifyQuotaError(reason);
  lastQuotaType = classification.type;

  // If retryDelayMs is not explicitly provided, use the classified cooldown duration:
  // - 60s for transient 429
  // - 3600s for daily exhaustion
  const effectiveDelayMs = retryDelayMs !== undefined ? retryDelayMs : classification.cooldownMs;

  geminiQuotaExhaustedUntil = Date.now() + Math.max(effectiveDelayMs, 30_000);
  lastQuotaReason = reason;

  console.warn(
    `[QuotaTracker] Gemini marked ${lastQuotaType} exhausted for ${Math.round(
      effectiveDelayMs / 1000
    )}s. Reason: ${reason}. Fast-falling back directly to Groq.`
  );
}

export function resetGeminiQuota(): void {
  geminiQuotaExhaustedUntil = 0;
  lastQuotaReason = "";
  lastQuotaType = "unknown";
}

export function getGeminiQuotaStatus() {
  const remainingMs = Math.max(0, geminiQuotaExhaustedUntil - Date.now());
  return {
    isExhausted: remainingMs > 0,
    remainingMs,
    reason: lastQuotaReason,
    type: lastQuotaType,
  };
}
