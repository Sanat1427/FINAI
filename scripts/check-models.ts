import "../src/mastra/env-loader";
import { GoogleGenAI } from "@google/genai";
import { councilModelConfig } from "../src/mastra/models/fallback";

async function main() {
  console.log("=== FINAI MODEL CAPABILITY & CONNECTIVITY AUDIT ===\n");

  // 1. Audit Gemini
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey) {
    console.log("[Gemini] No GEMINI_API_KEY found in environment.");
  } else {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.list();
      console.log("[Gemini] Connection successful. Available models:");
      for await (const m of response) {
        if (m.name?.includes("gemini")) {
          console.log(`  - ${m.name.replace("models/", "")}`);
        }
      }
    } catch (err: any) {
      console.error("[Gemini] Connection error:", err.message);
    }
  }

  // 2. Audit Groq
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.log("\n[Groq] No GROQ_API_KEY found in environment.");
  } else {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${groqKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log("\n[Groq] Connection successful. Selected models:");
      data.data
        ?.filter((m: any) => m.id.includes("qwen") || m.id.includes("llama"))
        ?.forEach((m: any) => console.log(`  - ${m.id}`));
    } catch (err: any) {
      console.error("\n[Groq] Connection error:", err.message);
    }
  }

  // 3. Fallback Chain
  console.log("\n[Council Fallback Configuration]:");
  console.log(councilModelConfig());
}

main();
