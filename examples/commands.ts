import { Bot } from "../index.ts";

const bot = new Bot({
  signalService: process.env.SIGNAL_SERVICE ?? "localhost:8080",
  phoneNumber: process.env.PHONE_NUMBER ?? "+491234567890",
});

bot.command("start", (ctx) => ctx.reply("Use /help to see the available commands."));

bot.command("help", (ctx) =>
  ctx.reply([
    "Commands:",
    "/help - Show this help",
    "/ping - Health check",
    "/echo <text> - Echo the provided text",
    "/whoami - Show sender details",
  ].join("\n"))
);

bot.command("ping", (ctx) => ctx.reply("pong"));

bot.command("echo", (ctx) => {
  const text = typeof ctx.match === "string" ? ctx.match : "";
  if (!text) {
    return ctx.reply("Usage: /echo <text>");
  }
  return ctx.reply(`Echo: ${text}`);
});

bot.command(["whoami", "id"], (ctx) =>
  ctx.reply([
    `from: ${ctx.from ?? "(hidden)"}`,
    `uuid: ${ctx.fromUuid ?? "(missing)"}`,
    `chat: ${ctx.chat}`,
    `group: ${ctx.isGroup}`,
  ].join("\n"))
);

bot.catch((err) => {
  console.error("[commands]", err.error);
});

bot.start().catch(console.error);
