import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ingestPdf } from "@/lib/rag/ingestPdf";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        { error: "PDF file is required" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return Response.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();

    const buffer = Buffer.from(bytes);

    const originalName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileName = `${Date.now()}-${originalName}`;

    const filePath = path.join(
      process.cwd(),
      "data",
      fileName
    );

    await writeFile(filePath, buffer);

    const result = await ingestPdf(
      filePath,
      fileName,
      user.id
    );

    return Response.json({
      success: true,
      fileName,
      ...result,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        success: false,
        error: "PDF upload failed",
      },
      { status: 500 }
    );
  }
}