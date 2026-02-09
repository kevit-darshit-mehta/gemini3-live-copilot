import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from apps/api directory
config({ path: join(__dirname, "../apps/api/.env") });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    const key = process.env.GEMINI_API_KEY;
    
    if (!key) {
      console.error("❌ Error: GEMINI_API_KEY not found in environment variables");
      console.log("\nPlease set your API key:");
      console.log("  1. Create a .env file in the project root");
      console.log("  2. Add: GEMINI_API_KEY=your_api_key_here");
      process.exit(1);
    }

    console.log("Checking models for key ending in...", key.slice(-4));

    // Using fetch
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
    );
    const data = await response.json();

    if (data.models) {
      console.log("Available Models:");
      data.models.forEach((m) => {
        if (m.name.includes("gemini")) {
          console.log(
            `- ${m.name} (${m.supportedGenerationMethods.join(", ")})`,
          );
        }
      });
    } else {
      console.error("Error listing models:", data);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

listModels();
