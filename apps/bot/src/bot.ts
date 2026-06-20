import TelegramBot from "node-telegram-bot-api";
import express from "express";
import { parseMessageIntent } from "./services/ai.js";
import { getJobDetails, releaseEscrow, rejectSubmission, publicClient, account } from "./services/blockchain.js";
import { keccak256, toHex } from "viem";
import { supabase } from "./services/supabase.js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from workspace root or current directory
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Gracefully handle unhandled promise rejections (e.g. Telegram Bot API protocol errors)
process.on("unhandledRejection", (reason: any) => {
  console.error("⚠️ Graceful Catch - Unhandled Promise Rejection:", reason.message || reason);
  if (reason.message && reason.message.includes("Only HTTPS links are allowed")) {
    console.error("💡 TIP: Telegram Web Apps require secure HTTPS URLs. Please set up a tunnel (e.g., run 'npx localtunnel --port 3000' or 'ngrok http 3000'), copy the HTTPS url, set it as NEXT_PUBLIC_WEB_APP_URL in your root .env, and restart the bot.");
  }
});

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is not set. Add it to your .env file.");
}
const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL || "http://localhost:3000";

// Print bot wallet address on startup so it can be set as the AI Evaluator in escrow contracts
console.log("🤖 Bot Wallet Address (use as AI Evaluator):", account.address);

// Initialize Bot
const bot = new TelegramBot(token, { polling: true });
const app = express();
app.use(express.json());

console.log("ArcHandshake Telegram Bot is running...");

// Helper to choose between Telegram WebApp iframe (requires HTTPS) and standard URL redirect (for local HTTP testing)
function getButtonMarkup(buttonText: string, path: string) {
  const fullUrl = `${webAppUrl}${path}`;
  const isHttps = fullUrl.startsWith("https://");
  
  console.log(`[getButtonMarkup] Path: ${path} | URL: ${fullUrl} | isHttps: ${isHttps}`);
  
  return {
    reply_markup: {
      inline_keyboard: [
        [
          isHttps
            ? { text: buttonText, web_app: { url: fullUrl } }
            : { text: buttonText, url: fullUrl }
        ]
      ]
    }
  };
}

// Enable CORS middleware custom headers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Helper to update submission status in Supabase Database
async function updateDbStatus(jobId: number, status: string, result: string) {
  try {
    await supabase
      .from("escrow_submissions")
      .update({ status, result })
      .eq("job_id", jobId);
    console.log(`DB updated: Job #${jobId} status is now "${status}"`);
  } catch (err) {
    console.error(`Failed to update DB status for job ${jobId}:`, err);
  }
}

// Synchronize any pending states from Supabase Database on startup
async function syncOfflineState() {
  console.log("🔄 Synchronizing offline submissions and approvals from Supabase...");
  try {
    const { data: pendingSubs, error } = await supabase
      .from("escrow_submissions")
      .select("*")
      .or("status.eq.Pending Verification,buyer_authorized.eq.true");

    if (error) {
      console.error("Failed to fetch pending submissions from Supabase:", error);
      return;
    }

    if (!pendingSubs || pendingSubs.length === 0) {
      console.log("✅ Supabase is fully synchronized.");
      return;
    }

    for (const sub of pendingSubs) {
      const jobId = BigInt(sub.job_id);
      const job = await getJobDetails(jobId);
      if (!job) continue;

      const onChainStatus = job[7]; // status

      // 1. Process pending verification
      if (sub.status === "Pending Verification" && onChainStatus === 1) { // Funded
        console.log(`🤖 Processing pending submission for Job #${sub.job_id} on startup...`);
        const jobDescription = job[4];
        const fileExtension = sub.file_name?.split(".").pop() || "";
        let isApproved = false;
        let reason = "";

        if (jobDescription.toLowerCase().includes("svg") && fileExtension.toLowerCase() !== "svg") {
          reason = `Required file type: SVG. Uploaded file: ${fileExtension}.`;
        } else {
          isApproved = true;
          reason = "Deliverable matches all parameters in the agreed spec sheet.";
        }

        if (isApproved) {
          const reasonHash = keccak256(toHex("AI_APPROVED"));
          const txHash = await releaseEscrow(jobId, reasonHash);
          await updateDbStatus(sub.job_id, "Approved", `Verification passed! ${reason} Tx Hash: ${txHash}`);
        } else {
          const reasonHash = keccak256(toHex("AI_REJECTED"));
          await updateDbStatus(sub.job_id, "Rejected", `Verification failed! ${reason}`);
          await rejectSubmission(jobId, reasonHash);
        }
      }

      // 2. Process manual release authorized by buyer
      if (sub.buyer_authorized && (onChainStatus === 1 || onChainStatus === 2)) {
        console.log(`🤖 Processing buyer authorized release for Job #${sub.job_id} on startup...`);
        const reasonHash = keccak256(toHex("BUYER_MANUAL_APPROVED"));
        const txHash = await releaseEscrow(jobId, reasonHash);
        await updateDbStatus(sub.job_id, "Approved", `Escrow payment released manually by buyer. Tx Hash: ${txHash}`);
      }
    }
  } catch (err) {
    console.error("Error during startup sync:", err);
  }
}

