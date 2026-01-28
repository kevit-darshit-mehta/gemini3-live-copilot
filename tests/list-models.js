import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";

config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    const modelResponse = await genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    }); // Just to init? No, need ModelManager
    // Actually the SDK doesn't expose listModels efficiently in the main class?
    // Let's use REST for clarity

    const key = process.env.GEMINI_API_KEY;
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
