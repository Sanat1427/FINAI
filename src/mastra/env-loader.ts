import fs from "fs";
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
if (!process.env.GOOGLE_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
}
if (!process.env.OPENAI_API_KEY && process.env.GROQ_API_KEY) {
  process.env.OPENAI_API_KEY = process.env.GROQ_API_KEY;
  process.env.OPENAI_BASE_URL = "https://api.groq.com/openai/v1";
}