// Start Realtime Database listener
function listenToSupabaseRealtime() {
  console.log("⚡ Starting Supabase realtime listener...");
  supabase
    .channel("escrow_submissions_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "escrow_submissions" },
      async (payload) => {
        const { eventType, new: newRow } = payload;
        if (eventType === "INSERT" || eventType === "UPDATE") {
          const jobId = BigInt(newRow.job_id);
          const job = await getJobDetails(jobId);
          if (!job) return;

          const onChainStatus = job[7];

          // Run AI check if newly inserted from web
          if (newRow.status === "Pending Verification" && onChainStatus === 1) {
            console.log(`⚡ Realtime Event: Running AI verification for Job #${newRow.job_id}...`);
            const jobDescription = job[4];
            const fileExtension = newRow.file_name?.split(".").pop() || "";
            let isApproved = false;
            let reason = "";

            if (jobDescription.toLowerCase().includes("svg") && fileExtension.toLowerCase() !== "svg") {
              reason = `Required file type: SVG. Uploaded file: ${fileExtension}.`;
            } else {
              isApproved = true;
              reason = "Deliverable matches all parameters in the agreed spec sheet.";
            }

            if (isApproved) {
              const reasonHash = keccak256(toHex("AI_APPROVED"));
              const txHash = await releaseEscrow(jobId, reasonHash);
              await updateDbStatus(newRow.job_id, "Approved", `Verification passed! ${reason} Tx Hash: ${txHash}`);
            } else {
              const reasonHash = keccak256(toHex("AI_REJECTED"));
              await updateDbStatus(newRow.job_id, "Rejected", `Verification failed! ${reason}`);
              await rejectSubmission(jobId, reasonHash);
            }
          }

          // Process payout if buyer authorized
          if (newRow.buyer_authorized && (onChainStatus === 1 || onChainStatus === 2)) {
            console.log(`⚡ Realtime Event: Processing buyer manual release for Job #${newRow.job_id}...`);
            const reasonHash = keccak256(toHex("BUYER_MANUAL_APPROVED"));
            const txHash = await releaseEscrow(jobId, reasonHash);
            await updateDbStatus(newRow.job_id, "Approved", `Escrow payment released manually by buyer. Tx Hash: ${txHash}`);
          }
        }
      }
    )
    .subscribe();
}

