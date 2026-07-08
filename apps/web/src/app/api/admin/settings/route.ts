import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAISettings } from "@/lib/adminSettings";

export async function GET(req: NextRequest) {
  try {
    const settings = getAISettings();
    const rawKey = settings.apiKey;
    
    // Obfuscate key for response payload safety
    let obfuscated = "";
    if (rawKey) {
      obfuscated = rawKey.length > 10
        ? `${rawKey.substring(0, 6)}...${rawKey.substring(rawKey.length - 4)}`
        : "Configured (Hidden)";
    }

    return NextResponse.json({
      aiProvider: settings.aiProvider,
      modelName: settings.modelName,
      apiKey: obfuscated,
      customBaseUrl: settings.customBaseUrl || ""
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { aiProvider, apiKey, modelName, customBaseUrl } = body;

    const existing = getAISettings();

    // Determine final API key
    let finalApiKey = existing.apiKey;
    if (apiKey && apiKey.trim() && !apiKey.includes("...") && apiKey !== "Configured (Hidden)") {
      finalApiKey = apiKey.trim();
    }

    const payload = {
      aiProvider: aiProvider || existing.aiProvider,
      apiKey: finalApiKey,
      modelName: modelName || existing.modelName,
      customBaseUrl: customBaseUrl !== undefined ? customBaseUrl.trim() : (existing.customBaseUrl || "")
    };

    const filePath = path.join(process.cwd(), "admin_settings.json");
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    console.log(`✅ System settings updated via Admin Panel. Provider: ${payload.aiProvider}, Model: ${payload.modelName}`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
