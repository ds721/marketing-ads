import { config } from "dotenv";
config({ quiet: true });

// Tests never touch a paid provider, whatever .env says. The stub is
// deterministic; the real provider costs money and returns different words
// every run.
process.env.AI_PROVIDER = "mock";
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;

process.env.APP_ENCRYPTION_KEY ??= "0".repeat(64);
