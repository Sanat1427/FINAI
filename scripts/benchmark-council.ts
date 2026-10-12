import "../src/mastra/env-loader";
import { runFinancialCouncil } from "../src/mastra/agents/financial-council";
import {
  markGeminiQuotaExhausted,
  resetGeminiQuota,
  getGeminiQuotaStatus,
} from "../src/lib/ai/quota-tracker";

const QUERY = "What is the EMI for a ₹5 lakh loan at 9% for 5 years, and what repayment risks should be considered?";

async function main() {
  console.log("=== FINAI FINANCIAL COUNCIL LATENCY & RESILIENCE BENCHMARK ===");
  console.log(`Query: "${QUERY}"\n`);

  console.log("[1] Triggering Quota Circuit Breaker (Simulating Gemini Quota Exhaustion)...");
  markGeminiQuotaExhausted(
    3600000,
    "RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'GenerateContent requests per day per project'"
  );
  console.log("Circuit Breaker Status:", getGeminiQuotaStatus());

  const t0 = Date.now();
  const result = await runFinancialCouncil(QUERY);
  const totalMs = Date.now() - t0;

  console.log("\n--- Benchmark Results ---");
  console.log("Total Measured Wall-Clock Duration :", totalMs, "ms");
  console.log("Reported Internal Duration         :", result.metrics?.totalDurationMs, "ms");
  console.log("Retrieval Duration                 :", result.metrics?.retrievalDurationMs, "ms");
  console.log("Optimist Duration                  :", result.metrics?.optimistDurationMs, "ms");
  console.log("Pessimist Duration                 :", result.metrics?.pessimistDurationMs, "ms");
  console.log("Judge Duration                     :", result.metrics?.judgeDurationMs, "ms");
  console.log("Judge Provider                     :", result.judgeProvider);
  console.log("Judge Model                        :", result.judgeModel);
  console.log("Judge Verdict                      :", result.judgeAssessment?.verdict);

  resetGeminiQuota();
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
