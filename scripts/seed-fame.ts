import path from "node:path";
import { ingestPdf } from "../src/lib/rag/ingestPdf";
import { createClient } from "@supabase/supabase-js";
import "../src/mastra/env-loader";

async function main() {
  console.log("Seeding RBI FAME reference document into Supabase...");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const filePath = path.join(process.cwd(), "data", "FAME30072020.pdf");

  try {
    const result = await ingestPdf(filePath, "RBI FAME", undefined, "shared", {
      customClient: adminClient,
    });
    console.log("Seeding complete:", result);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

main();
