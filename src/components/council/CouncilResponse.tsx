import React from "react";
import { FileTextIcon } from "../icons";
import { MarkdownRenderer, renderInlineMarkdown, cleanListItemText } from "../common/MarkdownRenderer";

export interface PerspectiveDetails {
  summary: string;
  points: string[];
  caveats?: string[];
}

export interface CitationItem {
  source: string;
  pageNumber: number | null;
  snippet?: string;
}

export interface CouncilResultData {
  isFastPath?: boolean;
  routing?: "fast_path" | "financial_council";
  citations?: CitationItem[];
  optimistPerspective?: string;
  pessimistPerspective?: string;
  optimistDetails?: PerspectiveDetails;
  pessimistDetails?: PerspectiveDetails;
  optimistModel?: string;
  pessimistModel?: string;
  judgeAssessment?: {
    verdict?: string;
    balancedAssessment?: string;
    benefits?: string[];
    risks?: string[];
    assumptions?: string[];
    verificationSteps?: string[];
    evidence?: Array<{ fact?: string; source?: string }>;
    missingInformation?: string[];
  };
  sources?: string[];
  error?: string;
  metrics?: {
    retrievalDurationMs?: number;
    optimistDurationMs?: number;
    pessimistDurationMs?: number;
    judgeDurationMs?: number;
    totalDurationMs?: number;
  };
}

interface CouncilResponseProps {
  result: CouncilResultData;
  content?: string;
}

/**
 * Deduplicates and extracts clean citations from result data.
 * Ensures the main answer is never duplicated in citation snippets.
 */
function extractDeduplicatedCitations(
  result: CouncilResultData,
  mainAnswerText: string
): Array<{ source: string; pageNumber: string | null; snippet?: string }> {
  const citations: Array<{ source: string; pageNumber: string | null; snippet?: string }> = [];
  const seen = new Set<string>();

  // 1. First priority: structured citations field
  if (result.citations && result.citations.length > 0) {
    for (const c of result.citations) {
      if (!c.source) continue;
      const pageStr = c.pageNumber !== null ? String(c.pageNumber) : null;
      const key = `${c.source}#${pageStr || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        citations.push({
          source: c.source,
          pageNumber: pageStr,
          snippet: c.snippet && c.snippet !== mainAnswerText ? c.snippet : undefined,
        });
      }
    }
    return citations;
  }

  // 2. Second priority: judge evidence array
  if (result.judgeAssessment?.evidence && result.judgeAssessment.evidence.length > 0) {
    for (const e of result.judgeAssessment.evidence) {
      if (!e.source) continue;
      // Extract page number if present in "doc.pdf (Page X)"
      const pageMatch = e.source.match(/\(Page\s+(\d+)\)/i);
      const cleanSource = e.source.replace(/\s*\(Page\s+\d+\)/i, "").trim();
      const pageNum = pageMatch ? pageMatch[1] : null;

      const key = `${cleanSource}#${pageNum || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        const snippet =
          e.fact && e.fact.trim() !== mainAnswerText.trim() && !e.fact.startsWith("[RETRIEVAL_ERROR")
            ? e.fact
            : undefined;
        citations.push({
          source: cleanSource,
          pageNumber: pageNum,
          snippet,
        });
      }
    }
    return citations;
  }

  // 3. Fallback: string sources array
  if (result.sources && result.sources.length > 0) {
    for (const s of result.sources) {
      if (!s) continue;
      if (!seen.has(s)) {
        seen.add(s);
        citations.push({ source: s, pageNumber: null });
      }
    }
  }

  return citations;
}

