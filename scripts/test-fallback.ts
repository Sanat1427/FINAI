import "../src/mastra/env-loader";
import { pessimistAgent } from "../src/mastra/agents/pessimist";

async function runTest() {
  console.log("==================================================");
  console.log("FALLBACK & TOOL CALLING TEST");
  console.log("==================================================\n");

  try {
    console.log("TEST 1: Deterministic EMI Tool");
    const prompt1 = "What is the EMI for a ₹5 lakh loan at 9% for 5 years?";
    console.log(`Prompt: "${prompt1}"\n`);
    
    const res1 = await pessimistAgent.generate(prompt1);
    
    console.log("--- Agent Response ---");
    console.log(res1.text);
    console.log("----------------------\n");

    console.log("TEST 2: Financial Fact RAG Tool");
    const prompt2 = "What does RBI say about responsible borrowing?";
    console.log(`Prompt: "${prompt2}"\n`);
    
    const res2 = await pessimistAgent.generate(prompt2);

    console.log("--- Agent Response ---");
    console.log(res2.text);
    console.log("----------------------\n");

  } catch (err) {
    console.error("Test completely failed:", err);
  }
}

runTest();
