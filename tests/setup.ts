import { config } from "dotenv";
config();

process.env.APP_ENCRYPTION_KEY ??= "0".repeat(64);
process.env.AI_PROVIDER ??= "mock";
