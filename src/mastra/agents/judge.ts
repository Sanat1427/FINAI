import { Agent } from "@mastra/core/agent";
import { councilModelConfig } from "../models/fallback";
import { z } from "zod";

export interface JudgeInput {
  question: string;
  optimistAnalysis: string;
  pessimistAnalysis: string;
  evidence: {
    fact: string;
    source: string;
  }[];
  calculationResults?: {
    emi?: number;
    totalPayment?: number;
    totalInterest?: number;
    [key: string]: any;
  };
}

export const judgeOutputSchema = z.object({
  verdict: z.string().describe("Clear, concise bottom-line verdict statement under 25 words"),
  balancedAssessment: z.string().describe("Concise synthesis of both perspectives under 120 words distinguishing document facts, deterministic calculations, and general reasoning"),
  benefits: z.array(z.string()).default([]).describe("Top 2-3 supported potential benefits"),
  risks: z.array(z.string()).default([]).describe("Top 2-3 supported key risks"),
  evidence: z
    .array(
      z.object({
        fact: z.string(),
        source: z.string(),
      })
    )
    .default([])
    .describe("Relevant facts directly supported by retrieved documents"),
  assumptions: z.array(z.string()).default([]).describe("Critical assumptions made"),
  missingInformation: z.array(z.string()).default([]).describe("Specific information gaps needed for complete evaluation"),
  verificationSteps: z.array(z.string()).default([]).describe("Immediate next steps or terms for the user to verify"),
});

export const judgeAgent = new Agent({
  id: "financial-judge",
  name: "Financial Judge",
  instructions: `You are the Judge member of a Financial Council.

Your responsibilities:
- Evaluate the Optimist's potential benefits.
- Evaluate the Pessimist's risks and downside scenarios.
- Synthesize verified evidence retrieved from financial knowledge base documents.
- Incorporate deterministic financial calculations (e.g. EMI, interest totals) without recalculating manually.
- Produce an independent, balanced synthesis.

CRITICAL FINANCIAL SYNTHESIS & GROUNDING RULES:
1. DISTINGUISH 4 DISTINCT CLAIM TYPES:
   a. Document Claims: Facts strictly grounded in the retrieved document excerpts. Always preserve document and page references.
   b. Deterministic Calculations: Exact figures from calculation tools (EMI, total interest, tenure). Do not recalculate.
   c. General Financial Reasoning: Standard financial principles (liquidity buffers, opportunity cost, general tax rules). Frame these as general economic reasoning; NEVER attribute them to RBI FAME, ICICI, SBI, or any specific document unless the retrieved text explicitly states it.
   d. Unknown or Unverified Information: User-specific variables (tax slab, credit score, sanction terms). Confine these to assumptions or verification steps.
2. AVOID REDUNDANCY: Do NOT repeat the same evidence gap or missing detail across multiple sections.
3. NO FABRICATION: Do not invent regulations, citations, interest rates, or personalized advice.
4. BREVITY: Deliver a concise verdict statement (under 25 words) and a balanced assessment under 120 words.`,
  model: councilModelConfig,
});
