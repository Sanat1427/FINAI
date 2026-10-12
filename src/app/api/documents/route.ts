import { createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("documents")
      .select("id, name")
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      documents: data ?? [],
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: "Failed to fetch documents",
      },
      { status: 500 }
    );
  }
}