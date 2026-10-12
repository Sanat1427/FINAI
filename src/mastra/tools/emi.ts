import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { calculateEMI } from "../../lib/tools/finance";

export const emiTool = createTool({
  id: "calculate-emi",

  description:
    "Calculate the monthly EMI, total payment, and total interest for a loan.",

  inputSchema: z.object({
    principal: z
      .number()
      .positive()
      .describe("Loan principal amount"),

    annualRate: z
      .number()
      .nonnegative()
      .describe("Annual interest rate in percentage"),

    tenureYears: z
      .number()
      .positive()
      .describe("Loan tenure in years"),
  }),

  execute: async (input) => {
    const result = calculateEMI(
      input.principal,
      input.annualRate,
      input.tenureYears
    );

    return result;
  },
});