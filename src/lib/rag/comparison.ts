import { searchDocuments, SearchResult } from "@/lib/rag/search";
import { fallbackAi as ai } from "@/lib/ai/fallback";

export interface ComparisonTarget {
  id: number;
  name: string;
  matchedEntity?: string;
}

export interface ComparisonEvidence {
  source: string;
  documentId: number;
  results: SearchResult[];
  hasRelevantEvidence: boolean;
}

export interface ComparisonResponse {
  isComparison: boolean;
  answer: string;
  sources: Array<{
    source: string;
    pageNumber: number | null;
    similarity: number;
    excerpt?: string;
  }>;
  missingSources: string[];
}

const COMPARISON_PATTERNS = [
  /\bcompare\b/i,
  /\bcomparison\b/i,
  /\bdiffer(ence|ences|ent)?\s+(between|in|among)\b/i,
  /\bversus\b|\bvs\.?\b/i,
  /\bboth\s+(uploaded\s+)?(documents?|docs?|files?)\b/i,
  /\bwhich\s+(is|are)\s+(better|cheaper|preferable)\b/i,
];

const STOPWORDS = new Set([
  "compare", "comparison", "differ", "difference", "differences",
  "and", "or", "versus", "vs", "between", "among", "with",
  "using", "both", "uploaded", "documents", "document", "doc", "docs", "file", "files",
  "the", "a", "an", "in", "of", "to", "for", "from", "on", "by", "about",
  "what", "is", "are", "does", "how", "conditions", "terms", "policy", "policies",
  "please", "tell", "me", "can", "you", "explain",
  // Common financial topic nouns that should not be stripped as target entities
  "prepayment", "preclosures", "preclosure", "foreclosure", "foreclosures",
  "charges", "fees", "fee", "penalty", "interest", "rate", "apr", "loan", "loans",
  "borrowing", "repayment", "payment", "tenure", "amount", "limit", "kfs", "mitc"
]);

/**
 * Detects if a user query is asking for a multi-document or multi-institution comparison.
 */
export function detectComparisonQuery(query: string): boolean {
  if (!query || typeof query !== "string") return false;
  return COMPARISON_PATTERNS.some((pattern) => pattern.test(query));
}

/**
 * Extracts candidate entity tokens (e.g., institution acronyms or names) from query.
 */
export function extractCandidateEntities(query: string): string[] {
  const words = query
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (word.length >= 2) {
      candidates.push(word);
    }
  }

  return Array.from(new Set(candidates));
}

/**
 * Extracts substantive topic from comparison query (e.g., "prepayment conditions").
 */
export function extractComparisonTopic(query: string, candidateEntities: string[] = []): string {
  const entitySet = new Set(candidateEntities.map((e) => e.toLowerCase()));
  const words = query
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const topicWords = words.filter((w) => {
    const lower = w.toLowerCase();
    if (entitySet.has(lower)) return false;
    if (
      lower === "compare" ||
      lower === "comparison" ||
      lower === "using" ||
      lower === "both" ||
      lower === "uploaded" ||
      lower === "documents" ||
      lower === "document" ||
      lower === "between" ||
      lower === "and" ||
      lower === "versus" ||
      lower === "vs"
    ) {
      return false;
    }
    return true;
  });

  return topicWords.join(" ") || query;
}

/**
 * Resolves target document IDs and names from the authenticated user's accessible documents.
 * Dynamically queries document chunks or filenames without hardcoded institution names.
 */