export function CouncilResponse({ result, content }: CouncilResponseProps) {
  if (!result || typeof result !== "object") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No council analysis details available.
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // A. FAST-PATH GROUNDED DOCUMENT ANSWER
  // ---------------------------------------------------------------------------
  if (result.isFastPath) {
    const mainAnswer =
      result.judgeAssessment?.balancedAssessment || content || "No answer generated.";
    const citations = extractDeduplicatedCitations(result, mainAnswer);

    return (
      <div className="flex flex-col gap-4 text-sm mt-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs relative overflow-hidden">
          {/* Subtle top accent */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />

          <div className="p-5 md:p-6">
            {/* Header Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                  <FileTextIcon width={16} height={16} />
                </div>
                <div>
                  <h4 className="text-slate-900 font-semibold text-base leading-tight">
                    Grounded Document Extract
                  </h4>
                  <p className="text-xs text-slate-500">
                    Direct retrieval from authorized financial knowledge base
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Direct RAG (Fast Path)
              </span>
            </div>

            {/* Main Answer - Rendered with Rich Markdown ONCE */}
            <div className="text-slate-800 leading-relaxed font-normal">
              <MarkdownRenderer content={mainAnswer} />
            </div>

            {/* Deduplicated Source Citations */}
            {citations.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100">
                <h5 className="font-semibold text-slate-500 uppercase tracking-wider text-xs mb-3 flex items-center gap-2">
                  <FileTextIcon width={14} height={14} /> Verified Document Citations
                </h5>
                <div className="grid grid-cols-1 gap-2.5">
                  {citations.map((c, i) => (
                    <div
                      key={i}
                      className="bg-slate-50/80 rounded-lg p-3 border border-slate-200/60 text-xs flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 truncate">{c.source}</span>
                        {c.pageNumber && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100/70 text-emerald-800 text-[11px] font-medium shrink-0">
                            Page {c.pageNumber}
                          </span>
                        )}
                      </div>
                      {c.snippet && (
                        <p className="text-slate-600 italic text-[11px] mt-0.5 border-l-2 border-emerald-300 pl-2">
                          &ldquo;{c.snippet}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fast Path Execution Duration */}
            {result.metrics?.retrievalDurationMs && (
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex justify-end">
                <span>Retrieved in {result.metrics.retrievalDurationMs}ms</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // B. FULL FINANCIAL COUNCIL ANALYSIS
  // ---------------------------------------------------------------------------
  const hasOptimist = Boolean(result.optimistDetails || result.optimistPerspective);
  const hasPessimist = Boolean(result.pessimistDetails || result.pessimistPerspective);
  const hasJudge = Boolean(result.judgeAssessment?.balancedAssessment);

  const mainJudgeText = result.judgeAssessment?.balancedAssessment || "";
  const citations = extractDeduplicatedCitations(result, mainJudgeText);

  // Clean verdict display: truncate gracefully if needed but prevent undefined
  const rawVerdict = result.judgeAssessment?.verdict;
  const cleanVerdict =
    rawVerdict && rawVerdict.trim() !== ""
      ? rawVerdict.length > 50
        ? `${rawVerdict.slice(0, 48)}...`
        : rawVerdict
      : "Consensus Assessment";

  return (
    <div className="flex flex-col gap-4 text-sm mt-2">
      {/* Partial / Warning Banner */}
      {result.error && (
        <div className="rounded-lg bg-amber-50 p-4 border border-amber-200 text-amber-800 shadow-xs">
          <p className="font-medium flex items-center gap-2">
            <span className="text-lg">⚠️</span> Council Advisory Note
          </p>
          <p className="mt-1 opacity-90 text-xs leading-relaxed">{result.error}</p>
        </div>
      )}

      {/* Perspectives Grid (Optimist & Pessimist) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Optimist Perspective */}
        {hasOptimist ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <h4 className="text-emerald-800 font-semibold mb-2 flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold">
                  ↑
                </span>
                Optimist Perspective
              </h4>

              <div className="text-emerald-950/85 leading-relaxed font-normal mb-3 text-sm">
                <MarkdownRenderer
                  content={result.optimistDetails?.summary || result.optimistPerspective || ""}
                />
              </div>

              {result.optimistDetails && result.optimistDetails.points?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-emerald-100/80">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1.5">
                    Opportunities & Upside
                  </h5>
                  <ul className="space-y-1">
                    {result.optimistDetails.points.map((pt, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-xs text-emerald-900/80">
                        <span className="text-emerald-600 mt-0.5">•</span>
                        <span>{renderInlineMarkdown(cleanListItemText(pt))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.optimistDetails &&
                result.optimistDetails.caveats &&
                result.optimistDetails.caveats.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-emerald-100/60">
                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80 mb-1">
                      Key Considerations
                    </h5>
                    <ul className="space-y-1">
                      {result.optimistDetails.caveats.map((c, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-emerald-800/70 italic">
                          <span>—</span>
                          <span>{renderInlineMarkdown(cleanListItemText(c))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </div>
        ) : (
          /* Honest Partial Failure Placeholder for Optimist */
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-xs flex flex-col justify-center text-center">
            <h4 className="text-slate-600 font-semibold mb-1 flex items-center justify-center gap-2">
              <span className="text-slate-400 font-bold">↑</span>
              Optimist Perspective Unavailable
            </h4>
            <p className="text-slate-500 text-xs">
              The Optimist agent was unable to complete upside analysis.
            </p>
          </div>
        )}

        {/* Pessimist Perspective */}
        {hasPessimist ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <h4 className="text-rose-800 font-semibold mb-2 flex items-center gap-2">
                <span className="bg-rose-100 text-rose-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold">
                  ↓
                </span>
                Pessimist Perspective
              </h4>

              <div className="text-rose-950/85 leading-relaxed font-normal mb-3 text-sm">
                <MarkdownRenderer
                  content={result.pessimistDetails?.summary || result.pessimistPerspective || ""}
                />
              </div>

              {result.pessimistDetails && result.pessimistDetails.points?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-rose-100/80">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-rose-800 mb-1.5">
                    Downside Scenarios & Risks
                  </h5>
                  <ul className="space-y-1">
                    {result.pessimistDetails.points.map((pt, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-xs text-rose-900/80">
                        <span className="text-rose-600 mt-0.5">•</span>
                        <span>{renderInlineMarkdown(cleanListItemText(pt))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.pessimistDetails &&
                result.pessimistDetails.caveats &&
                result.pessimistDetails.caveats.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-rose-100/60">
                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-rose-700/80 mb-1">
                      Unverified Details / Unknowns
                    </h5>
                    <ul className="space-y-1">
                      {result.pessimistDetails.caveats.map((c, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-rose-800/70 italic">
                          <span>—</span>
                          <span>{renderInlineMarkdown(cleanListItemText(c))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </div>
        ) : (
          /* Honest Partial Failure Placeholder for Pessimist */
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-xs flex flex-col justify-center text-center">
            <h4 className="text-slate-600 font-semibold mb-1 flex items-center justify-center gap-2">
              <span className="text-slate-400 font-bold">↓</span>
              Pessimist Perspective Unavailable
            </h4>
            <p className="text-slate-500 text-xs">
              The Pessimist agent was unable to complete risk analysis.
            </p>
          </div>
        )}
      </div>

      {/* Financial Council Verdict (Judge) */}
      {hasJudge ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs relative overflow-hidden mt-2">
          {/* Top Accent Gradient */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-rose-500" />

          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h4 className="text-slate-900 font-bold text-lg">Financial Council Verdict</h4>
            <span
              title={result.judgeAssessment?.verdict}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 max-w-full truncate"
            >
              {cleanVerdict}
            </span>
          </div>

          {/* Balanced Assessment with Markdown rendering */}
          <div className="text-slate-800 leading-relaxed font-normal mb-6 bg-slate-50/70 p-4 rounded-lg border border-slate-100">
            <MarkdownRenderer content={result.judgeAssessment?.balancedAssessment || ""} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            {/* Verified Benefits */}
            {result.judgeAssessment?.benefits && result.judgeAssessment.benefits.length > 0 && (
              <div>
                <h5 className="font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
                  <span>✓</span> Supported Potential Benefits
                </h5>
                <ul className="space-y-1.5">
                  {result.judgeAssessment.benefits.map((b: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-slate-600">
                      <span className="text-emerald-500 mt-0.5 font-bold">•</span>
                      <span>{renderInlineMarkdown(cleanListItemText(b))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Verified Risks */}
            {result.judgeAssessment?.risks && result.judgeAssessment.risks.length > 0 && (
              <div>
                <h5 className="font-semibold text-rose-700 mb-2 flex items-center gap-1.5">
                  <span>⚠</span> Supported Key Risks
                </h5>
                <ul className="space-y-1.5">
                  {result.judgeAssessment.risks.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-slate-600">
                      <span className="text-rose-500 mt-0.5 font-bold">•</span>
                      <span>{renderInlineMarkdown(cleanListItemText(r))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Assumptions */}
            {result.judgeAssessment?.assumptions &&
              result.judgeAssessment.assumptions.length > 0 && (
                <div className="md:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <h5 className="font-semibold text-slate-700 mb-2 text-xs uppercase tracking-wider">
                    Key Assumptions Made
                  </h5>
                  <ul className="space-y-1 text-slate-600 text-xs">
                    {result.judgeAssessment.assumptions.map((a: string, i: number) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-slate-400">-</span>
                        <span>{renderInlineMarkdown(cleanListItemText(a))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Verification Steps */}
            {result.judgeAssessment?.verificationSteps &&
              result.judgeAssessment.verificationSteps.length > 0 && (
                <div className="md:col-span-2">
                  <h5 className="font-semibold text-indigo-700 mb-2 flex items-center gap-1.5">
                    <span>→</span> Recommended Next Steps & Verification
                  </h5>
                  <ul className="space-y-1.5">
                    {result.judgeAssessment.verificationSteps.map((v: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-slate-600">
                        <span className="text-indigo-400 mt-0.5">→</span>
                        <span>{renderInlineMarkdown(cleanListItemText(v))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>

          {/* Deduplicated Knowledge Base References */}
          {citations.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <h5 className="font-semibold text-slate-500 uppercase tracking-wider text-xs mb-3 flex items-center gap-2">
                <FileTextIcon width={14} height={14} /> Knowledge Base References
              </h5>
              <div className="grid grid-cols-1 gap-2.5">
                {citations.map((c, i) => (
                  <div
                    key={i}
                    className="bg-slate-50 rounded-lg p-3 border border-slate-200/60 text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{c.source}</span>
                      {c.pageNumber && (
                        <span className="px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 text-[11px] font-medium">
                          Page {c.pageNumber}
                        </span>
                      )}
                    </div>
                    {c.snippet && (
                      <p className="text-slate-600 italic text-[11px] mt-0.5 border-l-2 border-slate-300 pl-2">
                        &ldquo;{c.snippet}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latency Metrics */}
          {result.metrics?.totalDurationMs && (
            <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex flex-wrap gap-4 justify-end">
              <span>Total: {result.metrics.totalDurationMs}ms</span>
              {result.metrics.optimistDurationMs && (
                <span>Agents (Parallel): {result.metrics.optimistDurationMs}ms</span>
              )}
              {result.metrics.judgeDurationMs && (
                <span>Judge: {result.metrics.judgeDurationMs}ms</span>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Honest Fallback if Judge failed */
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 text-center mt-2">
          <h4 className="text-amber-800 font-semibold mb-1">Council Verdict Unavailable</h4>
          <p className="text-amber-700/80 text-xs">
            The Judge was unable to formulate a unified consensus. Please review the individual
            perspectives above.
          </p>
        </div>
      )}
    </div>
  );
}
