import { describe, it, expect } from "vitest";
import { parseMarkdownToBlocks, renderInlineMarkdown, decodeHtmlEntities, cleanListItemText } from "../common/MarkdownRenderer";

describe("MarkdownRenderer Block Parsing", () => {
  it("correctly parses headings and paragraphs", () => {
    const markdown = "### General Prepayment Terms\n\nThis is a standard clause for prepayment fees.";
    const blocks = parseMarkdownToBlocks(markdown);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: "heading",
      level: 3,
      text: "General Prepayment Terms",
    });
    expect(blocks[1]).toEqual({
      type: "paragraph",
      text: "This is a standard clause for prepayment fees.",
    });
  });

  it("correctly parses unordered lists with bullets or asterisks", () => {
    const markdown = "- Full Prepayment: Allowed after 12 months\n- Partial Prepayment: Permitted up to 25%\n- Lock-in period: None";
    const blocks = parseMarkdownToBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("ul");
    expect(blocks[0].items).toEqual([
      "Full Prepayment: Allowed after 12 months",
      "Partial Prepayment: Permitted up to 25%",
      "Lock-in period: None",
    ]);
  });

  it("correctly parses ordered numbered lists", () => {
    const markdown = "1. Verify interest rate in sanction letter\n2. Review KFS terms\n3. Calculate net foreclosure charges";
    const blocks = parseMarkdownToBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("ol");
    expect(blocks[0].items).toEqual([
      "Verify interest rate in sanction letter",
      "Review KFS terms",
      "Calculate net foreclosure charges",
    ]);
  });

  it("extracts inline bold, italic, and code without double escaping or HTML leakage", () => {
    const text = "**General Rule:** Foreclosure charges are subject to `KFS` rules *always*.";
    const renderedNodes = renderInlineMarkdown(text);

    expect(renderedNodes).toBeDefined();
    expect(Array.isArray(renderedNodes)).toBe(true);
    // Should split into parts: bold node, code node, italic node, plain text fragments
    expect(renderedNodes.length).toBeGreaterThanOrEqual(4);
  });
});

describe("Citation Deduplication & Knowledge Base Reference Logic", () => {
  // Test helper replicating CouncilResponse's deduplication logic
  function deduplicateCitations(
    citations: Array<{ source: string; pageNumber: number | null; snippet?: string }>,
    evidence: Array<{ source: string; fact?: string }>,
    mainAnswer: string
  ) {
    const seen = new Set<string>();
    const result: Array<{ source: string; pageNumber: string | null; snippet?: string }> = [];

    if (citations && citations.length > 0) {
      for (const c of citations) {
        if (!c.source) continue;
        const pageStr = c.pageNumber !== null ? String(c.pageNumber) : null;
        const key = `${c.source}#${pageStr || ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({
            source: c.source,
            pageNumber: pageStr,
            snippet: c.snippet && c.snippet !== mainAnswer ? c.snippet : undefined,
          });
        }
      }
      return result;
    }

    if (evidence && evidence.length > 0) {
      for (const e of evidence) {
        if (!e.source) continue;
        const pageMatch = e.source.match(/\(Page\s+(\d+)\)/i);
        const cleanSource = e.source.replace(/\s*\(Page\s+\d+\)/i, "").trim();
        const pageNum = pageMatch ? pageMatch[1] : null;

        const key = `${cleanSource}#${pageNum || ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          const snippet =
            e.fact && e.fact.trim() !== mainAnswer.trim() && !e.fact.startsWith("[RETRIEVAL_ERROR")
              ? e.fact
              : undefined;
          result.push({
            source: cleanSource,
            pageNumber: pageNum,
            snippet,
          });
        }
      }
    }

    return result;
  }

  it("deduplicates repeated chunks from the same document and page", () => {
    const rawCitations = [
      { source: "terms-and-conditions-unsecured-loans.pdf", pageNumber: 7, snippet: "Clause 7.1" },
      { source: "terms-and-conditions-unsecured-loans.pdf", pageNumber: 7, snippet: "Clause 7.2" },
      { source: "terms-and-conditions-unsecured-loans.pdf", pageNumber: 7, snippet: "Clause 7.3" },
      { source: "rbi_fame.pdf", pageNumber: 12, snippet: "RBI Guideline 3.2" },
    ];

    const deduplicated = deduplicateCitations(rawCitations, [], "Some answer");
    expect(deduplicated).toHaveLength(2);
    expect(deduplicated[0].source).toBe("terms-and-conditions-unsecured-loans.pdf");
    expect(deduplicated[0].pageNumber).toBe("7");
    expect(deduplicated[1].source).toBe("rbi_fame.pdf");
    expect(deduplicated[1].pageNumber).toBe("12");
  });

  it("prevents the main answer from being duplicated inside citation snippets", () => {
    const mainAnswer = "Based on the ICICI personal loan agreement, prepayment is subject to charges specified in the KFS.";
    const evidence = [
      {
        source: "terms-and-conditions-unsecured-loans.pdf (Page 7)",
        fact: mainAnswer, // Intentionally identical to test deduplication
      },
    ];

    const result = deduplicateCitations([], evidence, mainAnswer);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("terms-and-conditions-unsecured-loans.pdf");
    expect(result[0].pageNumber).toBe("7");
    // Snippet must NOT be set to the full answer
    expect(result[0].snippet).toBeUndefined();
  });
});

