import { GoogleGenAI } from "@google/genai";
import { isGeminiQuotaExhausted, markGeminiQuotaExhausted, isQuotaError } from "./quota-tracker";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "dummy-key",
});

async function callGroq(params: any): Promise<{ text: string; usage?: any; model: string; provider: string }> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  let prompt = params.contents;
  if (typeof prompt !== "string") {
    prompt = JSON.stringify(prompt);
  }

  // Groq requires the word "json" in the prompt if response_format is { type: "json_object" }
  const isJson = params.config?.responseMimeType === "application/json";
  if (isJson && !prompt.toLowerCase().includes("json")) {
    prompt = `${prompt}\n\nPlease output the response in valid JSON format.`;
  }

  const body: any = {
    model: "qwen/qwen3.8-27b",
    messages: [{ role: "user", content: prompt }],
    max_tokens: params.config?.maxOutputTokens ? Math.min(params.config.maxOutputTokens, 800) : 600,
  };

  if (isJson) {
    body.response_format = { type: "json_object" };
  }

  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });

  if (!groqResponse.ok) {
    const errText = await groqResponse.text();
    throw new Error(`Groq request failed: ${groqResponse.status} ${errText}`);
  }

  const data = await groqResponse.json();
  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: data.usage,
    model: body.model,
    provider: "groq",
  };
}

export const fallbackAi = {
  models: {
    generateContent: async (params: any) => {
      // 1. If Gemini quota is known to be exhausted, fast-path straight to Groq
      if (isGeminiQuotaExhausted()) {
        return callGroq(params);
      }

      // 2. Otherwise try Gemini
      try {
        const response = await ai.models.generateContent(params);
        return {
          text: response.text || "",
          provider: "gemini",
          model: params.model || "gemini-3.5-flash",
          usage: (response as any).usageMetadata || undefined,
        };
      } catch (error) {
        if (isQuotaError(error)) {
          // Trip the circuit breaker based on classified error type (transient 429 vs daily quota)
          markGeminiQuotaExhausted(
            undefined,
            error instanceof Error ? error.message : String(error)
          );
        }

        console.warn(
          "Gemini generation failed. Attempting Groq fallback...",
          error instanceof Error ? error.message : String(error)
        );

        try {
          return await callGroq(params);
        } catch (groqErr) {
          throw new Error(
            `Both Gemini and Groq failed. Gemini: ${
              error instanceof Error ? error.message : String(error)
            } | Groq: ${groqErr instanceof Error ? groqErr.message : String(groqErr)}`
          );
        }
      }
    },
  },
};
