import { answerAssistant } from "@/lib/ai/assistant";
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

    const result = await answerAssistant(message, history, source);

    return Response.json(result);
  } catch (error) {
    console.error("Assistant Error:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Assistant request failed",
      },
      { status: 500 }
    );
  }
}