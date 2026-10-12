import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractStructuredJson,
  toStringArray,
  runFinancialCouncil,
} from "./financial-council";
import { optimistAgent } from "./optimist";
import { pessimistAgent } from "./pessimist";
import { judgeAgent } from "./judge";
import { fallbackAi } from "@/lib/ai/fallback";
import * as ragToolModule from "../tools/rag";

vi.mock("./optimist", () => ({
  optimistAgent: {
    generate: vi.fn(),
  },
}));

vi.mock("./pessimist", () => ({
  pessimistAgent: {
    generate: vi.fn(),
  },
}));

vi.mock("./judge", () => ({
  judgeAgent: {
    generate: vi.fn(),
  },
  judgeOutputSchema: {},
}));

vi.mock("../tools/rag", () => ({
  deduplicatedAnswerWithRAG: vi.fn(),
}));

vi.mock("@/lib/ai/fallback", () => ({
  fallbackAi: {
    models: {
      generateContent: vi.fn(),
    },
  },
}));

describe("Judge Reliability & Structured Synthesis Fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractStructuredJson helper", () => {
    it("extracts JSON correctly from markdown code blocks", () => {
      const markdownJson = "Here is the verdict:\n```json\n{\n  \"verdict\": \"Balanced Approval\",\n  \"balancedAssessment\": \"Proceed with caution.\"\n}\n```\nHope this helps!";
      const parsed = extractStructuredJson(markdownJson);
      expect(parsed).toBeDefined();
      expect(parsed.verdict).toBe("Balanced Approval");
      expect(parsed.balancedAssessment).toBe("Proceed with caution.");
    });

    it("extracts JSON from raw curly braces amidst freeform text", () => {
      const rawText = "Analysis concluded. {\"verdict\":\"Proceed with Caution\",\"benefits\":[\"Lower interest\"]} Additional remarks.";
      const parsed = extractStructuredJson(rawText);
      expect(parsed).toBeDefined();
      expect(parsed.verdict).toBe("Proceed with Caution");
      expect(parsed.benefits).toEqual(["Lower interest"]);
    });

    it("returns null gracefully for non-JSON text or empty output", () => {
      expect(extractStructuredJson("I cannot formulate a verdict.")).toBeNull();
      expect(extractStructuredJson("")).toBeNull();
      expect(extractStructuredJson(undefined)).toBeNull();
    });
  });

  describe("toStringArray defensive mapping", () => {
    it("safely wraps a single string into an array and strips HTML tags", () => {
      const res = toStringArray("<b>Lower rate</b>");
      expect(res).toEqual(["Lower rate"]);
    });

    it("filters and sanitizes elements in array", () => {
      const res = toStringArray(["Advantage 1", "", null, "<think>foo</think>Advantage 2"]);
      expect(res).toEqual(["Advantage 1", "Advantage 2"]);
    });
  });

  describe("runFinancialCouncil Judge Resilience", () => {
    it("successfully creates judge assessment when primary judgeAgent.object is present", async () => {
      vi.mocked(optimistAgent.generate).mockResolvedValue({
        text: "The interest rate reduction offers clear savings.",
      } as any);
      vi.mocked(pessimistAgent.generate).mockResolvedValue({
        text: "Foreclosure penalties and floating rate risks apply.",
      } as any);

      vi.mocked(judgeAgent.generate).mockResolvedValue({
        object: {
          verdict: "Proceed with Pre-closure Verification",
          balancedAssessment: "Interest savings outweigh nominal charges if held beyond lock-in.",
          benefits: ["Significant interest savings"],
          risks: ["Prepayment penalty applies within 12 months"],
          assumptions: ["Borrower has adequate emergency fund"],
          verificationSteps: ["Check sanction letter KFS page 7"],
        },
      } as any);

      const result = await runFinancialCouncil("Should I prepay my loan?");
      expect(result.judgeAssessment).toBeDefined();
      expect(result.judgeAssessment?.verdict).toBe("Proceed with Pre-closure Verification");
      expect(result.judgeAssessment?.benefits).toEqual(["Significant interest savings"]);
      expect(result.error).toBeUndefined();
    });

    it("recovers via JSON text extraction when judgeAgent.object is undefined but raw text contains JSON", async () => {
      vi.mocked(optimistAgent.generate).mockResolvedValue({
        text: "Investment returns could exceed loan interest.",
      } as any);
      vi.mocked(pessimistAgent.generate).mockResolvedValue({
        text: "Market volatility may diminish returns.",
      } as any);

      // Model returned raw text with json code block, but Mastra object parsing was undefined
      vi.mocked(judgeAgent.generate).mockResolvedValue({
        object: undefined,
        text: "```json\n{\n  \"verdict\": \"Balanced Strategy\",\n  \"balancedAssessment\": \"Split surplus between prepay and systematic investment.\",\n  \"benefits\": [\"Reduced debt\", \"Liquidity retained\"],\n  \"risks\": [\"Opportunity cost\"],\n  \"assumptions\": [\"Stable cashflow\"],\n  \"verificationSteps\": [\"Verify exact prepayment fee\"]\n}\n```",
      } as any);

      const result = await runFinancialCouncil("Should I prepay or invest?");
      expect(result.judgeAssessment).toBeDefined();
      expect(result.judgeAssessment?.verdict).toBe("Balanced Strategy");
      expect(result.judgeAssessment?.benefits).toHaveLength(2);
      expect(result.error).toBeUndefined();
    });

    it("recovers via fallbackAi provider fallback when primary judgeAgent throws an exception", async () => {
      vi.mocked(optimistAgent.generate).mockResolvedValue({
        text: "Optimist perspective text.",
      } as any);
      vi.mocked(pessimistAgent.generate).mockResolvedValue({
        text: "Pessimist perspective text.",
      } as any);

      // judgeAgent throws quota or provider exception
      vi.mocked(judgeAgent.generate).mockRejectedValue(new Error("429 Rate limit exceeded"));

      // fallbackAi recovers
      vi.mocked(fallbackAi.models.generateContent).mockResolvedValue({
        text: JSON.stringify({
          verdict: "Cautious Execution",
          balancedAssessment: "Synthesized via resilient provider fallback.",
          benefits: ["Lower monthly burden"],
          risks: ["Liquidity constraint"],
          assumptions: ["Fixed rate continues"],
          verificationSteps: ["Review KFS clause 13"],
        }),
      } as any);

      const result = await runFinancialCouncil("Should I prepay my loan?");
      expect(result.judgeAssessment).toBeDefined();
      expect(result.judgeAssessment?.verdict).toBe("Cautious Execution");
      expect(result.judgeAssessment?.balancedAssessment).toContain("Synthesized via resilient provider fallback");
    });

    it("preserves honest failure state without fabricating a verdict when all recovery attempts fail", async () => {
      vi.mocked(optimistAgent.generate).mockResolvedValue({
        text: "Optimist perspective text.",
      } as any);
      vi.mocked(pessimistAgent.generate).mockResolvedValue({
        text: "Pessimist perspective text.",
      } as any);

      // Both primary and fallback provider fail
      vi.mocked(judgeAgent.generate).mockRejectedValue(new Error("Mastra agent connection failure"));
      vi.mocked(fallbackAi.models.generateContent).mockRejectedValue(new Error("Groq and Gemini exhausted"));

      const result = await runFinancialCouncil("Should I prepay my loan?");
      // Must NOT fabricate a false verdict
      expect(result.judgeAssessment).toBeUndefined();
      expect(result.error).toContain("Council verdict unavailable");
      // Perspectives must still be preserved for user visibility
      expect(result.optimistPerspective).toBe("Optimist perspective text.");
      expect(result.pessimistPerspective).toBe("Pessimist perspective text.");
    });
  });
});
