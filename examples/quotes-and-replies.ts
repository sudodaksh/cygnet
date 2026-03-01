import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

// Quote back any message that contains "quote me"
bot.hears("quote me", async (ctx) => {
  await ctx.quote("Here's your message quoted back!");
});

// When someone replies to any message (theirs, yours, or the bot's), this fires
bot.on("message:quote", async (ctx) => {
  const q = ctx.message.quote;
  if (q) {
    const original = q.text ?? "(no text)";
    await ctx.reply(`You replied to: "${original}"`);
  }
});

// Plain reply (no quote) for everything else
bot.on("message:text", async (ctx) => {
  await ctx.reply(`Got your message: ${ctx.text}`);
});

bot.catch((err) => {
  console.error("[quotes-and-replies]", err.error);
});

bot.start().catch(console.error);
