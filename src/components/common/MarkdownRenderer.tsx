import React from "react";

export interface MarkdownBlock {
  type: "heading" | "ul" | "ol" | "paragraph";
  level?: number;
  items?: string[];
  text?: string;
}

/**
 * Decodes numeric and named HTML entities (e.g. &#x55; -> 'U', &#85; -> 'U', &amp; -> '&')
 */
export function decodeHtmlEntities(text?: string): string {
  if (!text || typeof text !== "string") return "";

  return text
    // Hex numeric entities: &#x55; -> U
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return _;
      }
    })
    // Decimal numeric entities: &#85; -> U
    .replace(/&#([0-9]+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return _;
      }
    })
    // Standard named entities
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * Normalizes and strips leading malformed list markers (such as **•**, *•*, •, -, *)
 */
export function cleanListItemText(text?: string): string {
  if (!text || typeof text !== "string") return "";
  const decoded = decodeHtmlEntities(text);
  return decoded
    .replace(/^\s*(\*\*•\*\*|\*•\*|\*\*-\*\*|•|[*–-])\s*/, "")
    .replace(/\*\*•\*\*/g, "•")
    .replace(/\*•\*/g, "•")
    .trim();
}

const BULLET_LINE_REGEX = /^\s*(\*\*•\*\*|\*•\*|\*\*-\*\*|[-*•])\s+/;

/**
 * Tokenizes and parses a markdown string into structured blocks for safe React rendering.
 */
export function parseMarkdownToBlocks(content: string): MarkdownBlock[] {
  if (!content || typeof content !== "string") return [];

  const decoded = decodeHtmlEntities(content);
  const normalized = decoded.replace(/\r\n/g, "\n");
  const rawBlocks = normalized.split(/\n{2,}/);
  const blocks: MarkdownBlock[] = [];

  for (const raw of rawBlocks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Check for Headings: # Heading, ## Heading, ### Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);

    // Check for Unordered List (- item, * item, • item, **•** item)
    const isUl = lines.every((line) => BULLET_LINE_REGEX.test(line));
    if (isUl && lines.length > 0) {
      blocks.push({
        type: "ul",
        items: lines.map((l) => cleanListItemText(l.replace(BULLET_LINE_REGEX, ""))),
      });
      continue;
    }

    // Check for Ordered List (1. item, 2. item)
    const isOl = lines.every((line) => /^\d+\.\s+/.test(line));
    if (isOl && lines.length > 0) {
      blocks.push({
        type: "ol",
        items: lines.map((l) => decodeHtmlEntities(l.replace(/^\d+\.\s+/, "").trim())),
      });
      continue;
    }

    // Regular Paragraph
    blocks.push({
      type: "paragraph",
      text: trimmed.replace(/\*\*•\*\*/g, "•").replace(/\*•\*/g, "•"),
    });
  }

  return blocks;
}

/**
 * Parses inline markdown: **bold**, *italic*, and `code`
 */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const decoded = decodeHtmlEntities(text);
  const normalized = decoded.replace(/\*\*•\*\*/g, "•").replace(/\*•\*/g, "•");

  // Match bold (**text** or __text__), inline code (`code`), or italic (*text* or _text_)
  const regex = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  const parts = normalized.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Bold: **text** or __text__
    if ((part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
        (part.startsWith("__") && part.endsWith("__") && part.length >= 4)) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Inline Code: `code`
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs text-slate-800 border border-slate-200/60"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Italic: *text* or _text_
    if ((part.startsWith("*") && part.endsWith("*") && part.length >= 2) ||
        (part.startsWith("_") && part.endsWith("_") && part.length >= 2)) {
      return (
        <em key={index} className="italic text-slate-800">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Handle single newlines inside paragraph with <br />
    if (part.includes("\n")) {
      const lineBreaks = part.split("\n");
      return lineBreaks.map((sub, i) => (
        <React.Fragment key={`${index}-${i}`}>
          {sub}
          {i < lineBreaks.length - 1 && <br />}
        </React.Fragment>
      ));
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  if (!content) return null;

  const blocks = parseMarkdownToBlocks(content);

  return (
    <div className={`space-y-3 ${className}`}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const headingClasses =
            block.level === 1
              ? "text-lg font-bold text-slate-900 mt-4 mb-2"
              : block.level === 2
              ? "text-base font-bold text-slate-900 mt-3 mb-1.5"
              : "text-sm font-semibold text-slate-900 mt-2.5 mb-1";
          return (
            <div key={index} className={headingClasses}>
              {renderInlineMarkdown(block.text || "")}
            </div>
          );
        }

        if (block.type === "ul" && block.items) {
          return (
            <ul key={index} className="space-y-1.5 my-2 pl-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2 text-slate-700 leading-relaxed text-sm">
                  <span className="text-emerald-500 font-bold mt-1 text-xs">•</span>
                  <span>{renderInlineMarkdown(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "ol" && block.items) {
          return (
            <ol key={index} className="space-y-1.5 my-2 pl-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2 text-slate-700 leading-relaxed text-sm">
                  <span className="text-slate-500 font-semibold text-xs mt-0.5 min-w-[16px]">
                    {itemIdx + 1}.
                  </span>
                  <span>{renderInlineMarkdown(item)}</span>
                </li>
              ))}
            </ol>
          );
        }

        // Paragraph
        return (
          <p key={index} className="text-slate-700 leading-relaxed text-sm">
            {renderInlineMarkdown(block.text || "")}
          </p>
        );
      })}
    </div>
  );
}