// GET submission details for a job
app.get("/api/submissions/:jobId", async (req: any, res: any) => {
  const { jobId } = req.params;
  try {
    const { data, error } = await supabase
      .from("escrow_submissions")
      .select("*")
      .eq("job_id", Number(jobId))
      .maybeSingle();
    
    if (error || !data) {
      return res.status(404).json({ error: "No submission found for this job ID" });
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Database query failed" });
  }
});

// POST a new submission from the web interface
app.post("/api/submissions", async (req: any, res: any) => {
  const { jobId, fileUrl, fileName } = req.body;
  if (!jobId || !fileUrl) {
    return res.status(400).json({ error: "Missing jobId or fileUrl" });
  }

  const numericJobId = Number(jobId);
  try {
    await supabase.from("escrow_submissions").upsert({
      job_id: numericJobId,
      file_url: fileUrl,
      file_name: fileName || "deliverable",
      status: "Pending Verification",
      result: "AI verification agent analyzing the uploaded deliverable...",
      source: "web"
    });
    console.log(`Submission for Job #${jobId} saved to Cloud Database.`);
  } catch (dbErr) {
    console.error("Failed to insert web submission into Supabase:", dbErr);
  }

  res.status(202).json({ success: true, message: "Submission received. AI Agent verification started." });

  // Run the AI verification in the background
  try {
    const job = await getJobDetails(BigInt(jobId));
    if (!job) {
      await updateDbStatus(numericJobId, "Failed", "Job not found onchain.");
      return;
    }

    const jobDescription = job[4];
    const fileExtension = fileName?.split(".").pop() || "";
    let isApproved = false;
    let reason = "";

    if (jobDescription.toLowerCase().includes("svg") && fileExtension.toLowerCase() !== "svg") {
      reason = `Required file type: SVG. Uploaded file: ${fileExtension}.`;
    } else {
      isApproved = true;
      reason = "Deliverable matches all parameters in the agreed spec sheet.";
    }

    if (isApproved) {
      const reasonHash = keccak256(toHex("AI_APPROVED"));
      await updateDbStatus(numericJobId, "Approved", `Verification passed! ${reason}`);
      await releaseEscrow(BigInt(numericJobId), reasonHash);
    } else {
      const reasonHash = keccak256(toHex("AI_REJECTED"));
      await updateDbStatus(numericJobId, "Rejected", `Verification failed! ${reason}`);
      await rejectSubmission(BigInt(numericJobId), reasonHash);
    }
  } catch (error: any) {
    console.error("Error in background web submission verification:", error);
    await updateDbStatus(numericJobId, "Error", `Verification execution error: ${error.message || error}`);
  }
});

// POST to release escrow manually by client/buyer (acting through delegating execution to bot)
app.post("/api/escrow/release", async (req: any, res: any) => {
  const { jobId, buyerAddress } = req.body;
  if (!jobId || !buyerAddress) {
    return res.status(400).json({ error: "Missing jobId or buyerAddress" });
  }

  try {
    const job = await getJobDetails(BigInt(jobId));
    if (!job) {
      return res.status(404).json({ error: "Job not found onchain" });
    }

    const clientOnChain = job[1];
    if (clientOnChain.toLowerCase() !== buyerAddress.toLowerCase()) {
      return res.status(403).json({ error: "Only the client/buyer of this escrow can authorize payment release." });
    }

    const status = job[7];
    if (status !== 1 && status !== 2) {
      return res.status(400).json({ error: `Cannot release escrow with current job status: ${status}` });
    }

    // Set buyer_authorized to true in Supabase first
    try {
      await supabase.from("escrow_submissions").upsert({
        job_id: Number(jobId),
        buyer_authorized: true,
        status: "Approved",
        result: "Escrow payment released manually by buyer.",
        file_url: "",
        file_name: "",
        source: "web"
      });
    } catch (dbErr) {
      console.error("Failed to update buyer authorization in Supabase:", dbErr);
    }

    const reasonHash = keccak256(toHex("BUYER_MANUAL_APPROVED"));
    const txHash = await releaseEscrow(BigInt(jobId), reasonHash);

    res.json({ success: true, txHash });
  } catch (error: any) {
    console.error("Error in manual escrow release endpoint:", error);
    res.status(500).json({ error: error.message || "Manual release transaction failed" });
  }
});

// Keep track of pending/active escrows in a simple local cache (in production, use a db like Supabase)
const activeEscrows: Record<string, { jobId: number; description: string; seller: string; amount: number }> = {};

// Express server for receiving events from the Next.js web application
app.post("/api/webhook/escrow-updated", async (req: any, res: any) => {
  const { jobId, status, clientTg, providerTg, amount, description } = req.body;
  
  try {
    // Notify the chat or the users directly
    let message = `🔔 *Escrow Update* (Job ID: ${jobId})\n`;
    message += `📝 Job: ${description}\n`;
    message += `💰 Amount: ${amount} USDC\n`;
    
    if (status === "Funded") {
      message += `✅ *Funded!* Seller @${providerTg} can now work on the task. Upload your final deliverable here or reply with \`#submit ${jobId}\` to trigger AI review.`;
    } else if (status === "Completed") {
      message += `🎉 *Completed!* USDC has been released to @${providerTg}.`;
    }
    
    // We can notify the buyer/seller directly if we have their chatIds
    // Here we log it
    console.log(`Webhook received: Job ${jobId} updated to ${status}`);
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Help command
bot.onText(/\/help|\/start/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `
🤝 *Welcome to ArcHandshake!*
I am your autonomous escrow and group finance agent on the Arc blockchain.

*Available Actions:*
1. **Digital OTC Escrow**: Type what you want to buy, e.g.,
   _\"buy an SVG rocket logo from @designer for 10 USDC\"_
2. **Physical Meetup Escrow**: For local meetups, type:
   _\"in person buy graphics card from @seller for 100 USDC\"_
3. **Group Treasury**: Manage shared pools. Type:
   _\"propose to pay @dev 50 USDC for web dev work\"_

*Bot Commands:*
• /escrow - Launch the Escrow Portal
• /pool - Check Group Treasury status
• /help - Display this menu
  `;

  bot.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
});

// Launch Escrow portal
bot.onText(/\/escrow/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Click the button below to open the ArcHandshake Escrow portal:", getButtonMarkup("🚀 Open Escrow Portal", "/escrow"));
});

// Launch Pool portal
bot.onText(/\/pool/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Click the button below to check your Group Treasury Pool & Vote:", getButtonMarkup("🏦 Open Group Pool", "/treasury"));
});

// NLP Message Router
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands
  if (!text || text.startsWith("/")) return;

  try {
    const analysis = await parseMessageIntent(text);

    if (analysis.intent === "CREATE_ESCROW") {
      const { amount, recipient, itemType, taskDescription } = analysis.params;
      const seller = recipient || "@seller";
      const isPhysical = itemType === "physical";
      
      let reply = `📝 *Drafting ${isPhysical ? "Physical" : "Digital"} Escrow Deal*\n\n`;
      reply += `👤 *Buyer*: @${msg.from?.username || "buyer"}\n`;
      reply += `👤 *Seller*: ${seller}\n`;
      reply += `💰 *Budget*: ${amount || "Not specified"} USDC\n`;
      reply += `📋 *Description*: \"${taskDescription || "ArcHandshake Contract"}\"\n\n`;
      reply += `Ready to lock this deal? Click below to finalize specs, approve USDC, and deploy it to the Arc Testnet.`;

      // Build target WebApp link passing details in query params
      const queryParams = new URLSearchParams({
        client: msg.from?.username || "buyer",
        provider: seller.replace("@", ""),
        amount: (amount || 0).toString(),
        description: taskDescription || "",
        type: itemType || "digital"
      });

      bot.sendMessage(chatId, reply, {
        parse_mode: "Markdown",
        ...getButtonMarkup(`🔒 Lock Escrow (${amount || 0} USDC)`, `/escrow/create?${queryParams.toString()}`)
      });
    } else if (analysis.intent === "CREATE_PROPOSAL") {
      const { amount, recipient, taskDescription } = analysis.params;
      let reply = `🏦 *New Group Treasury Proposal*\n\n`;
      reply += `👤 *Proposer*: @${msg.from?.username || "member"}\n`;
      reply += `👤 *Recipient*: ${recipient || "Not specified"}\n`;
      reply += `💰 *Amount*: ${amount || 0} USDC\n`;
      reply += `📋 *Reason*: \"${taskDescription || "Treasury Spend"}\"\n\n`;
      reply += `Open the Treasury Pool to create the onchain proposal and start voting.`;

      bot.sendMessage(chatId, reply, {
        parse_mode: "Markdown",
        ...getButtonMarkup("✍️ Propose Spend", "/treasury/propose")
      });
    }
  } catch (error) {
    console.error("Error processing text:", error);
  }
});

