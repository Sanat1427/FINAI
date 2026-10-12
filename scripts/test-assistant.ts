import fs from "fs";
import { answerAssistant } from "../src/lib/ai/assistant";

if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function runTests() {
  const tests = [
    {
      name: "TEST 1: Multi-capability (RAG + EMI)",
      query: "What does responsible borrowing mean according to RBI, and calculate EMI for 5 lakh at 9% for 5 years."
    },
    {
      name: "TEST 2: Multi-capability (RAG + Simple Interest)",
      query: "According to RBI, what is inflation and what is the simple interest on 50000 at 8% for 3 years?"
    },
    {
      name: "TEST 3: Multi-capability (RAG + Compound Interest)",
      query: "Explain diversification according to RBI and calculate compound interest on 50000 at 8% for 3 years."
    },
    {
      name: "TEST 4: RAG Only",
      query: "What is inflation?"
    },
    {
      name: "TEST 5: Financial Only",
      query: "Calculate EMI for 5 lakh at 9% for 5 years."
    },
    {
      name: "TEST 6: General",
      query: "Hello"
    },
    {
      name: "TEST 7: Financial Follow-up",
      query: "What if the tenure is 7 years?",
      history: [
        { role: "user" as const, content: "Calculate EMI for 5 lakh at 9% for 5 years." },
        { role: "assistant" as const, content: "For a loan of ₹5,00,000 at 9% annual interest for 5 years: Monthly EMI: ₹10379.18" }
      ]
    }
  ];

  for (const t of tests) {
    console.log(`\n========================================`);
    console.log(`Running: ${t.name}`);
    console.log(`Query: ${t.query}`);
    try {
      const res = await answerAssistant(t.query, t.history || []);
      console.log(`Intent: ${res.intent}`);
      console.log(`Answer:\n${res.answer}`);
    } catch (error) {
      console.error(`Error:`, error);
    }
  }
}

runTests();