export async function resolveTargetSources(
  query: string,
  supabase: any
): Promise<{ targets: ComparisonTarget[]; missingRequested: string[] }> {
  const { data: userDocs, error } = await supabase
    .from("documents")
    .select("id, name");

  if (error || !userDocs || userDocs.length === 0) {
    return { targets: [], missingRequested: [] };
  }

  const userDocIds = userDocs.map((d: any) => d.id);
  const targetsMap = new Map<number, ComparisonTarget>();
  const matchedEntities = new Set<string>();
  const candidates = extractCandidateEntities(query);

  // 1. Check if query matches document filenames directly
  for (const doc of userDocs) {
    const docNameLower = doc.name.toLowerCase();
    for (const cand of candidates) {
      if (docNameLower.includes(cand.toLowerCase())) {
        targetsMap.set(doc.id, { id: doc.id, name: doc.name, matchedEntity: cand });
        matchedEntities.add(cand.toLowerCase());
      }
    }
  }

  // 2. Query document_chunks for tokens to identify which accessible doc contains the entity
  for (const cand of candidates) {
    if (matchedEntities.has(cand.toLowerCase())) continue;

    try {
      const { data: matches } = await supabase
        .from("document_chunks")
        .select("document_id, source")
        .ilike("content", `%${cand}%`)
        .in("document_id", userDocIds)
        .limit(1);

      if (matches && matches.length > 0 && matches[0].document_id) {
        const docId = matches[0].document_id;
        const doc = userDocs.find((d: any) => d.id === docId);
        if (doc) {
          targetsMap.set(doc.id, { id: doc.id, name: doc.name, matchedEntity: cand });
          matchedEntities.add(cand.toLowerCase());
        }
      }
    } catch (err) {
      console.warn("Target source resolution lookup error for token:", cand, err);
    }
  }

  // 3. Fallback: If "both uploaded documents" or "both documents" is mentioned and < 2 targets matched
  const mentionsBoth = /\bboth\s+(uploaded\s+)?(documents?|docs?|files?)\b/i.test(query);
  if (mentionsBoth && targetsMap.size < 2) {
    // Pick the user's available uploaded documents (exclude shared reference if private exist)
    const privateDocs = userDocs.filter((d: any) => d.name !== "RBI FAME");
    const candidateDocs = privateDocs.length >= 2 ? privateDocs : userDocs;
    for (const doc of candidateDocs) {
      if (!targetsMap.has(doc.id) && targetsMap.size < 2) {
        targetsMap.set(doc.id, { id: doc.id, name: doc.name });
      }
    }
  }

  // 4. Identify any requested entities that could not be mapped to accessible documents
  const missingRequested: string[] = [];
  const acronymsOrNamed = candidates.filter((c) => /^[A-Z]{2,10}$/.test(c) || /^[A-Z][a-z]+/.test(c));
  for (const entity of acronymsOrNamed) {
    if (!matchedEntities.has(entity.toLowerCase())) {
      missingRequested.push(entity);
    }
  }

  return {
    targets: Array.from(targetsMap.values()),
    missingRequested,
  };
}

/**
 * Executes independent retrieval and generates grounded comparison.
 */
