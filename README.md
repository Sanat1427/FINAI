# FinAI — Multi-Agent Financial Council & Knowledge Platform

FinAI is a production-grade financial education and decision-copilot platform built with **Next.js 16**, **React 19**, **Mastra**, **Supabase (pgvector)**, **Google Gemini**, and **Groq Cloud**.

Instead of relying on a single conversational model for complex personal finance queries, FinAI introduces a **Multi-Agent Financial Council** alongside deterministic math calculators and grounded Retrieval-Augmented Generation (RAG).

---

## Key Features

- **Multi-Agent Financial Council:**
  - **The Optimist:** Evaluates positive upside, financial opportunities, and reasonable borrowing use cases strictly grounded in retrieved evidence.
  - **The Pessimist:** Evaluates debt burdens, liquidity constraints, repayment risks, and hidden fee clauses.
  - **The Judge:** An independent synthesis agent that reconciles both perspectives, separates factual document claims from deterministic calculations and economic principles, and produces a structured verdict.
- **Deterministic Financial Calculators:**
  - Dedicated deterministic mathematical engines for **EMI (Equated Monthly Installment)**, **Simple Interest**, and **Compound Interest** to prevent LLM arithmetic hallucination.
- **Grounded Document RAG with pgvector:**
  - Upload loan agreements, Key Fact Statements (KFS), terms and conditions, or regulatory booklets (such as RBI FAME).
  - Semantic vector search powered by Google `text-embedding-004` (768 dimensions) and PostgreSQL `pgvector`.
  - Multi-document comparative queries with page-level citations.
- **Resilient Multi-Provider Fallback & Circuit Breaker:**
  - In-memory circuit breaker that detects Gemini 429 quota exhaustion (`RESOURCE_EXHAUSTED`).
  - Differentiates daily quota exhaustion (1-hour cooldown) from transient rate limits (60-second cooldown).
  - Fast-paths directly to Groq (`qwen/qwen3.8-27b`) when quota is exhausted, eliminating 8–15s network timeout and retry penalties.
- **Enterprise Security & Isolation:**
  - Supabase Row Level Security (RLS) ensures private user documents are strictly isolated across tenants.
  - Route-level authentication checks on all API endpoints for defense-in-depth.

---

## Architecture & Technology Stack

```text
[ Next.js 16 App Router (React 19 / Tailwind CSS) ]
                   │
                   ▼
  [ Intent Classification & Router ]
        │                       │
        ▼                       ▼
  [ Fast-Path RAG ]     [ Financial Council Orchestrator ]
        │                       │
        │           ┌───────────┴───────────┐
        │           ▼                       ▼
        │     Optimist Agent          Pessimist Agent
        │     (Parallel)              (Parallel)
        │           │                       │
        │           └───────────┬───────────┘
        │                       ▼
        │                 Judge Agent
        │             (Structured Zod JSON)
        │                       │
        ▼                       ▼
[ Supabase pgvector ]   [ Provider Fallback / Quota Circuit Breaker ]
(PostgreSQL + RLS)        - Primary: Google Gemini 3.5 Flash
                          - Fast Fallback: Groq (qwen3.8-27b)
```

- **Frontend / Fullstack:** Next.js 16 (Turbopack, App Router), React 19, Tailwind CSS
- **Multi-Agent Framework:** Mastra (`@mastra/core`)
- **LLM Providers:** Google Gemini API (`gemini-3.5-flash`), Groq Cloud API (`qwen/qwen3.8-27b`)
- **Embeddings:** Google Gemini `text-embedding-004` (768 dimensions)
- **Database & Auth:** Supabase (PostgreSQL with `pgvector`, Row Level Security, Auth)
- **Validation:** Zod 4
- **Testing:** Vitest

---

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- A Supabase account with a PostgreSQL database
- A Google Gemini API Key
- A Groq Cloud API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/fin-ai.git
   cd fin-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and fill in your actual credentials.

---

## Environment Variables

