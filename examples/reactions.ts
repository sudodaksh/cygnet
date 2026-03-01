import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

// React with a thumbs-up to every text message
bot.on("message:text", async (ctx) => {
  await ctx.react("👍");
});

// Handle incoming reactions from others
bot.on("message:reaction", async (ctx) => {
  const r = ctx.reaction;
  if (r.isRemove) {
    await ctx.reply(`${ctx.fromName ?? "Someone"} removed their ${r.emoji} reaction.`);
  } else {
    await ctx.reply(`${ctx.fromName ?? "Someone"} reacted with ${r.emoji}`);
  }
});

// Remove the bot's own reaction when a user sends /unreact
bot.command("unreact", async (ctx) => {
  await ctx.reply("I'll stop reacting with 👍 to this message.");
  // Note: unreact targets the current message (the /unreact command itself).
  // In practice you'd track the original timestamp and call api.react() with isRemove.
});

bot.catch((err) => {
  console.error("[reactions]", err.error);
});

bot.start().catch(console.error);