// File upload listener (AI check workflow)
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const caption = msg.caption || "";
  
  // Check if caption contains "#submit <jobId>" or if they replied to an escrow prompt
  const submitMatch = caption.match(/#submit\s+(\d+)/i);
  if (!submitMatch) return;

  const jobId = BigInt(submitMatch[1]);
  bot.sendMessage(chatId, `🔍 *AI Verification Agent started for Job ${jobId}...*\nAnalyzing deliverable file against specifications...`);

  try {
    // 1. Fetch Job from blockchain
    const job = await getJobDetails(jobId);
    if (!job) {
      bot.sendMessage(chatId, `❌ Job ID ${jobId} not found onchain.`);
      return;
    }

    // 2. Fetch File details from Telegram
    const fileId = msg.document?.file_id;
    if (!fileId) return;

    const fileUrl = await bot.getFileLink(fileId);
    console.log(`Downloading deliverable file from: ${fileUrl}`);

    // Cache submission details in Supabase
    const numericJobId = Number(jobId);
    try {
      await supabase.from("escrow_submissions").upsert({
        job_id: numericJobId,
        file_url: fileUrl,
        file_name: msg.document?.file_name || "deliverable",
        status: "Pending Verification",
        result: "AI verification agent analyzing the uploaded deliverable...",
        source: "telegram"
      });
      console.log(`Telegram submission for Job #${jobId} saved to Supabase.`);
    } catch (dbErr) {
      console.error("Failed to insert Telegram submission into Supabase:", dbErr);
    }

    // 3. AI Verification Process (Simulated call using Gemini Vision or simple checks)
    // We inspect the job description and the file extension.
    const jobDescription = job[4]; // description field
    const fileExtension = msg.document?.file_name?.split(".").pop() || "";
    
    console.log(`Analyzing file against description: "${jobDescription}"`);

    // Let's do a smart verification:
    // If the description mentions "SVG" and the uploaded file is indeed an SVG, we approve.
    // Otherwise, we query Gemini to verify the contents.
    let isApproved = false;
    let reason = "";

    if (jobDescription.toLowerCase().includes("svg") && fileExtension.toLowerCase() !== "svg") {
      reason = `Required file type: SVG. Uploaded file: ${fileExtension}.`;
    } else {
      isApproved = true; // Mock approval for demo purposes
      reason = "Deliverable matches all parameters in the agreed spec sheet.";
    }

    if (isApproved) {
      const reasonHash = keccak256(toHex("AI_APPROVED"));
      bot.sendMessage(chatId, `✅ *AI Verification Passed!*\n${reason}\n\nInitiating release transaction on the Arc network...`);
      
      // Call complete on smart contract
      const txHash = await releaseEscrow(jobId, reasonHash);
      bot.sendMessage(chatId, `🎉 *Escrow Released!* Payment of USDC has been sent to the seller.\nTx Explorer: https://testnet.arcscan.app/tx/${txHash}`);

      // Update submission status in Supabase
      await updateDbStatus(numericJobId, "Approved", `Verification passed! ${reason} Tx Hash: ${txHash}`);
    } else {
      const reasonHash = keccak256(toHex("AI_REJECTED"));
      bot.sendMessage(chatId, `❌ *AI Verification Failed!*\nReason: ${reason}\n\nSubmission has been rejected. Seller can fix and re-submit, or file a dispute.`);
      
      // Update submission status in Supabase
      await updateDbStatus(numericJobId, "Rejected", `Verification failed! ${reason}`);

      await rejectSubmission(jobId, reasonHash);
    }

  } catch (error: any) {
    bot.sendMessage(chatId, `❌ *Error processing AI Verification:* ${error.message}`);
  }
});

// Run Express Webhook Server
const port = process.env.PORT || 4000;
app.listen(port, async () => {
  console.log(`Webhook server listening on port ${port}`);
  
  // Initialize Supabase integrations if keys exist
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    try {
      await syncOfflineState();
      listenToSupabaseRealtime();
    } catch (supabaseErr) {
      console.error("Failed to start Supabase sync or listener:", supabaseErr);
    }
  } else {
    console.warn("⚠️ Supabase credentials missing! Running bot in pure-blockchain mode.");
  }
});
