import { answerWithRAG } from "@/lib/rag/rag";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, history = [], source } = await req.json();

    if (!message || typeof message !== "string") {
      return Response.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const result = await answerWithRAG(message, history, source, supabase);

    return Response.json(result);
  } catch (error) {
    console.error("RAG Error:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "RAG request failed",
      },
      { status: 500 }
    );
  }
}