export async function executeMultiDocumentComparison(
  query: string,
  history: Array<{ role: string; content: string }> = [],
  supabase: any
): Promise<ComparisonResponse> {
  const { targets, missingRequested } = await resolveTargetSources(query, supabase);

  // If fewer than 2 documents could be resolved
  if (targets.length < 2) {
    if (targets.length === 1 && missingRequested.length > 0) {
      return {
        isComparison: true,
        answer: `Cannot generate full comparison: Missing source evidence for **${missingRequested.join(", ")}**. Only **${targets[0].name}** was found in your authorized documents.`,
        sources: [],
        missingSources: missingRequested,
      };
    }
    return {
      isComparison: false,
      answer: "Could not identify multiple target documents to compare.",
      sources: [],
      missingSources: missingRequested,
    };
  }

  const topic = extractComparisonTopic(query, targets.map((t) => t.matchedEntity || ""));

  // Retrieve evidence independently for each target source
  const targetEvidence: ComparisonEvidence[] = [];
  for (const target of targets) {
    let results: SearchResult[] = [];
    try {
      // 1. Try topic query scoped strictly to target document
      results = await searchDocuments(topic, 4, target.name, supabase, 0.48);

      // 2. If initial search returned fewer than 2 chunks, try broader topic terms
      if (results.length < 2) {
        const broaderResults = await searchDocuments(
          `${topic} charges fees terms penalty`,
          4,
          target.name,
          supabase,
          0.45
        );
        const existingIds = new Set(results.map((r) => r.id));
        for (const br of broaderResults) {
          if (!existingIds.has(br.id)) {
            results.push(br);
            existingIds.add(br.id);
          }
        }
      }
    } catch (err) {
      console.error(`Retrieval failed for target ${target.name}:`, err);
    }

    targetEvidence.push({
      source: target.name,
      documentId: target.id,
      results,
      hasRelevantEvidence: results.length > 0,
    });
  }

  // Check if any requested source lacks evidence
  const missingEvidenceSources = targetEvidence
    .filter((e) => !e.hasRelevantEvidence)
    .map((e) => e.source);

  const allMissing = Array.from(new Set([...missingRequested, ...missingEvidenceSources]));

  // If one or more sources lack evidence, report the missing sources honestly without hallucinating
  if (missingEvidenceSources.length > 0) {
    const available = targetEvidence.filter((e) => e.hasRelevantEvidence);
    const availableNames = available.map((a) => a.source).join(", ");
    const missingNames = allMissing.join(", ");

    let missingExplanation = `### Multi-Document Comparison Status\n\n`;
    missingExplanation += `**Missing Evidence:** Relevant evidence could not be retrieved from **${missingNames}** in your authorized documents.\n\n`;

    if (available.length > 0) {
      missingExplanation += `**Available Evidence from ${availableNames}:**\n\n`;
      for (const av of available) {
        missingExplanation += `#### ${av.source}\n`;
        for (const r of av.results) {
          missingExplanation += `- **Page ${r.page_number}**: ${r.content.slice(0, 200).replace(/\s+/g, " ").trim()}...\n`;
        }
      }
      missingExplanation += `\n*Note: A complete comparison cannot be generated without verified evidence from both documents.*`;
    }

    const flattenedSources = available.flatMap((av) =>
      av.results.map((r) => ({
        source: r.source || av.source,
        pageNumber: r.page_number,
        similarity: r.similarity,
        excerpt: r.content.slice(0, 240).replace(/\s+/g, " ").trim() + "...",
      }))
    );

    return {
      isComparison: true,
      answer: missingExplanation,
      sources: flattenedSources,
      missingSources: allMissing,
    };
  }

  // Both sources have verified evidence! Synthesize grounded comparison
  const allChunks = targetEvidence.flatMap((e) => e.results);
  const context = targetEvidence
    .map((e) => {
      const targetMeta = targets.find((t) => t.id === e.documentId);
      const entityLabel = targetMeta?.matchedEntity ? ` (${targetMeta.matchedEntity})` : "";
      const chunksStr = e.results
        .map((r) => `[Page ${r.page_number}]:\n${r.content}`)
        .join("\n\n");
      return `### Document: ${e.source}${entityLabel}\n${chunksStr}`;
    })
    .join("\n\n====================\n\n");

  const prompt = `You are a financial documentation specialist.
Compare the terms between the requested documents based ONLY on the verified evidence below.

Rules:
1. Ground every claim strictly on the provided excerpts.
2. For EVERY claim or clause, explicitly cite the source filename and page number.
3. If specific charges, percentages, lock-ins, or waivers are mentioned, cite them accurately (e.g. 2% pre-closure charge, 3-day cooling-off period).
4. If a condition references Key Fact Statements (KFS) or sanction letters, state that clearly.
5. Never invent or assume terms not in the evidence.
6. Present a structured, side-by-side or point-by-point comparison with:
   - Summary Comparison Table / Key Differences
   - Detailed Clauses & Conditions for each document (with Page citations)
   - Waivers, Exceptions, or Cooling-off Periods

Verified Knowledge Base Evidence:
${context}

User Comparison Request:
${query}
`;

  let synthesisText = "";
  try {
    const res = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });
    synthesisText = res.text?.trim() || "";
  } catch (err) {
    console.error("Comparison synthesis generation failed:", err);
    synthesisText = "Comparison synthesis failed due to provider rate limit or error. Please see retrieved citations below.";
  }

  const mappedSources = allChunks.map((c) => ({
    source: c.source || "document",
    pageNumber: c.page_number,
    similarity: c.similarity,
    excerpt: c.content
      ? c.content.slice(0, 240).replace(/\s+/g, " ").trim() + (c.content.length > 240 ? "..." : "")
      : undefined,
  }));

  return {
    isComparison: true,
    answer: synthesisText,
    sources: mappedSources,
    missingSources: [],
  };
}
