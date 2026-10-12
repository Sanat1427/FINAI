"use client";

import { useEffect, useState, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CouncilResponse, CouncilResultData } from "@/components/council/CouncilResponse";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { SendIcon } from "@/components/icons";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  councilResult?: CouncilResultData;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [documents, setDocuments] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadDocuments() {
      try {
        const response = await fetch("/api/documents");
        const data = await response.json();
        setDocuments(data.documents || []);
      } catch (error) {
        console.error("Failed to load documents:", error);
      }
    }
    loadDocuments();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          source: selectedSource || undefined,
        }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.reply || data.error || "No reply generated.",
        sources: data.councilResult?.sources || data.sources,
        councilResult: data.councilResult,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong communicating with the Financial Council. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <AppShell onNewChat={() => setMessages([])}>
        <div className="flex flex-col h-full bg-white relative">
          
          {/* Header Controls */}
          <div className="flex-none p-4 border-b border-slate-100 flex items-center justify-between bg-white z-10 hidden md:flex">
            <h2 className="text-lg font-semibold text-slate-800">Financial Council</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Knowledge Source:</span>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="text-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">All Documents</option>
                {documents.map((document) => (
                  <option key={document.id} value={document.name}>
                    {document.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 text-emerald-600 text-3xl">
                  ⚖️
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to FinAI</h2>
                <p className="text-slate-500 mb-8">
                  Your personal Financial Council. I&apos;ll analyze your financial queries from both optimistic and pessimistic perspectives before providing a balanced verdict.
                </p>
                <div className="grid grid-cols-1 gap-3 w-full text-left">
                  <button 
                    onClick={() => setInput("What is the EMI for a ₹5 lakh loan at 9% for 5 years, and what repayment risks should be considered?")}
                    className="p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-sm text-slate-700 font-medium"
                  >
                    &ldquo;What is the EMI for a ₹5 lakh loan at 9% for 5 years, and what repayment risks should be considered?&rdquo;
                  </button>
                  <button 
                    onClick={() => setInput("What does RBI say about responsible borrowing?")}
                    className="p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-sm text-slate-700 font-medium"
                  >
                    &ldquo;What does RBI say about responsible borrowing?&rdquo;
                  </button>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div 
                    className={`max-w-[95%] md:max-w-[85%] ${
                      message.role === "user"
                        ? "bg-slate-900 text-white rounded-2xl rounded-tr-sm px-5 py-3.5"
                        : "w-full"
                    }`}
                  >
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <div className="w-full">
                        {!message.councilResult && (
                          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-5 shadow-sm text-slate-800 leading-relaxed">
                            <MarkdownRenderer content={message.content} />
                            
                            {/* Fallback Legacy Sources */}
                            {message.sources && message.sources.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                                <p className="font-semibold mb-1">Sources:</p>
                                {message.sources.map((source: unknown, i) => (
                                  <div key={i} className="text-slate-600">
                                    {typeof source === "string"
                                      ? source
                                      : typeof source === "object" && source !== null && "source" in source
                                      ? `${(source as { source: string; pageNumber?: number }).source}${(source as { pageNumber?: number }).pageNumber ? ` — Page ${(source as { pageNumber?: number }).pageNumber}` : ""}`
                                      : String(source)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {message.councilResult && (
                          <CouncilResponse result={message.councilResult} content={message.content} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex w-full justify-start">
                <div className="flex gap-2 p-4 bg-slate-50 rounded-2xl rounded-tl-sm border border-slate-100 items-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }}></div>
                  <span className="ml-2 text-sm text-slate-500 font-medium">The Council is analyzing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-slate-100">
            <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400 transition-all shadow-sm">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the Financial Council..."
                className="w-full max-h-32 min-h-[44px] bg-transparent resize-none outline-none px-3 py-2.5 text-slate-900 placeholder:text-slate-400 text-sm"
                rows={input.split('\\n').length > 1 ? Math.min(input.split('\\n').length, 5) : 1}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="flex-none w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700 transition-colors mb-0.5 mr-0.5"
              >
                <SendIcon width={18} height={18} />
              </button>
            </div>
            <div className="text-center mt-2">
              <span className="text-[10px] text-slate-400">FinAI Council may produce inaccurate results. Verify important information.</span>
            </div>
          </div>

        </div>
    </AppShell>
  );
}