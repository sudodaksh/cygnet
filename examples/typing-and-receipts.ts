import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

// Show a typing indicator while "thinking", then reply
// Note: both parties must have typing indicators enabled in
// Signal > Settings > Privacy > Typing indicators for this to show.
bot.command("slow", async (ctx) => {
  await ctx.typing();
  await new Promise((r) => setTimeout(r, 3000));
  await ctx.typing(true); // stop typing
  await ctx.reply("Done thinking!");
});

// Log when someone starts or stops typing
// Note: both parties must have typing indicators enabled in
// Signal > Settings > Privacy > Typing indicators for these to arrive.
bot.on("typing", (ctx) => {
  const action = ctx.typingMessage.action; // "STARTED" | "STOPPED"
  const who = ctx.fromName ?? ctx.sender;
  console.log(`[typing] ${who} ${action === "STARTED" ? "is typing..." : "stopped typing."}`);
});

// Log delivery and read receipts
// Note: read/viewed receipts only arrive if both parties have read receipts
// enabled in Signal > Settings > Privacy > Read receipts.
bot.on("receipt", (ctx) => {
  const r = ctx.receipt;
  const who = ctx.fromName ?? ctx.sender;
  if (r.isDelivery) {
    console.log(`[receipt] Message delivered to ${who} (${r.timestamps.length} message(s))`);
  }
  if (r.isRead) {
    console.log(`[receipt] Message read by ${who}`);
  }
  if (r.isViewed) {
    console.log(`[receipt] Message viewed by ${who}`);
  }
});

bot.catch((err) => {
  console.error("[typing-and-receipts]", err.error);
});

bot.start().catch(console.error);
