const express = require("express");
const app = express();
app.use(express.json());

// ============================================
// CONFIGURATION - FILL THESE IN
// ============================================
const CONFIG = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here",
  GHL_API_KEY: process.env.GHL_API_KEY || "your-ghl-api-key-here",
  BOOKING_LINK: process.env.BOOKING_LINK || "https://your-booking-link-here.com",
  YOUR_NAME: process.env.YOUR_NAME || "Your Name",
  PORT: process.env.PORT || 3000,
};

// ============================================
// CONVERSATION MEMORY (stores last 10 messages per contact)
// ============================================
const conversationHistory = {};

function getHistory(contactId) {
  if (!conversationHistory[contactId]) {
    conversationHistory[contactId] = [];
  }
  return conversationHistory[contactId];
}

function addToHistory(contactId, role, content) {
  if (!conversationHistory[contactId]) {
    conversationHistory[contactId] = [];
  }
  conversationHistory[contactId].push({ role, content });
  // Keep only last 10 messages to save tokens
  if (conversationHistory[contactId].length > 10) {
    conversationHistory[contactId] = conversationHistory[contactId].slice(-10);
  }
}

// Clean up old conversations every 24 hours
const conversationTimestamps = {};
setInterval(() => {
  const now = Date.now();
  for (const contactId in conversationTimestamps) {
    // Remove conversations older than 48 hours
    if (now - conversationTimestamps[contactId] > 48 * 60 * 60 * 1000) {
      delete conversationHistory[contactId];
      delete conversationTimestamps[contactId];
    }
  }
}, 60 * 60 * 1000); // Check every hour

// ============================================
// THE SYSTEM PROMPT (the brain of your AI setter)
// ============================================
function getSystemPrompt() {
  return `You are a friendly, confident appointment setter named ${CONFIG.YOUR_NAME}. You help mortgage brokers get 30-40+ qualified loan applications per month through a proprietary borrower acquisition system.

RULES YOU MUST FOLLOW:
- Keep EVERY reply to 2-3 sentences MAX. You are texting via SMS, not writing emails. Be concise.
- Your ONLY goal is to get them to book a call. Do not explain the full system in detail. Do not give pricing.
- Sound human and natural. Use casual texting language. No corporate speak. No emojis overload.
- NEVER say "Facebook ads", "paid ads", "leads", "ad campaign", or "advertising". ALWAYS say "loan applications", "qualified borrowers", "borrower acquisition system", or "our system".
- Match their energy. If they text short, you text short. If they seem formal, be slightly more professional.

RESPONSES FOR COMMON SITUATIONS:

When they ask HOW IT WORKS:
"I built a system that puts your brokerage in front of borrowers actively looking for FHA/VA/Conventional loans in your area. They fill out an application directly for you — not shared with anyone else. Easier to show you than explain over text, grab a time here: ${CONFIG.BOOKING_LINK}"

When they ask about COST/PRICING:
"It depends on your market area and the volume you want — that's exactly what we cover on the call. Takes 10 min. Here's my link: ${CONFIG.BOOKING_LINK}"

When they say NOT INTERESTED:
"No worries at all. If you ever want to scale your applications, just text me back. Good luck!" — Then STOP responding. Do not push further.

When they say SEND ME MORE INFO:
"I could send you a generic PDF but honestly every market is different. It takes 10 minutes on a call for me to pull up your specific area and show you the numbers. Here's my link: ${CONFIG.BOOKING_LINK}"

When they ask WHO IS THIS / HOW DID YOU GET MY NUMBER:
"I'm ${CONFIG.YOUR_NAME}, I work with mortgage brokers helping them fill their pipeline with qualified loan applications. Came across your info and thought it'd be worth reaching out. Happy to jump on a quick call if you're open to it: ${CONFIG.BOOKING_LINK}"

When they say YES / agree to a call:
"Awesome! Grab a time that works for you here: ${CONFIG.BOOKING_LINK} — Looking forward to it!"

When they ask for PROOF/RESULTS:
"Just helped a broker pull in 40+ qualified applications last month at about $12 per application. Happy to walk you through the specifics on a quick call — ${CONFIG.BOOKING_LINK}"

When they say MAYBE / NOT RIGHT NOW / BUSY:
"Totally understand. Tell you what — here's my calendar link. Whenever you're ready, even if it's a few weeks from now, grab a time: ${CONFIG.BOOKING_LINK}"

When they ask if this is AUTOMATED / A BOT:
"Ha no this is ${CONFIG.YOUR_NAME}. I text a lot of brokers so I get why you'd ask. Happy to hop on a quick call if you want to chat: ${CONFIG.BOOKING_LINK}"

IMPORTANT:
- Never argue with objections. Acknowledge and redirect.
- Never be pushy or desperate.
- If someone is clearly hostile or tells you to stop, say "Got it, no worries. Have a good one!" and stop.
- Always try to include the booking link when steering toward a meeting.
- You have memory of the conversation. Use the prospect's name naturally. Reference what they said earlier if relevant.`;
}

