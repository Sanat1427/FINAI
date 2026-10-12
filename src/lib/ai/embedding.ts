import { GoogleGenAI } from "@google/genai";
import dns from "node:dns";
import { withRetry } from "@/lib/utils/retry";

// Fix for UND_ERR_CONNECT_TIMEOUT with IPv6 addresses
dns.setDefaultResultOrder("ipv4first");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "dummy-key",
});
export async function generateEmbedding(text:string){
    const response = await withRetry(() => ai.models.embedContent({
        model :"gemini-embedding-001",
        contents:text,
        config:{
            outputDimensionality:768,
        },
    }));
    return response.embeddings?.[0]?.values;
}