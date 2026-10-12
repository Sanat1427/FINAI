"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";

interface Document {
  id: number;
  name: string;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);

  async function refreshDocuments() {
    try {
      const response = await fetch("/api/documents");
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Failed to load documents:", error);
    }
  }

  useEffect(() => {
    let ignore = false;
    fetch("/api/documents")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          setDocuments(data.documents || []);
        }
      })
      .catch((error) => {
        console.error("Failed to load documents:", error);
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function uploadFile() {
    if (!file) {
      setMessage("Please select a PDF.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/upload-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Upload failed");
        return;
      }

      setMessage(
        `Success! ${data.fileName} — ${data.pages} pages, ${data.chunks} chunks`
      );

      setFile(null);

      await refreshDocuments();
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteDocument(document: Document) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${document.name}"?`
    );

    if (!confirmed) return;

    setDeleting(document.id);
    setMessage("");

    try {
      const response = await fetch(
        `/api/documents/${document.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Failed to delete document.");
        return;
      }

      setMessage(`Deleted ${document.name} successfully.`);

      await refreshDocuments();
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong while deleting.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
        <div className="mx-auto max-w-xl rounded-xl bg-white p-8 shadow">

          <h1 className="mb-6 text-2xl font-bold">
          Upload Financial PDF
        </h1>

        {/* Upload */}
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
          }}
          className="mb-4 block w-full"
        />

        <button
          onClick={uploadFile}
          disabled={loading}
          className="rounded-lg bg-black px-5 py-3 text-white disabled:opacity-50"
        >
          {loading ? "Uploading..." : "Upload PDF"}
        </button>

        {/* Message */}
        {message && (
          <p className="mt-4">
            {message}
          </p>
        )}

        {/* Documents */}
        <div className="mt-8">

          <h2 className="mb-3 text-lg font-semibold">
            Uploaded Documents
          </h2>

          {documents.length === 0 ? (
            <p className="text-gray-500">
              No documents uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">

              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between rounded-lg border bg-gray-50 p-3"
                >
                  <span>
                    📄 {document.name}
                  </span>

                  <button
                    onClick={() => deleteDocument(document)}
                    disabled={deleting === document.id}
                    className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting === document.id
                      ? "Deleting..."
                      : "Delete"}
                  </button>
                </div>
              ))}

            </div>
          )}

        </div>
      </div>
      </div>
    </AppShell>
  );
}