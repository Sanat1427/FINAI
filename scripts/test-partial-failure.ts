import "../src/mastra/env-loader";
import { runFinancialCouncil } from "../src/mastra/agents/financial-council";
import { pessimistAgent } from "../src/mastra/agents/pessimist";

async function runMockedTest() {
  const originalGenerate = pessimistAgent.generate;
  
  // Mock failure
  pessimistAgent.generate = async () => {
    throw new Error("Simulated Pessimist Failure");
  };

  try {
    console.log("Running partial failure test...");
    const result = await runFinancialCouncil("What is 5 lakh at 9% for 5 years?");
    
    console.log("--- Partial Failure Result ---");
    console.log("Error Field:", result.error);
    console.log("Optimist ran:", !!result.optimistPerspective);
    console.log("Pessimist ran:", !!result.pessimistPerspective);
    console.log("Judge ran:", !!result.judgeAssessment);
    console.log("------------------------------");

  } catch (error) {
    console.error("Test execution failed:", error);
  } finally {
    // Restore
    pessimistAgent.generate = originalGenerate;
  }
}

runMockedTest();
