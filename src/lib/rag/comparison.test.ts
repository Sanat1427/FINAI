import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectComparisonQuery,
  extractCandidateEntities,
  extractComparisonTopic,
  resolveTargetSources,
  executeMultiDocumentComparison,
} from "./comparison";
import * as searchModule from "./search";
import { fallbackAi } from "../ai/fallback";

vi.mock("./search", () => ({
  searchDocuments: vi.fn(),
}));

vi.mock("../ai/fallback", () => ({
  fallbackAi: {
    models: {
      generateContent: vi.fn(),
    },
  },
}));

describe("Multi-Document Comparison & Independent Retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectComparisonQuery", () => {
    it("detects multi-document comparison queries explicitly", () => {
      expect(
        detectComparisonQuery("Compare SBI and ICICI prepayment conditions using both uploaded documents.")
      ).toBe(true);
      expect(
        detectComparisonQuery("What is the difference between ICICI and SBI pre-closure fees?")
      ).toBe(true);
      expect(
        detectComparisonQuery("Compare loan terms across both uploaded documents.")
      ).toBe(true);
    });

    it("does not flag standard single-document queries as comparisons", () => {
      expect(
        detectComparisonQuery("What are the prepayment conditions for ICICI unsecured personal loans?")
      ).toBe(false);
      expect(
        detectComparisonQuery("What does the SBI document say about processing fee?")
      ).toBe(false);
      expect(
        detectComparisonQuery("What is inflation according to RBI?")
      ).toBe(false);
    });
  });

  describe("extractCandidateEntities & extractComparisonTopic", () => {
    it("extracts candidate institution/document names from comparison query", () => {
      const candidates = extractCandidateEntities(
        "Compare SBI and ICICI prepayment conditions using both uploaded documents."
      );
      expect(candidates).toContain("SBI");
      expect(candidates).toContain("ICICI");
      expect(candidates).not.toContain("compare");
      expect(candidates).not.toContain("both");
    });

    it("extracts substantive topic without institution names and comparison keywords", () => {
      const topic = extractComparisonTopic(
        "Compare SBI and ICICI prepayment conditions using both uploaded documents.",
        ["SBI", "ICICI"]
      );
      expect(topic.toLowerCase()).toContain("prepayment");
      expect(topic.toLowerCase()).toContain("conditions");
      expect(topic.toLowerCase()).not.toContain("sbi");
      expect(topic.toLowerCase()).not.toContain("icici");
      expect(topic.toLowerCase()).not.toContain("compare");
    });
  });

  describe("resolveTargetSources", () => {
    it("dynamically resolves target documents from authorized user documents without hardcoded rules", async () => {
      const mockUserDocs = [
        { id: 1, name: "RBI FAME" },
        { id: 3, name: "terms-and-conditions-unsecured-loans.pdf" },
        { id: 7, name: "1791752890105-10062022_MITC-_Personal_Loans.pdf" },
      ];

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "documents") {
            return {
              select: vi.fn().mockResolvedValue({ data: mockUserDocs, error: null }),
            };
          }
          if (table === "document_chunks") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn((_col: string, val: string) => ({
                in: vi.fn((_inCol: string, _ids: number[]) => {
                  if (val.toLowerCase().includes("sbi")) {
                    return {
                      limit: vi.fn().mockResolvedValue({
                        data: [{ document_id: 7, source: "1791752890105-10062022_MITC-_Personal_Loans.pdf" }],
                      }),
                    };
                  }
                  if (val.toLowerCase().includes("icici")) {
                    return {
                      limit: vi.fn().mockResolvedValue({
                        data: [{ document_id: 3, source: "terms-and-conditions-unsecured-loans.pdf" }],
                      }),
                    };
                  }
                  return { limit: vi.fn().mockResolvedValue({ data: [] }) };
                }),
              })),
            };
          }
          return {};
        }),
      };

      const { targets, missingRequested } = await resolveTargetSources(
        "Compare SBI and ICICI prepayment conditions using both uploaded documents.",
        mockSupabase
      );

      expect(targets).toHaveLength(2);
      const targetIds = targets.map((t) => t.id);
      expect(targetIds).toContain(3);
      expect(targetIds).toContain(7);
      expect(missingRequested).toHaveLength(0);
    });

    it("identifies missing requested institutions that do not exist in authorized documents", async () => {
      const mockUserDocs = [
        { id: 3, name: "terms-and-conditions-unsecured-loans.pdf" },
      ];

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "documents") {
            return {
              select: vi.fn().mockResolvedValue({ data: mockUserDocs, error: null }),
            };
          }
          if (table === "document_chunks") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn((_col: string, val: string) => ({
                in: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: val.toLowerCase().includes("icici") ? [{ document_id: 3 }] : [],
                  }),
                }),
              })),
            };
          }
          return {};
        }),
      };

      const { targets, missingRequested } = await resolveTargetSources(
        "Compare HDFC and ICICI prepayment conditions.",
        mockSupabase
      );

      expect(targets).toHaveLength(1);
      expect(targets[0].id).toBe(3);
      expect(missingRequested).toContain("HDFC");
    });
  });

  describe("executeMultiDocumentComparison", () => {
    it("retrieves evidence independently per source and preserves page numbers and excerpts", async () => {
      const mockUserDocs = [
        { id: 3, name: "terms-and-conditions-unsecured-loans.pdf" },
        { id: 7, name: "1791752890105-10062022_MITC-_Personal_Loans.pdf" },
      ];

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "documents") {
            return {
              select: vi.fn().mockResolvedValue({ data: mockUserDocs, error: null }),
            };
          }
          if (table === "document_chunks") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn((_col: string, val: string) => ({
                in: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: val.toLowerCase().includes("sbi")
                      ? [{ document_id: 7 }]
                      : val.toLowerCase().includes("icici")
                      ? [{ document_id: 3 }]
                      : [],
                  }),
                }),
              })),
            };
          }
          return {};
        }),
      };

      // Mock independent retrieval returns
      vi.mocked(searchModule.searchDocuments).mockImplementation(
        async (query: string, matchCount?: number, source?: string) => {
          if (source?.includes("10062022_MITC")) {
            // SBI retrieval returns Page 2 (2% pre-closure charge) and Page 1 (cooling off)
            return [
              {
                id: 325,
                content: "13. PRE-CLOSURE CHARGES: Any prepayment of EMI in full or in part will attract prepayment charges of 2%.",
                similarity: 0.72,
                page_number: 2,
                source: "1791752890105-10062022_MITC-_Personal_Loans.pdf",
                metadata: null,
              },
            ];
          }
          if (source?.includes("unsecured-loans")) {
            // ICICI retrieval returns Page 7 (KFS clause)
            return [
              {
                id: 162,
                content: "7. PREPAYMENT CHARGES (I) Subject to payment of prepayment fees/charges as specified in the KFS.",
                similarity: 0.74,
                page_number: 7,
                source: "terms-and-conditions-unsecured-loans.pdf",
                metadata: null,
              },
            ];
          }
          return [];
        }
      );

      vi.mocked(fallbackAi.models.generateContent).mockResolvedValue({
        text: `### Prepayment Comparison\n\n- **SBI (Page 2)**: 2% prepayment charge on prepaid amount.\n- **ICICI (Page 7)**: Prepayment charges as specified in KFS.`,
      } as any);

      const res = await executeMultiDocumentComparison(
        "Compare SBI and ICICI prepayment conditions using both uploaded documents.",
        [],
        mockSupabase
      );

      expect(res.isComparison).toBe(true);
      expect(res.answer).toContain("SBI (Page 2)");
      expect(res.answer).toContain("ICICI (Page 7)");
      expect(res.sources).toHaveLength(2);
      expect(res.sources.find((s) => s.pageNumber === 2)).toBeDefined();
      expect(res.sources.find((s) => s.pageNumber === 7)).toBeDefined();
      expect(res.missingSources).toEqual([]);
    });

    it("refuses to fabricate comparison and reports missing source when one document has no relevant evidence", async () => {
      const mockUserDocs = [
        { id: 3, name: "terms-and-conditions-unsecured-loans.pdf" },
        { id: 7, name: "1791752890105-10062022_MITC-_Personal_Loans.pdf" },
      ];

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "documents") {
            return {
              select: vi.fn().mockResolvedValue({ data: mockUserDocs, error: null }),
            };
          }
          if (table === "document_chunks") {
            return {
              select: vi.fn().mockReturnThis(),
              ilike: vi.fn((_col: string, val: string) => ({
                in: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: val.toLowerCase().includes("sbi")
                      ? [{ document_id: 7 }]
                      : val.toLowerCase().includes("icici")
                      ? [{ document_id: 3 }]
                      : [],
                  }),
                }),
              })),
            };
          }
          return {};
        }),
      };

      // Mock ICICI has evidence, but SBI yields no relevant evidence
      vi.mocked(searchModule.searchDocuments).mockImplementation(
        async (_query: string, _matchCount?: number, source?: string) => {
          if (source?.includes("unsecured-loans")) {
            return [
              {
                id: 162,
                content: "7. PREPAYMENT CHARGES as specified in KFS.",
                similarity: 0.74,
                page_number: 7,
                source: "terms-and-conditions-unsecured-loans.pdf",
                metadata: null,
              },
            ];
          }
          return []; // SBI returns empty
        }
      );

      const res = await executeMultiDocumentComparison(
        "Compare SBI and ICICI prepayment conditions using both uploaded documents.",
        [],
        mockSupabase
      );

      expect(res.isComparison).toBe(true);
      expect(res.missingSources).toContain("1791752890105-10062022_MITC-_Personal_Loans.pdf");
      expect(res.answer).toContain("Missing Evidence");
      expect(res.answer).toContain("Relevant evidence could not be retrieved");
      // Must not generate fabricated comparison
      expect(fallbackAi.models.generateContent).not.toHaveBeenCalled();
    });
  });
});