// ============================================
// CALL CLAUDE API
// ============================================
async function getClaudeResponse(contactId, contactName, message) {
  // Add the prospect's message to history
  addToHistory(contactId, "user", `Prospect ${contactName} says: ${message}`);
  conversationTimestamps[contactId] = Date.now();

  const history = getHistory(contactId);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CONFIG.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: getSystemPrompt(),
        messages: history,
      }),
    });

    const data = await response.json();

    if (data.content && data.content[0] && data.content[0].text) {
      const reply = data.content[0].text;
      // Add Claude's reply to history
      addToHistory(contactId, "assistant", reply);
      return reply;
    } else {
      console.error("Unexpected Claude API response:", JSON.stringify(data));
      return null;
    }
  } catch (error) {
    console.error("Claude API error:", error);
    return null;
  }
}

// ============================================
// SEND SMS BACK THROUGH GHL
// ============================================
async function sendGHLReply(contactId, message) {
  try {
    const response = await fetch(
      "https://services.leadconnectorhq.com/conversations/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.GHL_API_KEY}`,
          Version: "2021-04-15",
        },
        body: JSON.stringify({
          type: "SMS",
          contactId: contactId,
          message: message,
        }),
      }
    );

    const data = await response.json();
    console.log(`SMS sent to ${contactId}:`, message);
    return data;
  } catch (error) {
    console.error("GHL API error:", error);
    return null;
  }
}

// ============================================
// WEBHOOK ENDPOINT (GHL sends messages here)
// ============================================
app.post("/webhook/ghl", async (req, res) => {
  console.log("Incoming webhook:", JSON.stringify(req.body));

  // Extract data from GHL webhook
  // GHL sends different field names depending on your workflow setup
  const contactId = req.body.contactId || req.body.contact_id;
  const contactName =
    req.body.contactName ||
    req.body.contact_name ||
    req.body.firstName ||
    req.body.first_name ||
    "there";
  const message =
    req.body.message || req.body.body || req.body.text || req.body.smsBody;

  // Validate we have what we need
  if (!contactId || !message) {
    console.error("Missing contactId or message in webhook data");
    console.error("Received fields:", Object.keys(req.body));
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Respond to GHL immediately (so it doesn't timeout)
  res.status(200).json({ status: "received" });

  // Get Claude's response
  const reply = await getClaudeResponse(contactId, contactName, message);

  if (reply) {
    // Check if the prospect said stop/unsubscribe
    const stopWords = ["stop", "unsubscribe", "opt out", "remove me", "do not text"];
    const isStop = stopWords.some((word) =>
      message.toLowerCase().includes(word)
    );

    if (isStop) {
      console.log(`Contact ${contactId} requested stop. Not replying.`);
      return;
    }

    // Add a small random delay (2-8 seconds) so it doesn't feel instant/robotic
    const delay = Math.floor(Math.random() * 6000) + 2000;
    setTimeout(async () => {
      await sendGHLReply(contactId, reply);
    }, delay);
  }
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "GHL Claude Bot is active",
    uptime: process.uptime(),
  });
});

// ============================================
// MANUAL TEST ENDPOINT (test without GHL)
// ============================================
app.post("/test", async (req, res) => {
  const { message, name } = req.body;
  const testContactId = "test-contact-123";
  const reply = await getClaudeResponse(testContactId, name || "Test Broker", message);
  res.json({ reply });
});

// ============================================
// START SERVER
// ============================================
app.listen(CONFIG.PORT, () => {
  console.log(`
  ====================================
  GHL Claude Bot is LIVE
  Port: ${CONFIG.PORT}
  Webhook URL: http://localhost:${CONFIG.PORT}/webhook/ghl
  Test URL: http://localhost:${CONFIG.PORT}/test
  ====================================
  `);
});
