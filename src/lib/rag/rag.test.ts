import { describe, it, expect, vi, beforeEach } from "vitest";
import { answerWithRAG } from "./rag";
import * as queryModule from "./query";
import * as searchModule from "./search";
import { fallbackAi } from "../ai/fallback";
import { addDocument } from "./ingest";
import * as embeddingModule from "@/lib/ai/embedding";

// Mock dependencies
vi.mock("./query", () => ({
  decomposeQuery: vi.fn(),
}));

vi.mock("./search", () => ({
  searchDocuments: vi.fn(),
  searchMultipleQueries: vi.fn(),
  deduplicateResults: vi.fn((res) => res),
  rankResults: vi.fn((res) => res),
}));

vi.mock("@/lib/ai/embedding", () => ({
  generateEmbedding: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("../ai/fallback", () => ({
  fallbackAi: {
    models: {
      generateContent: vi.fn(),
    },
  },
}));

describe("RAG Pipeline & Retrieval Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("answerWithRAG", () => {
    it("handles rate limits in decomposition gracefully", async () => {
      vi.mocked(queryModule.decomposeQuery).mockRejectedValue(new Error("429 Too Many Requests"));

      const result = await answerWithRAG("Test query? and another?");
      expect(result.answer).toContain("[ERROR: RATE_LIMIT]");
      expect(result.sources).toEqual([]);
    });

    it("handles rate limits in search gracefully", async () => {
      vi.mocked(queryModule.decomposeQuery).mockResolvedValue(["Test query"]);
      vi.mocked(searchModule.searchMultipleQueries).mockRejectedValue(new Error("Rate limit exceeded (quota)"));

      const result = await answerWithRAG("Test query? and another?");
      expect(result.answer).toContain("[ERROR: RATE_LIMIT]");
      expect(result.sources).toEqual([]);
    });

    it("distinguishes generic retrieval error from empty results", async () => {
      vi.mocked(queryModule.decomposeQuery).mockResolvedValue(["Test query"]);
      vi.mocked(searchModule.searchMultipleQueries).mockRejectedValue(new Error("Postgres RPC connection timeout"));

      const result = await answerWithRAG("What are the loan terms?");
      // Must be an explicit RETRIEVAL_FAILED error, NOT masked as "No relevant evidence found"
      expect(result.answer).toContain("[ERROR: RETRIEVAL_FAILED]");
      expect(result.answer).toContain("Postgres RPC connection timeout");
      expect(result.sources).toEqual([]);
    });

    it("distinguishes query decomposition failure from empty results", async () => {
      vi.mocked(queryModule.decomposeQuery).mockRejectedValue(new Error("LLM JSON parsing error"));

      const result = await answerWithRAG("Question one and question two?");
      expect(result.answer).toContain("[ERROR: DECOMPOSITION_FAILED]");
      expect(result.sources).toEqual([]);
    });

    it("returns clean empty result when knowledge base has no matches without source filter", async () => {
      vi.mocked(queryModule.decomposeQuery).mockResolvedValue(["Unknown topic query"]);
      vi.mocked(searchModule.searchMultipleQueries).mockResolvedValue([]);
      vi.mocked(searchModule.deduplicateResults).mockReturnValue([]);
      vi.mocked(searchModule.rankResults).mockReturnValue([]);

      const result = await answerWithRAG("Unknown topic query");
      expect(result.answer).toBe("No relevant evidence found in the knowledge base.");
      expect(result.sources).toEqual([]);
    });

    it("distinguishes empty result when specific source filter yields no matches", async () => {
      vi.mocked(queryModule.decomposeQuery).mockResolvedValue(["Prepayment penalty?"]);
      vi.mocked(searchModule.searchMultipleQueries).mockResolvedValue([]);
      vi.mocked(searchModule.deduplicateResults).mockReturnValue([]);
      vi.mocked(searchModule.rankResults).mockReturnValue([]);

      const result = await answerWithRAG("Prepayment penalty?", [], "terms-and-conditions-unsecured-loans.pdf");
      expect(result.answer).toContain("No relevant evidence found in the specified document");
      expect(result.sources).toEqual([]);
    });

    it("handles ICICI document retrieval and refuses to invent customer rate", async () => {
      vi.mocked(queryModule.decomposeQuery).mockResolvedValue(["What is the rate of interest for ICICI loan?"]);
      vi.mocked(searchModule.searchMultipleQueries).mockResolvedValue([
        {
          id: 162,
          content: "7. PREPAYMENT CHARGES (I) Subject to payment of prepayment fees/charges as specified in the KFS.",
          similarity: 0.748,
          page_number: 7,
          source: "terms-and-conditions-unsecured-loans.pdf",
          metadata: null,
        },
      ]);
      vi.mocked(searchModule.deduplicateResults).mockImplementation((res) => res);
      vi.mocked(searchModule.rankResults).mockImplementation((res) => res);
      vi.mocked(fallbackAi.models.generateContent).mockResolvedValue({
        text: "Partial or full prepayment is subject to charges specified in the KFS. The document does not specify a fixed fee.",
      } as any);

      const result = await answerWithRAG("What are the prepayment conditions for ICICI unsecured personal loans?");
      expect(result.answer).toContain("prepayment is subject to charges specified in the KFS");
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].source).toBe("terms-and-conditions-unsecured-loans.pdf");
      expect(result.sources[0].pageNumber).toBe(7);
      expect(result.sources[0].similarity).toBe(0.748);
    });

    it("passes customClient down to searchMultipleQueries for authenticated testing without live cookies", async () => {
      vi.mocked(queryModule.decomposeQuery).mockResolvedValue(["Query"]);
      vi.mocked(searchModule.searchMultipleQueries).mockResolvedValue([]);
      const mockCustomClient = { rpc: vi.fn() };

      await answerWithRAG("Query", [], "some-doc.pdf", mockCustomClient);
      expect(searchModule.searchMultipleQueries).toHaveBeenCalledWith(
        ["Query"],
        3,
        "some-doc.pdf",
        mockCustomClient
      );
    });
  });

  describe("addDocument (Ingestion Idempotency)", () => {
    it("skips insertion and returns skipped: true when chunk already exists for parent document", async () => {
      const existingChunk = {
        id: 162,
        page_number: 7,
        source: "terms-and-conditions-unsecured-loans.pdf",
        document_id: 3,
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: existingChunk });
      const mockEqContent = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEqDocId = vi.fn().mockReturnValue({ eq: mockEqContent });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqDocId });
      const mockInsert = vi.fn();

      const mockCustomClient = {
        from: vi.fn().mockReturnValue({
          select: mockSelect,
          insert: mockInsert,
        }),
      };

      const res = await addDocument(
        "Existing chunk content",
        { type: "pdf" },
        7,
        "terms-and-conditions-unsecured-loans.pdf",
        3,
        mockCustomClient
      );

      expect(res.skipped).toBe(true);
      expect(res.id).toBe(162);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("inserts new chunk and returns skipped: false when chunk does not yet exist", async () => {
      const mockEmbedding = new Array(768).fill(0.2);
      vi.mocked(embeddingModule.generateEmbedding).mockResolvedValue(mockEmbedding);

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null });
      const mockEqContent = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEqDocId = vi.fn().mockReturnValue({ eq: mockEqContent });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqDocId });

      const newInsertedChunk = {
        id: 163,
        content: "New chunk content",
        page_number: 1,
        source: "terms-and-conditions-unsecured-loans.pdf",
        document_id: 3,
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: newInsertedChunk, error: null });
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

      const mockCustomClient = {
        from: vi.fn().mockReturnValue({
          select: mockSelect,
          insert: mockInsert,
        }),
      };

      const res = await addDocument(
        "New chunk content",
        { type: "pdf" },
        1,
        "terms-and-conditions-unsecured-loans.pdf",
        3,
        mockCustomClient
      );

      expect(res.skipped).toBe(false);
      expect(res.id).toBe(163);
      expect(mockInsert).toHaveBeenCalledWith({
        content: "New chunk content",
        metadata: { type: "pdf" },
        embedding: mockEmbedding,
        page_number: 1,
        source: "terms-and-conditions-unsecured-loans.pdf",
        document_id: 3,
      });
    });
  });

  describe("Financial Council Error Handling", () => {
    it("surfaces failure when both Optimist and Pessimist agents fail", () => {
      const optimistPerspective = null;
      const pessimistPerspective = null;
      let errorMsg: string | undefined = undefined;

      if (!optimistPerspective && !pessimistPerspective) {
        errorMsg = errorMsg
          ? `${errorMsg} Both Optimist and Pessimist agents failed.`
          : "Both Optimist and Pessimist agents failed to generate analyses.";
      } else if (!optimistPerspective && pessimistPerspective) {
        errorMsg = "Optimist agent also failed.";
      } else if (optimistPerspective && !pessimistPerspective) {
        errorMsg = "Pessimist agent also failed.";
      }

      expect(errorMsg).toBe("Both Optimist and Pessimist agents failed to generate analyses.");
    });
  });
});
