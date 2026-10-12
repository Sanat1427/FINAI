import { createClient } from "@/utils/supabase/server";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const documentId = Number(id);

    if (!Number.isInteger(documentId)) {
      return Response.json(
        { error: "Invalid document ID" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("owner_id", user.id);

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete document",
      },
      { status: 500 }
    );
  }
}