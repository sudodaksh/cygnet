import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

// Send a message, then edit it after 2 seconds
bot.command("editable", async (ctx) => {
  const result = await ctx.api.send(ctx.chat, "This message will be edited...");
  await new Promise((r) => setTimeout(r, 2000));
  await ctx.api.editMessage(ctx.chat, result.timestamp, "This message was edited!");
});

// Handle when someone edits their message
bot.on("edit_message", async (ctx) => {
  const em = ctx.editMessage;
  const newText = em.dataMessage.message ?? "(no text)";
  await ctx.reply(`You edited your message to: "${newText}"`);
});

// Delete the bot's own reply after a delay
bot.command("vanish", async (ctx) => {
  const result = await ctx.api.send(ctx.chat, "This message will self-destruct in 3 seconds...");
  await new Promise((r) => setTimeout(r, 3000));
  await ctx.api.deleteMessage(ctx.chat, result.timestamp);
});

// Log when someone deletes a message (remote delete for everyone)
bot.on("delete_message", (ctx) => {
  const ts = ctx.remoteDeleteTimestamp ?? ctx.deleteMessage?.targetSentTimestamp;
  console.log(`[delete] ${ctx.fromName ?? ctx.sender} deleted message (timestamp: ${ts})`);
});

bot.catch((err) => {
  console.error("[edit-and-delete]", err.error);
});

bot.start().catch(console.error);
