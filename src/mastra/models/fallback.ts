import type { ModelWithRetries } from "@mastra/core/agent";
import { isGeminiQuotaExhausted } from "@/lib/ai/quota-tracker";

export const councilModelConfig = (): ModelWithRetries[] => {
  if (isGeminiQuotaExhausted()) {
    // Permanent quota exhausted; skip Gemini directly to eliminate 8-15s retry penalty
    return [
      {
        model: "groq/qwen/qwen3.8-27b",
        maxRetries: 1,
      },
    ];
  }

  return [
    {
      model: "google/gemini-3.5-flash",
      maxRetries: 0,
    },
    {
      model: "groq/qwen/qwen3.8-27b",
      maxRetries: 1,
    },
  ];
};
