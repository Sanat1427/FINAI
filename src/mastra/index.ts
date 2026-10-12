import "./env-loader";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { emiTool } from "./tools/emi";
import { ragTool } from "./tools/rag";
import { councilModelConfig } from "./models/fallback";

export const financialAgent = new Agent({
  id: "financial-agent",

  name: "Financial Agent",

  instructions: `
  You are a helpful financial education assistant.

  Explain financial concepts clearly and simply.

  Use the calculate-emi tool when the user asks
  for an EMI calculation.

  Use the financial-rag tool when the user asks
  about financial concepts, RBI guidance, banking,
  borrowing, saving, digital payments, or other
  information that should come from the financial
  knowledge base.

  Do not perform EMI calculations yourself when
  the calculate-emi tool is available.

  Do not invent facts that are not supported by
  the financial knowledge base.

  Do not provide personalized financial advice.
`,
  model: councilModelConfig,

  tools: {
    emiTool,
    ragTool,
  },
});

export const mastra = new Mastra({
  agents: { financialAgent },
});
