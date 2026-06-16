import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Initialize Google Gen AI if API key is present
const apiKey = process.env.GEMINI_API_KEY || process.env.CIRCLE_API_KEY; // Fallback to circle api key or similar if needed, or ask user to set it
let aiModel: any = null;

if (process.env.GEMINI_API_KEY) {
  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    aiModel = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
  } catch (e) {
    console.warn("Failed to initialize Google Gen AI:", e);
  }
}

export interface ExtractedIntent {
  intent: "CREATE_ESCROW" | "CREATE_PROPOSAL" | "DIRECT_SPEND" | "HELP" | "UNKNOWN";
  params: {
    amount?: number;
    recipient?: string;
    itemType?: "digital" | "physical";
    taskDescription?: string;
  };
}

/**
 * Parses natural language input to extract financial intents.
 */
export async function parseMessageIntent(text: string): Promise<ExtractedIntent> {
  const lowercaseText = text.toLowerCase();

  // 1. Check for Help commands first
  if (lowercaseText.includes("help") || lowercaseText === "/start" || lowercaseText.includes("info")) {
    return { intent: "HELP", params: {} };
  }

  // 2. Try Gemini AI parsing if available
  if (aiModel) {
    try {
      const prompt = `
        Analyze the following Telegram message and extract the user's intent and parameters.
        We have three main actions:
        1. CREATE_ESCROW: User wants to buy something from a seller, or setup an escrow. E.g., "buy a logo from @alice for 50 USDC" or "setup physical escrow for 100 USDC with @bob".
        2. CREATE_PROPOSAL: User wants to propose a group treasury pool spend. E.g., "propose to pay @charlie 100 USDC for server costs".
        3. DIRECT_SPEND: User wants to pay someone immediately from their daily limit. E.g., "pay @dave 5 USDC".

        Return ONLY a JSON object with this exact structure:
        {
          "intent": "CREATE_ESCROW" | "CREATE_PROPOSAL" | "DIRECT_SPEND" | "UNKNOWN",
          "params": {
            "amount": number (extracted USDC value),
            "recipient": string (username like "@alice" or address like "0x..."),
            "itemType": "digital" | "physical" (default to "digital" unless "in person", "physical", "meetup" is specified),
            "taskDescription": string (brief description of what is being bought/spent on)
          }
        }

        Message to parse: "${text}"
      `;

      const result = await aiModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.response.text();
      return JSON.parse(responseText.trim()) as ExtractedIntent;
    } catch (error) {
      console.error("Gemini parsing failed, falling back to rule-based parsing:", error);
    }
  }

  // 3. Fallback: Rule-based regex parser
  return ruleBasedParse(text);
}

function ruleBasedParse(text: string): ExtractedIntent {
  const lowercaseText = text.toLowerCase();

  // Pattern: pay/buy/escrow <amount> usdc (from/to/with) <recipient> (for) <description>
  // E.g., "buy logo from @alice for 50 usdc" or "pay @bob 10 usdc"
  
  // Extract amount
  const amountRegex = /(\d+(?:\.\d+)?)\s*(?:usdc|dollars|\$)/i;
  const amountMatch = text.match(amountRegex);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : undefined;

  // Extract recipient (Telegram username starting with @ or hex address)
  const recipientRegex = /(@\w+)|(0x[a-fA-F0-9]{40})/i;
  const recipientMatch = text.match(recipientRegex);
  const recipient = recipientMatch ? recipientMatch[0] : undefined;

  // Detect physical vs digital
  const isPhysical = lowercaseText.includes("in person") || 
                     lowercaseText.includes("physical") || 
                     lowercaseText.includes("meetup") ||
                     lowercaseText.includes("local");

  const itemType = isPhysical ? "physical" : "digital";

  // Determine intent
  if (lowercaseText.includes("propose") || lowercaseText.includes("proposal") || lowercaseText.includes("vote")) {
    return {
      intent: "CREATE_PROPOSAL",
      params: { amount, recipient, taskDescription: extractDescription(text) }
    };
  }

  if (lowercaseText.includes("escrow") || lowercaseText.includes("buy") || lowercaseText.includes("handshake")) {
    return {
      intent: "CREATE_ESCROW",
      params: { amount, recipient, itemType, taskDescription: extractDescription(text) }
    };
  }

  if (lowercaseText.includes("pay") || lowercaseText.includes("send") || lowercaseText.includes("transfer")) {
    // If it's a small amount, we can assume direct spend, otherwise default to escrow
    const isDirect = amount !== undefined && amount <= 20;
    return {
      intent: isDirect ? "DIRECT_SPEND" : "CREATE_ESCROW",
      params: { amount, recipient, itemType, taskDescription: extractDescription(text) }
    };
  }

  return { intent: "UNKNOWN", params: {} };
}

function extractDescription(text: string): string {
  // Simple heuristic: look for "for <text>" or "to <text>" after the amount or recipient
  const forMatch = text.match(/for\s+(.+)$/i);
  if (forMatch) return forMatch[1].trim();

  const toMatch = text.match(/(?:buy|pay)\s+(?:from|to\s+)?(?:@\w+|0x[a-f0-9]+)?\s*(.+)$/i);
  if (toMatch) return toMatch[1].trim();

  return "ArcHandshake Deal";
}