| Variable | Description | Required |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API key for embeddings and primary LLM generation | Yes |
| `GROQ_API_KEY` | Groq Cloud API key for direct fallback and fast inference (`qwen/qwen3.8-27b`) | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g., `https://xyz.supabase.co`) | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anonymous API key (JWT) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret key (for server administration and migrations) | Yes |

*See [.env.example](file:///.env.example) for placeholder values.*

---

## Database & Supabase Setup

Execute the following SQL in the **Supabase SQL Editor** to configure pgvector, tables, and RLS policies:

```sql
-- 1. Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    page_count INTEGER DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Document chunks table
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES public.documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(768),
    page_number INTEGER,
    source TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- 5. Documents RLS Policies
CREATE POLICY "Users can view own documents or shared documents"
ON public.documents FOR SELECT
USING (auth.uid() = owner_id OR visibility = 'shared');

CREATE POLICY "Users can insert own documents"
ON public.documents FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own documents"
ON public.documents FOR DELETE
USING (auth.uid() = owner_id);

-- 6. Document Chunks RLS Policies (enforced via parent document ownership)
CREATE POLICY "Users can view chunks of accessible documents"
ON public.document_chunks FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.id = document_chunks.document_id
        AND (d.owner_id = auth.uid() OR d.visibility = 'shared')
    )
);

CREATE POLICY "Users can insert chunks into own documents"
ON public.document_chunks FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.id = document_chunks.document_id
        AND d.owner_id = auth.uid()
    )
);

-- 7. Vector Similarity Search Function
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR(768),
    match_count INTEGER DEFAULT 5,
    similarity_threshold FLOAT DEFAULT 0.48,
    filter_source TEXT DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    content TEXT,
    metadata JSONB,
    page_number INTEGER,
    source TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.content,
        dc.metadata,
        dc.page_number,
        dc.source,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM public.document_chunks dc
    INNER JOIN public.documents d ON d.id = dc.document_id
    WHERE (d.owner_id = auth.uid() OR d.visibility = 'shared')
      AND (filter_source IS NULL OR dc.source = filter_source)
      AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

---

## Development & Testing Commands

```bash
# Run Next.js local development server
npm run dev

# Run automated unit & integration test suite (Vitest)
npm run test:unit

# Run TypeScript typecheck (tsc --noEmit)
npm run typecheck

# Run ESLint validation
npm run lint

# Run production build (Next.js with Turbopack)
npm run build

# Start production server
npm run start
```

### Developer Scripts

Useful non-production utility scripts are located in `scripts/`:

```bash
# Verify Gemini & Groq model connectivity and tool capabilities
npx tsx scripts/check-models.ts

# Seed the RBI Financial Awareness Messages (FAME) reference document
npx tsx scripts/seed-fame.ts

# Run the Council latency and circuit-breaker benchmark
npx tsx scripts/benchmark-council.ts

# Run partial failure handling simulation
npx tsx scripts/test-partial-failure.ts

# Run single-turn assistant test scenarios
npx tsx scripts/test-assistant.ts
```

---

## Deployment & Known Limitations

### Deployment

FinAI can be deployed to any platform supporting Next.js 16 Node.js runtimes:
- **Vercel:** Connect your GitHub repository, configure environment variables in project settings, and deploy.
- **Docker / Self-Hosted Node.js:** Build the production bundle via `npm run build` and run `npm run start`.

### Known Limitations

1. **Process-Local Circuit Breaker:**
   The Gemini quota circuit breaker is stored in Node.js module-level memory. In multi-instance or serverless environments, state is isolated to each worker process and resets when an instance restarts. For distributed cross-worker synchronization at high scale, an external Redis cache can be plugged into `src/lib/ai/quota-tracker.ts`.
2. **Groq Model Context Limits:**
   Groq fallback uses `qwen/qwen3.8-27b`, which enforces rate limits and context window boundaries. Large multi-document prompts are automatically truncated and deduplicated by the orchestrator prior to invocation.

---

## License

This project is licensed under the MIT License.