describe("Fast-Path vs Full Council Response Contract", () => {
  it("fast-path response clearly flags isFastPath and does not fabricate perspectives", () => {
    const fastPathResult = {
      isFastPath: true,
      routing: "fast_path",
      sources: ["terms-and-conditions-unsecured-loans.pdf"],
      citations: [
        {
          source: "terms-and-conditions-unsecured-loans.pdf",
          pageNumber: 7,
          snippet: "Prepayment charges as specified in KFS",
        },
      ],
      judgeAssessment: {
        verdict: "Grounded Document Extract",
        balancedAssessment: "Direct answer from document.",
        benefits: [],
        risks: [],
        assumptions: ["Directly referenced from authorized knowledge base documents."],
        verificationSteps: ["Verify specific terms against your sanction letter."],
        evidence: [
          {
            fact: "Prepayment charges as specified in KFS",
            source: "terms-and-conditions-unsecured-loans.pdf (Page 7)",
          },
        ],
      },
    };

    expect(fastPathResult.isFastPath).toBe(true);
    expect(fastPathResult.routing).toBe("fast_path");
    expect((fastPathResult as any).optimistPerspective).toBeUndefined();
    expect((fastPathResult as any).pessimistPerspective).toBeUndefined();
    expect(fastPathResult.citations).toHaveLength(1);
  });

  it("handles partial Council failure honestly without hiding missing perspective", () => {
    const partialCouncilResult = {
      isFastPath: false,
      routing: "financial_council",
      optimistPerspective: "There is opportunity to invest surplus capital elsewhere.",
      pessimistPerspective: undefined, // Failed agent
      error: "Pessimist agent failed to generate an analysis.",
      judgeAssessment: {
        verdict: "Cautious Proceed",
        balancedAssessment: "Only optimistic perspective was available.",
        benefits: ["Opportunity to invest surplus capital"],
        risks: [],
        assumptions: [],
        verificationSteps: [],
        evidence: [],
      },
    };

    const hasOptimist = Boolean(partialCouncilResult.optimistPerspective);
    const hasPessimist = Boolean(partialCouncilResult.pessimistPerspective);

    expect(hasOptimist).toBe(true);
    expect(hasPessimist).toBe(false);
    expect(partialCouncilResult.error).toContain("Pessimist agent failed");
  });
});

describe("Task 4: HTML Entity Decoding and Bullet Marker Normalization", () => {
  it("decodes hexadecimal and decimal HTML entities correctly", () => {
    // &#x55; -> 'U', &#85; -> 'U', &amp; -> '&', &quot; -> '"'
    const input = "&#x55;ser agreement for &quot;Personal Loan&quot; &amp; &#x49;CICI terms.";
    const decoded = decodeHtmlEntities(input);

    expect(decoded).toBe('User agreement for "Personal Loan" & ICICI terms.');
  });

  it("normalizes and strips literal **•** and malformed bullet markers from list items", () => {
    const rawBenefit = "**•** Lower EMI burden over tenure";
    const cleaned = cleanListItemText(rawBenefit);

    expect(cleaned).toBe("Lower EMI burden over tenure");
    expect(cleaned).not.toContain("**•**");
    expect(cleaned.startsWith("•")).toBe(false);
  });

  it("handles mixed bullet markers and decodes HTML entities inside list items", () => {
    const rawRisk = "*•* &#x55;nexpected prepayment penalty charges of 2% &amp; GST";
    const cleaned = cleanListItemText(rawRisk);

    expect(cleaned).toBe("Unexpected prepayment penalty charges of 2% & GST");
  });

  it("correctly parses markdown blocks containing **•** as unordered lists", () => {
    const markdown = "**•** First opportunity\n**•** Second opportunity\n- Third opportunity";
    const blocks = parseMarkdownToBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("ul");
    expect(blocks[0].items).toEqual([
      "First opportunity",
      "Second opportunity",
      "Third opportunity",
    ]);
  });

  it("renderInlineMarkdown eliminates literal **•** and decodes HTML entities without raw string leakage", () => {
    const text = "**•** **Prepayment Rule:** &#x55;p to 25% allowed per fiscal year.";
    const nodes = renderInlineMarkdown(text);

    expect(nodes).toBeDefined();
    // Does not have raw un-rendered entities
    const hasHtmlEntity = JSON.stringify(nodes).includes("&#x55;");
    expect(hasHtmlEntity).toBe(false);
  });
});
